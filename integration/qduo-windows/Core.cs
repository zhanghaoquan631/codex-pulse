using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace QDuoWindows
{
    // Every diagnostic operation reads metadata only. This class never deletes files,
    // runs commands, reads document contents, or sends a report to a remote service.
    public static class Diagnostics
    {
        private sealed class ScanContext
        {
            public readonly Stopwatch Clock = Stopwatch.StartNew();
            public readonly bool Deep;
            public readonly List<string> Errors = new List<string>();
            public readonly HashSet<string> Running = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            public int Files;
            public bool Truncated;
            public bool Incomplete;
            public ScanContext(bool deep) { Deep = deep; }
            public bool Expired { get { return Clock.ElapsedMilliseconds >= (Deep ? 20000 : 4000) || Files >= (Deep ? 150000 : 20000); } }
            public void Error(string value) { Incomplete = true; if (Errors.Count < 200) Errors.Add(value); }
        }

        public static string Json(object value)
        {
            return new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024, RecursionLimit = 32 }.Serialize(value);
        }

        public static object Parse(string json)
        {
            if (json == null || json.Length > 256 * 1024) throw new ArgumentException("JSON input is too large.");
            return new JavaScriptSerializer { MaxJsonLength = 256 * 1024, RecursionLimit = 16 }.DeserializeObject(json);
        }

        public static Dictionary<string, object> BuildReport(bool deep)
        {
            ScanContext context = new ScanContext(deep);
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["schemaVersion"] = 1;
            result["generatedAt"] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            result["computer"] = Environment.MachineName;
            result["os"] = ReadOs(context);
            result["disks"] = ReadDisks(context);
            result["applications"] = ReadApplications(context);
            result["applicationCoverage"] = "Uninstall registry entries; some Microsoft Store or portable apps may not appear. Estimated sizes are supplied by installers.";
            result["processes"] = ReadProcesses(context);
            result["startup"] = ReadStartup(context);
            result["caches"] = ReadCaches(context);
            result["largeFiles"] = deep ? ReadLargeFiles(context) : new List<Dictionary<string, object>>();
            if (context.Expired) context.Truncated = true;
            if (context.Truncated) context.Error("Scan was truncated by its time or file-count limit. Reported folder sizes are lower bounds.");
            result["errors"] = context.Errors;
            result["scan"] = new Dictionary<string, object> {
                { "deep", deep }, { "durationMs", context.Clock.ElapsedMilliseconds },
                { "complete", !context.Truncated && !context.Incomplete }, { "examinedFiles", context.Files },
                { "readsFileContents", false }, { "deletesFiles", false },
                { "sizeMeaning", "Logical file lengths; hard links, compression and inaccessible files can differ from disk allocation." }
            };
            return result;
        }

        private static string ReadOs(ScanContext context)
        {
            try
            {
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    if (key != null)
                    {
                        string name = Convert.ToString(key.GetValue("ProductName"), CultureInfo.InvariantCulture);
                        string build = Convert.ToString(key.GetValue("CurrentBuildNumber"), CultureInfo.InvariantCulture);
                        int number;
                        if (Int32.TryParse(build, out number) && number >= 22000 && name.StartsWith("Windows 10", StringComparison.OrdinalIgnoreCase))
                            name = "Windows 11" + name.Substring("Windows 10".Length);
                        return name + " " + Convert.ToString(key.GetValue("DisplayVersion", key.GetValue("ReleaseId", "")), CultureInfo.InvariantCulture) + " (build " + build + ", " + (Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit") + ")";
                    }
                }
            }
            catch { context.Error("Unable to read Windows version metadata."); }
            return Environment.OSVersion.VersionString;
        }

        private static List<Dictionary<string, object>> ReadDisks(ScanContext context)
        {
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
            try
            {
                foreach (DriveInfo drive in DriveInfo.GetDrives())
                {
                    // A network drive may stall the local overview. Only fixed local drives are examined.
                    if (drive.DriveType != DriveType.Fixed) continue;
                    try
                    {
                        if (!drive.IsReady) continue;
                        result.Add(new Dictionary<string, object> { { "name", drive.Name }, { "totalBytes", drive.TotalSize }, { "freeBytes", drive.AvailableFreeSpace } });
                    }
                    catch { context.Error("Unable to read disk: " + drive.Name); }
                }
            }
            catch { context.Error("Unable to enumerate local disks."); }
            return result;
        }

        private static List<Dictionary<string, object>> ReadApplications(ScanContext context)
        {
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            RegistryHive[] hives = { RegistryHive.LocalMachine, RegistryHive.CurrentUser };
            RegistryView[] views = Environment.Is64BitOperatingSystem ? new[] { RegistryView.Registry64, RegistryView.Registry32 } : new[] { RegistryView.Registry32 };
            foreach (RegistryHive hive in hives)
                foreach (RegistryView view in views)
                {
                    try
                    {
                        using (RegistryKey root = RegistryKey.OpenBaseKey(hive, view))
                        using (RegistryKey key = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"))
                        {
                            if (key == null) continue;
                            foreach (string sub in key.GetSubKeyNames())
                            {
                                if (context.Expired || result.Count >= 2500) { context.Truncated = true; break; }
                                try
                                {
                                    using (RegistryKey app = key.OpenSubKey(sub))
                                    {
                                        if (app == null || Convert.ToString(app.GetValue("SystemComponent", 0), CultureInfo.InvariantCulture) == "1") continue;
                                        string name = Convert.ToString(app.GetValue("DisplayName", ""), CultureInfo.InvariantCulture);
                                        if (String.IsNullOrWhiteSpace(name)) continue;
                                        string version = Convert.ToString(app.GetValue("DisplayVersion", ""), CultureInfo.InvariantCulture);
                                        string publisher = Convert.ToString(app.GetValue("Publisher", ""), CultureInfo.InvariantCulture);
                                        if (!seen.Add(name + "\n" + version + "\n" + publisher)) continue;
                                        long kb = 0;
                                        Int64.TryParse(Convert.ToString(app.GetValue("EstimatedSize", 0), CultureInfo.InvariantCulture), out kb);
                                        result.Add(new Dictionary<string, object> {
                                            { "name", name }, { "version", version }, { "publisher", publisher },
                                            { "estimatedBytes", kb > 0 && kb < Int64.MaxValue / 1024 ? kb * 1024 : 0 },
                                            { "sizeSource", "Windows uninstall registry estimate; zero means unknown." }
                                        });
                                    }
                                }
                                catch { context.Error("Unable to read one installed application record."); }
                            }
                        }
                    }
                    catch { context.Error("Unable to read installed applications from " + hive + "/" + view + "."); }
                }
            // This does not invoke Win32_Product, which can trigger MSI repairs.
            return result.OrderBy(delegate(Dictionary<string, object> item) { return (string)item["name"]; }, StringComparer.OrdinalIgnoreCase).ToList();
        }

        private static List<Dictionary<string, object>> ReadProcesses(ScanContext context)
        {
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
            try
            {
                Process[] processes = Process.GetProcesses();
                foreach (Process process in processes)
                    using (process)
                    {
                        if (context.Expired || result.Count >= 1200) { context.Truncated = true; continue; }
                        try
                        {
                            string name = process.ProcessName;
                            context.Running.Add(name);
                            long memory = 0;
                            double cpu = 0;
                            bool accessible = true;
                            try { memory = process.WorkingSet64; } catch { accessible = false; }
                            try { cpu = process.TotalProcessorTime.TotalSeconds; } catch { accessible = false; }
                            result.Add(new Dictionary<string, object> {
                                { "id", process.Id }, { "name", name }, { "memoryBytes", memory }, { "cpuSeconds", cpu }, { "metricsAccessible", accessible }
                            });
                        }
                        catch { context.Error("A process exited or could not be read during the snapshot."); }
                    }
            }
            catch { context.Error("Unable to enumerate running processes."); }
            return result.OrderByDescending(delegate(Dictionary<string, object> item) { return (long)item["memoryBytes"]; }).ToList();
        }

        private static List<Dictionary<string, object>> ReadStartup(ScanContext context)
        {
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            RegistryHive[] hives = { RegistryHive.LocalMachine, RegistryHive.CurrentUser };
            RegistryView[] views = Environment.Is64BitOperatingSystem ? new[] { RegistryView.Registry64, RegistryView.Registry32 } : new[] { RegistryView.Registry32 };
            foreach (RegistryHive hive in hives)
                foreach (RegistryView view in views)
                    foreach (string suffix in new[] { "Run", "RunOnce" })
                    {
                        try
                        {
                            using (RegistryKey root = RegistryKey.OpenBaseKey(hive, view))
                            using (RegistryKey key = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\" + suffix))
                            {
                                if (key == null) continue;
                                foreach (string name in key.GetValueNames())
                                {
                                    if (context.Expired || result.Count >= 500) { context.Truncated = true; break; }
                                    string command = Convert.ToString(key.GetValue(name, ""), CultureInfo.InvariantCulture);
                                    if (!seen.Add(name + "\n" + command)) continue;
                                    result.Add(new Dictionary<string, object> { { "name", name }, { "command", command }, { "source", hive + "/" + suffix } });
                                }
                            }
                        }
                        catch { context.Error("Unable to read one startup registry location."); }
                    }
            foreach (Environment.SpecialFolder location in new[] { Environment.SpecialFolder.Startup, Environment.SpecialFolder.CommonStartup })
            {
                try
                {
                    string path = Environment.GetFolderPath(location);
                    if (!Directory.Exists(path) || !SafeLocalPath(path)) continue;
                    foreach (string file in Directory.EnumerateFiles(path))
                    {
                        if (context.Expired || result.Count >= 500) { context.Truncated = true; break; }
                        FileInfo item = new FileInfo(file);
                        if ((item.Attributes & FileAttributes.ReparsePoint) != 0) continue;
                        result.Add(new Dictionary<string, object> { { "name", item.Name }, { "command", item.FullName }, { "source", "Startup folder; shortcut contents are not read" } });
                    }
                }
                catch { context.Error("Unable to read a startup folder."); }
            }
            return result;
        }

        private static List<Dictionary<string, object>> ReadCaches(ScanContext context)
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
            AddCache(result, context, "user-temp", "用户临时文件", Path.Combine(local, "Temp"), null);
            AddCache(result, context, "npm-cache", "npm 下载缓存", Path.Combine(local, "npm-cache"), "node");
            AddCache(result, context, "pip-cache", "pip 下载缓存", Path.Combine(local, "pip", "Cache"), "python");
            AddCache(result, context, "uv-cache", "uv 下载缓存", Path.Combine(local, "uv", "cache"), "uv");
            AddBrowserCaches(result, context, Path.Combine(local, "Google", "Chrome", "User Data"), "chrome", "Chrome");
            AddBrowserCaches(result, context, Path.Combine(local, "Microsoft", "Edge", "User Data"), "msedge", "Edge");
            string firefox = Path.Combine(local, "Mozilla", "Firefox", "Profiles");
            if (Directory.Exists(firefox) && SafeLocalPath(firefox))
            {
                try
                {
                    int count = 0;
                    foreach (string profile in Directory.EnumerateDirectories(firefox))
                    {
                        if (++count > 40) { context.Truncated = true; break; }
                        string id = "firefox-" + count.ToString(CultureInfo.InvariantCulture);
                        AddCache(result, context, id, "Firefox 缓存 (" + Path.GetFileName(profile) + ")", Path.Combine(profile, "cache2"), "firefox");
                    }
                }
                catch { context.Error("Unable to enumerate Firefox cache profiles."); }
            }
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            AddCache(result, context, "windows-temp", "Windows 临时文件", Path.Combine(windows, "Temp"), null);
            return result;
        }

        private static void AddBrowserCaches(List<Dictionary<string, object>> result, ScanContext context, string root, string process, string label)
        {
            if (!Directory.Exists(root) || !SafeLocalPath(root)) return;
            try
            {
                int count = 0;
                foreach (string profile in Directory.EnumerateDirectories(root))
                {
                    string name = Path.GetFileName(profile);
                    if (name != "Default" && !name.StartsWith("Profile ", StringComparison.Ordinal)) continue;
                    if (++count > 40) { context.Truncated = true; break; }
                    AddCache(result, context, process + "-" + count + "-cache", label + " 缓存 (" + name + ")", Path.Combine(profile, "Cache"), process);
                    AddCache(result, context, process + "-" + count + "-code", label + " 代码缓存 (" + name + ")", Path.Combine(profile, "Code Cache"), process);
                }
            }
            catch { context.Error("Unable to enumerate " + label + " cache profiles."); }
        }

        private static void AddCache(List<Dictionary<string, object>> result, ScanContext context, string id, string name, string path, string process)
        {
            if (!Directory.Exists(path)) return;
            List<string> errors = new List<string>();
            long bytes = 0;
            long eligible = 0;
            int count = 0;
            bool active = process != null && context.Running.Contains(process);
            bool complete = true;
            DateTime cutoff = DateTime.UtcNow.AddDays(-7);
            ScanFiles(path, context, context.Deep ? 4500 : 1100, delegate(FileInfo file) {
                long size = file.Length;
                bytes += size;
                count++;
                if (!active && file.LastWriteTimeUtc < cutoff) eligible += size;
            }, errors, ref complete);
            if (!complete) context.Incomplete = true;
            result.Add(new Dictionary<string, object> {
                { "id", id }, { "name", name }, { "path", Path.GetFullPath(path) }, { "bytes", bytes },
                { "fileCount", count }, { "eligibleBytes", eligible }, { "errors", errors.Count }, { "errorDetails", errors },
                { "complete", complete }, { "applicationRunning", active },
                { "eligibility", "Known cache files unchanged for at least 7 days; active recognized app caches excluded. Requires local review; no deletion performed." }
            });
        }

        private static List<Dictionary<string, object>> ReadLargeFiles(ScanContext context)
        {
            string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"))
                {
                    if (key != null)
                    {
                        string configured = Convert.ToString(key.GetValue("{374DE290-123F-4565-9164-39C4925E467B}", ""), CultureInfo.InvariantCulture);
                        if (!String.IsNullOrWhiteSpace(configured)) path = Environment.ExpandEnvironmentVariables(configured);
                    }
                }
            }
            catch { context.Error("Unable to resolve the Downloads folder; using its default path."); }
            return ReadLargeFilesAt(path, context);
        }

        private static List<Dictionary<string, object>> ReadLargeFilesAt(string path, ScanContext context)
        {
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
            List<string> errors = new List<string>();
            bool complete = true;
            ScanFiles(path, context, 8000, delegate(FileInfo file) {
                if (file.Length < 100L * 1024 * 1024) return;
                result.Add(new Dictionary<string, object> { { "path", file.FullName }, { "bytes", file.Length } });
                if (result.Count > 1000) result = result.OrderByDescending(delegate(Dictionary<string, object> row) { return (long)row["bytes"]; }).Take(200).ToList();
            }, errors, ref complete);
            foreach (string error in errors) context.Error("Downloads: " + error);
            return result.OrderByDescending(delegate(Dictionary<string, object> row) { return (long)row["bytes"]; }).Take(100).ToList();
        }

        internal static bool SafeLocalPath(string path)
        {
            try
            {
                string full = Path.GetFullPath(path);
                if (full.StartsWith(@"\\", StringComparison.Ordinal) || full.Length < 3 || full[1] != ':') return false;
                if (new DriveInfo(Path.GetPathRoot(full)).DriveType != DriveType.Fixed) return false;
                DirectoryInfo directory = new DirectoryInfo(full);
                while (directory != null)
                {
                    if (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0) return false;
                    directory = directory.Parent;
                }
                return true;
            }
            catch { return false; }
        }

        private static void ScanFiles(string root, ScanContext context, int budgetMs, Action<FileInfo> visit, List<string> errors, ref bool complete)
        {
            if (!SafeLocalPath(root)) { errors.Add("Skipped a remote, inaccessible or reparse-point path."); complete = false; context.Incomplete = true; return; }
            if (!Directory.Exists(root)) return;
            Stopwatch local = Stopwatch.StartNew();
            Stack<string> pending = new Stack<string>();
            pending.Push(root);
            int directories = 0;
            while (pending.Count > 0)
            {
                if (context.Expired || local.ElapsedMilliseconds > budgetMs || directories >= 15000)
                {
                    errors.Add("Truncated by time or item limit; size is a lower bound.");
                    complete = false;
                    context.Truncated = true;
                    break;
                }
                string path = pending.Pop();
                directories++;
                try
                {
                    DirectoryInfo directory = new DirectoryInfo(path);
                    if ((directory.Attributes & FileAttributes.ReparsePoint) != 0) continue;
                    foreach (FileSystemInfo entry in directory.EnumerateFileSystemInfos())
                    {
                        if (context.Expired || local.ElapsedMilliseconds > budgetMs)
                        {
                            errors.Add("Truncated by time or item limit; size is a lower bound.");
                            complete = false;
                            context.Truncated = true;
                            pending.Clear();
                            break;
                        }
                        try
                        {
                            if ((entry.Attributes & FileAttributes.ReparsePoint) != 0) continue;
                            DirectoryInfo child = entry as DirectoryInfo;
                            if (child != null) { pending.Push(child.FullName); continue; }
                            FileInfo file = entry as FileInfo;
                            if (file != null) { context.Files++; visit(file); }
                        }
                        catch { if (errors.Count < 50) errors.Add("Unable to read metadata for: " + entry.FullName); complete = false; context.Incomplete = true; }
                    }
                }
                catch { if (errors.Count < 50) errors.Add("Unable to enumerate: " + path); complete = false; context.Incomplete = true; }
            }
        }
    }

    // A small loopback-only HTTP server avoids HTTP.sys ACL changes or elevation.
    // The token is supplied by the native application and is never returned or logged.
    public sealed class LocalBridge : IDisposable
    {
        private const int MaxHeaderBytes = 16384;
        private const int MaxBodyBytes = 256 * 1024;
        private const string SiteOrigin = "https://codex-pulse-willow-0911.wozhe0196.chatgpt.site";
        private readonly string token;
        private readonly Func<bool, Dictionary<string, object>> report;
        private readonly Action showCleanup;
        private readonly Func<Dictionary<string, object>, Task<string>> action;
        private readonly Func<string, Dictionary<string, object>, Task<object>> service;
        private readonly SemaphoreSlim connections = new SemaphoreSlim(8, 8);
        private readonly SemaphoreSlim diagnosticGate = new SemaphoreSlim(1, 1);
        private readonly CancellationTokenSource cancellation = new CancellationTokenSource();
        private TcpListener listener;
        private Task accepting;
        private bool disposed;
        public int Port { get; private set; }

        public LocalBridge(string token, Func<bool, Dictionary<string, object>> report, Action showCleanup, Func<Dictionary<string, object>, Task<string>> action)
            : this(token, report, showCleanup, action, null) { }

        public LocalBridge(string token, Func<bool, Dictionary<string, object>> report, Action showCleanup, Func<Dictionary<string, object>, Task<string>> action, Func<string, Dictionary<string, object>, Task<object>> service)
        {
            if (String.IsNullOrWhiteSpace(token) || token.Length < 16 || token.Length > 256) throw new ArgumentException("A random native pairing token of 16-256 characters is required.", "token");
            if (report == null) throw new ArgumentNullException("report");
            if (showCleanup == null) throw new ArgumentNullException("showCleanup");
            if (action == null) throw new ArgumentNullException("action");
            this.token = token;
            this.report = report;
            this.showCleanup = showCleanup;
            this.action = action;
            this.service = service;
            Port = 17643;
        }

        public void Start()
        {
            if (disposed) throw new ObjectDisposedException("LocalBridge");
            if (listener != null) return;
            TcpListener candidate = new TcpListener(IPAddress.Loopback, Port);
            candidate.Server.ExclusiveAddressUse = true;
            candidate.Start(32);
            listener = candidate;
            accepting = Task.Run((Func<Task>)AcceptLoop);
        }

        private async Task AcceptLoop()
        {
            while (!cancellation.IsCancellationRequested)
            {
                TcpClient client;
                try { client = await listener.AcceptTcpClientAsync().ConfigureAwait(false); }
                catch (ObjectDisposedException) { break; }
                catch (SocketException) { if (cancellation.IsCancellationRequested) break; else continue; }
                if (!connections.Wait(0)) { client.Close(); continue; }
                Task ignored = Task.Run(async delegate {
                    try { await Handle(client).ConfigureAwait(false); }
                    finally { client.Close(); connections.Release(); }
                });
            }
        }

        private sealed class Request
        {
            public string Method;
            public string Path;
            public string Body;
            public readonly Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        private async Task Handle(TcpClient client)
        {
            string origin = null;
            bool failed = false;
            NetworkStream stream = client.GetStream();
            try
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 5000;
                client.NoDelay = true;
                {
                    Request request = await ReadRequest(stream).ConfigureAwait(false);
                    string host;
                    if (!request.Headers.TryGetValue("Host", out host) || !ValidHost(host))
                    {
                        await Respond(stream, 403, new { error = "Local host header required." }, null).ConfigureAwait(false); return;
                    }
                    string suppliedOrigin;
                    if (request.Headers.TryGetValue("Origin", out suppliedOrigin))
                    {
                        if (!ValidOrigin(suppliedOrigin)) { await Respond(stream, 403, new { error = "Origin is not allowed." }, null).ConfigureAwait(false); return; }
                        origin = suppliedOrigin;
                    }
                    if (request.Method == "OPTIONS")
                    {
                        await Respond(stream, 204, null, origin).ConfigureAwait(false); return;
                    }
                    if (request.Method == "GET" && request.Path == "/health")
                    {
                        await Respond(stream, 200, new { ok = true, name = "QDuo Windows", service = "QDuo Windows", version = "1.2.1", features = new[] { "safe-cleanup", "d-drive-backup", "auto-reconnect", "defender", "file-catalog" } }, origin).ConfigureAwait(false); return;
                    }
                    if (!Authenticated(request)) { await Respond(stream, 401, new { error = "Native pairing token required." }, origin).ConfigureAwait(false); return; }
                    if (request.Method == "GET" && request.Path == "/connection/status")
                    {
                        await Respond(stream, 200, new { ok = true, version = "1.2.1", computer = Environment.MachineName }, origin).ConfigureAwait(false); return;
                    }
                    if (service != null && ServiceRoutes.IsRoute(request.Method, request.Path))
                    {
                        var input = new Dictionary<string, object>();
                        if (request.Method == "POST")
                        {
                            string contentType;
                            if (!request.Headers.TryGetValue("Content-Type", out contentType) || !contentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
                            { await Respond(stream, 415, new { error = "application/json is required." }, origin).ConfigureAwait(false); return; }
                            try { input = Diagnostics.Parse(request.Body) as Dictionary<string, object>; }
                            catch { input = null; }
                        }
                        string problem = ServiceRoutes.Validate(request.Path, input);
                        if (problem != null) { await Respond(stream, 400, new { error = problem }, origin).ConfigureAwait(false); return; }
                        object result = null;
                        string serviceError = null;
                        try
                        {
                            Task<object> work = service(request.Path, input);
                            if (work == null) throw new InvalidOperationException("客户端服务尚未就绪。");
                            if (await Task.WhenAny(work, Task.Delay(180000, cancellation.Token)).ConfigureAwait(false) != work)
                                serviceError = "本机操作尚未结束。请查看执行记录，不要重复提交清理。";
                            else result = await work.ConfigureAwait(false);
                        }
                        catch (ArgumentException ex) { serviceError = ex.Message; }
                        catch (InvalidOperationException ex) { serviceError = ex.Message; }
                        if (serviceError != null)
                        { await Respond(stream, 409, new { error = serviceError.Length <= 512 ? serviceError : serviceError.Substring(0, 512) }, origin).ConfigureAwait(false); return; }
                        await Respond(stream, 200, result, origin).ConfigureAwait(false); return;
                    }
                    bool deep = request.Path == "/scan" && request.Method == "POST";
                    if ((request.Path == "/report" && request.Method == "GET") || deep)
                    {
                        if (!diagnosticGate.Wait(0)) { await Respond(stream, 429, new { error = "A diagnostic scan is already running." }, origin).ConfigureAwait(false); return; }
                        Dictionary<string, object> data;
                        try { data = await Task.Run(delegate { return report(deep); }).ConfigureAwait(false); }
                        finally { diagnosticGate.Release(); }
                        await Respond(stream, 200, data, origin).ConfigureAwait(false); return;
                    }
                    if (request.Method == "POST" && request.Path == "/open-cleanup")
                    {
                        showCleanup();
                        await Respond(stream, 200, new { ok = true, message = "Opened the native review screen. No files were deleted." }, origin).ConfigureAwait(false); return;
                    }
                    if (request.Method == "POST" && request.Path == "/action")
                    {
                        string contentType;
                        if (!request.Headers.TryGetValue("Content-Type", out contentType) || !contentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
                        { await Respond(stream, 415, new { error = "application/json is required." }, origin).ConfigureAwait(false); return; }
                        Dictionary<string, object> input = null;
                        bool invalidJson = false;
                        try { input = Diagnostics.Parse(request.Body) as Dictionary<string, object>; }
                        catch { invalidJson = true; }
                        if (invalidJson) { await Respond(stream, 400, new { error = "Invalid JSON action." }, origin).ConfigureAwait(false); return; }
                        string error = ValidateAction(input);
                        if (error != null) { await Respond(stream, 400, new { error = error }, origin).ConfigureAwait(false); return; }
                        Task<string> work = action(input);
                        if (work == null) throw new InvalidOperationException("The action callback returned no task.");
                        if (await Task.WhenAny(work, Task.Delay(90000, cancellation.Token)).ConfigureAwait(false) != work)
                        { await Respond(stream, 504, new { error = "The native action timed out. Check the desktop application." }, origin).ConfigureAwait(false); return; }
                        string output = await work.ConfigureAwait(false);
                        await Respond(stream, 200, new { ok = true, output = output ?? "" }, origin).ConfigureAwait(false); return;
                    }
                    await Respond(stream, 404, new { error = "Endpoint or method not found." }, origin).ConfigureAwait(false);
                }
            }
            catch (Exception)
            {
                // Error text is deliberately generic: callback exception details can contain
                // API keys, document text, paths or the native token.
                failed = true;
            }
            if (failed)
            {
                try { if (client.Connected) await Respond(stream, 400, new { error = "The local request could not be completed." }, origin).ConfigureAwait(false); }
                catch { }
            }
        }

        private bool ValidHost(string host)
        {
            return String.Equals(host, "127.0.0.1:" + Port, StringComparison.OrdinalIgnoreCase) || String.Equals(host, "localhost:" + Port, StringComparison.OrdinalIgnoreCase);
        }

        private static bool ValidOrigin(string origin)
        {
            if (String.Equals(origin, SiteOrigin, StringComparison.Ordinal)) return true;
            Uri uri;
            if (!Uri.TryCreate(origin, UriKind.Absolute, out uri) || uri.Scheme != "http" || !String.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/" || !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment)) return false;
            if (uri.Host != "127.0.0.1" && uri.Host != "localhost") return false;
            return uri.Port >= 1 && uri.Port <= 65535 && origin == uri.GetLeftPart(UriPartial.Authority);
        }

        private bool Authenticated(Request request)
        {
            string supplied;
            if (request.Headers.TryGetValue("Authorization", out supplied))
            {
                if (!supplied.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;
                supplied = supplied.Substring(7);
            }
            else if (!request.Headers.TryGetValue("X-QDuo-Token", out supplied)) return false;
            int difference = supplied.Length ^ token.Length;
            for (int i = 0; i < token.Length; i++) difference |= token[i] ^ (i < supplied.Length ? supplied[i] : 0);
            return difference == 0;
        }

        private static string ValidateAction(Dictionary<string, object> input)
        {
            if (input == null) return "An action object is required.";
            object value;
            if (!input.TryGetValue("action", out value) || !(value is string)) return "An action name is required.";
            string name = (string)value;
            string[] allowed = { "transform", "ai", "speak", "openURL", "translate", "rewrite", "polish", "summarize", "explain", "search", "copy" };
            if (Array.IndexOf(allowed, name) < 0) return "This action is not supported.";
            string[] keys = { "action", "kind", "name", "operation", "text", "prompt", "url", "language", "targetLanguage" };
            foreach (KeyValuePair<string, object> pair in input)
            {
                if (Array.IndexOf(keys, pair.Key) < 0) return "Unknown action parameter.";
                if (!(pair.Value is string)) return "Action parameters must be strings.";
                int limit = pair.Key == "text" ? 64000 : (pair.Key == "prompt" ? 8000 : (pair.Key == "url" ? 4096 : 128));
                if (((string)pair.Value).Length > limit) return "Action parameter exceeds the size limit.";
            }
            if (input.TryGetValue("kind", out value) && Array.IndexOf(new[] { "ai", "transform", "speak", "openURL" }, (string)value) < 0) return "This action kind is not supported.";
            if (name == "transform")
            {
                string[] operations = { "upper", "lower", "title", "sentence", "camel", "pascal", "snake", "kebab", "trim", "collapseWhitespace", "removeBlankLines", "sortLines", "uniqueLines", "joinLines", "simplified", "traditional", "jsonFormat", "jsonMinify", "urlEncode", "urlDecode", "stripTracking", "count" };
                if (!input.TryGetValue("operation", out value) || Array.IndexOf(operations, (string)value) < 0) return "This text operation is not supported.";
            }
            if (name == "openURL")
            {
                if (!input.TryGetValue("url", out value)) return "A URL is required.";
                Uri uri;
                if (!Uri.TryCreate((string)value, UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https") || !String.IsNullOrEmpty(uri.UserInfo)) return "Only public HTTP or HTTPS links are allowed.";
                if (uri.IsLoopback || uri.Host.IndexOf('.') < 0 || uri.Host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase)) return "Local network links are not allowed through the website.";
                IPAddress address;
                if (IPAddress.TryParse(uri.Host.Trim('[', ']'), out address) && !PublicAddress(address)) return "Local network links are not allowed through the website.";
            }
            if (name == "polish") input["action"] = "rewrite";
            return null;
        }

        private static bool PublicAddress(IPAddress address)
        {
            if (IPAddress.IsLoopback(address)) return false;
            if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
            byte[] bytes = address.GetAddressBytes();
            if (bytes.Length == 4)
                return bytes[0] != 0 && bytes[0] != 10 && bytes[0] != 127 && bytes[0] < 224 && !(bytes[0] == 169 && bytes[1] == 254) && !(bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) && !(bytes[0] == 192 && bytes[1] == 168) && !(bytes[0] == 100 && bytes[1] >= 64 && bytes[1] <= 127);
            return !address.Equals(IPAddress.IPv6Any) && !address.IsIPv6LinkLocal && !address.IsIPv6SiteLocal && bytes[0] != 0xff && (bytes[0] & 0xfe) != 0xfc;
        }

        private async Task<Request> ReadRequest(NetworkStream stream)
        {
            // Keep any body bytes received with the header instead of using an
            // over-reading StreamReader. An absolute deadline defeats slow headers.
            MemoryStream header = new MemoryStream();
            byte[] buffer = new byte[1024];
            int matched = 0;
            int headerLength = -1;
            byte[] ending = { 13, 10, 13, 10 };
            Stopwatch elapsed = Stopwatch.StartNew();
            while (headerLength < 0)
            {
                if (header.Length >= MaxHeaderBytes || elapsed.ElapsedMilliseconds > 5000) throw new IOException("Request header limit.");
                int count = await ReadWithTimeout(stream, buffer, 0, buffer.Length, 5000 - (int)elapsed.ElapsedMilliseconds).ConfigureAwait(false);
                if (count == 0) throw new IOException("Incomplete header.");
                long before = header.Length;
                header.Write(buffer, 0, count);
                for (int i = 0; i < count; i++)
                {
                    matched = buffer[i] == ending[matched] ? matched + 1 : (buffer[i] == 13 ? 1 : 0);
                    if (matched == 4) { headerLength = (int)before + i + 1; break; }
                }
            }
            if (headerLength > MaxHeaderBytes) throw new IOException("Request header limit.");
            byte[] received = header.ToArray();
            string raw = Encoding.ASCII.GetString(received, 0, headerLength);
            string[] lines = raw.Split(new[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            if (first.Length != 3 || first[1].Length > 4096 || (first[2] != "HTTP/1.1" && first[2] != "HTTP/1.0") || !first[1].StartsWith("/", StringComparison.Ordinal) || first[1].StartsWith("//", StringComparison.Ordinal)) throw new IOException("Invalid request line.");
            Request request = new Request { Method = first[0], Path = first[1], Body = "" };
            if (request.Path.IndexOf('?') >= 0) throw new IOException("Query strings are not supported.");
            for (int i = 1; i < lines.Length && lines[i].Length > 0; i++)
            {
                int colon = lines[i].IndexOf(':');
                if (colon < 1 || Char.IsWhiteSpace(lines[i][0])) throw new IOException("Invalid header.");
                string key = lines[i].Substring(0, colon);
                if (key.Any(delegate(char c) { return !Char.IsLetterOrDigit(c) && c != '-'; })) throw new IOException("Invalid header name.");
                string value = lines[i].Substring(colon + 1).Trim();
                if (request.Headers.ContainsKey(key) || value.Any(delegate(char c) { return c < 32 && c != '\t'; })) throw new IOException("Invalid or duplicate header.");
                request.Headers.Add(key, value);
            }
            if (request.Headers.ContainsKey("Transfer-Encoding") || request.Headers.ContainsKey("Expect")) throw new IOException("Unsupported request encoding.");
            int length = 0;
            string lengthHeader;
            if (request.Headers.TryGetValue("Content-Length", out lengthHeader) && (!Int32.TryParse(lengthHeader, NumberStyles.None, CultureInfo.InvariantCulture, out length) || length < 0 || length > MaxBodyBytes)) throw new IOException("Request body limit.");
            if (length > 0)
            {
                byte[] body = new byte[length];
                int offset = Math.Min(length, received.Length - headerLength);
                if (offset > 0) Buffer.BlockCopy(received, headerLength, body, 0, offset);
                elapsed.Restart();
                while (offset < length)
                {
                    if (elapsed.ElapsedMilliseconds > 5000) throw new IOException("Request body deadline.");
                    int read = await ReadWithTimeout(stream, body, offset, length - offset, 5000 - (int)elapsed.ElapsedMilliseconds).ConfigureAwait(false);
                    if (read == 0) throw new IOException("Incomplete body.");
                    offset += read;
                }
                request.Body = new UTF8Encoding(false, true).GetString(body);
            }
            return request;
        }

        private async Task<int> ReadWithTimeout(NetworkStream stream, byte[] buffer, int offset, int count, int milliseconds)
        {
            if (milliseconds < 1) throw new IOException("Request deadline.");
            Task<int> read = stream.ReadAsync(buffer, offset, count, cancellation.Token);
            if (await Task.WhenAny(read, Task.Delay(milliseconds, cancellation.Token)).ConfigureAwait(false) != read) throw new IOException("Request deadline.");
            return await read.ConfigureAwait(false);
        }

        private async Task Respond(NetworkStream stream, int status, object value, string origin)
        {
            string reason = status == 200 ? "OK" : status == 204 ? "No Content" : status == 400 ? "Bad Request" : status == 401 ? "Unauthorized" : status == 403 ? "Forbidden" : status == 404 ? "Not Found" : status == 415 ? "Unsupported Media Type" : status == 429 ? "Too Many Requests" : status == 504 ? "Gateway Timeout" : "Error";
            byte[] body = value == null ? new byte[0] : Encoding.UTF8.GetBytes(Diagnostics.Json(value));
            StringBuilder headers = new StringBuilder();
            headers.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ").Append(body.Length).Append("\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nVary: Origin\r\n");
            if (origin != null)
                headers.Append("Access-Control-Allow-Origin: ").Append(origin).Append("\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, X-QDuo-Token\r\nAccess-Control-Allow-Private-Network: true\r\nAccess-Control-Max-Age: 600\r\n");
            headers.Append("\r\n");
            byte[] head = Encoding.ASCII.GetBytes(headers.ToString());
            await WriteWithTimeout(stream, head).ConfigureAwait(false);
            if (body.Length > 0) await WriteWithTimeout(stream, body).ConfigureAwait(false);
        }

        private async Task WriteWithTimeout(NetworkStream stream, byte[] bytes)
        {
            Task write = stream.WriteAsync(bytes, 0, bytes.Length, cancellation.Token);
            if (await Task.WhenAny(write, Task.Delay(5000, cancellation.Token)).ConfigureAwait(false) != write) throw new IOException("Response deadline.");
            await write.ConfigureAwait(false);
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            cancellation.Cancel();
            if (listener != null) listener.Stop();
            // Do not dispose the gates while pending callbacks may still release them.
        }
    }
}
