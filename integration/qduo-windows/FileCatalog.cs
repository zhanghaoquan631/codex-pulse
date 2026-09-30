using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Diagnostics.Eventing.Reader;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Xml;
using Microsoft.Win32.SafeHandles;

namespace QDuoWindows
{
    // Local metadata catalog. No document reads, remote requests, deletion or command execution.
    // Origin metadata is evidence with a stated scope, never proof of a file's original author.
    public static class FileCatalog
    {
        private static readonly object Gate = new object();
        private static Catalog Current;
        private static int Scanning;
        private static List<Binding> SavedBindings;
        private static readonly HashSet<string> Images = new HashSet<string>(new [] { ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp" }, StringComparer.OrdinalIgnoreCase);
        private static readonly HashSet<string> PreviewImages = new HashSet<string>(new [] { ".png", ".jpg", ".jpeg", ".gif", ".bmp" }, StringComparer.OrdinalIgnoreCase);
        private static readonly HashSet<string> ProtectedExtensions = new HashSet<string>(new [] {
            ".cs", ".cpp", ".c", ".h", ".py", ".js", ".jsx", ".ts", ".tsx", ".vue", ".go", ".rs", ".java", ".kt", ".swift", ".ps1", ".sh", ".bat", ".cmd", ".html", ".css", ".json", ".yaml", ".yml", ".toml", ".xml", ".sql", ".db", ".sqlite", ".sqlite3", ".mdb", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf", ".txt", ".md", ".rtf", ".csv", ".zip", ".7z", ".rar", ".tar", ".gz", ".mp4", ".mov", ".mp3", ".wav", ".flac", ".blend", ".fbx", ".glb", ".gltf", ".obj", ".stl", ".exe", ".dll", ".msi", ".pem", ".key", ".pfx", ".env" }, StringComparer.OrdinalIgnoreCase);
        private sealed class Root { public string Id, Name, Path, Category, Application; public int Count; public bool Complete = true, BindingOnly; public readonly List<string> Errors = new List<string>(); public string[] ProjectEvidence = new string[0]; }
        private sealed class Bookmark { public string Id, Title, Url, Key, Host, ProjectId; }
        private sealed class Binding { public string Path, BookmarkId, RootId; }
        private sealed class FileEntry { public string Id, Path, RootId, Risk, Category, Extension; public long Bytes; public DateTime Created, Modified, Accessed; public bool Image, Preview; public Dictionary<string, object> View; }
        private sealed class Project { public string Path; public string[] Evidence; public List<KeyValuePair<string,string>> Sources = new List<KeyValuePair<string,string>>(); }
        private sealed class CreatorEvent { public string Image; public DateTime Creation, Recorded; }
        private sealed class Catalog {
            public string Generated, Generation; public readonly List<FileEntry> Files = new List<FileEntry>(); public readonly Dictionary<string, FileEntry> ById = new Dictionary<string, FileEntry>();
            public readonly List<Root> Roots = new List<Root>(); public readonly List<string> Errors = new List<string>(); public readonly List<Bookmark> Bookmarks = new List<Bookmark>();
            public readonly List<Binding> Bindings = new List<Binding>(); public readonly Dictionary<string, CreatorEvent> Events = new Dictionary<string, CreatorEvent>(StringComparer.OrdinalIgnoreCase);
            public readonly Dictionary<string, Project> Projects = new Dictionary<string, Project>(StringComparer.OrdinalIgnoreCase); public readonly HashSet<string> Seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            public bool Deep, Truncated, SysmonAvailable; public int ExaminedEvents; public long Duration; public readonly Stopwatch Clock = Stopwatch.StartNew();
            public bool Expired { get { return Clock.ElapsedMilliseconds >= (Deep ? 45000 : 15000) || Files.Count >= (Deep ? 120000 : 24000); } }
        }

        public static object Scan(bool deep, object bookmarks, object bindings)
        {
            if (Interlocked.CompareExchange(ref Scanning, 1, 0) != 0) throw new InvalidOperationException("已有文件扫描正在运行，请等候完成。");
            try {
                List<Root> roots = DiscoverRoots();
                Catalog catalog = RunScan(deep, roots, ParseBookmarks(bookmarks), bindings);
                lock (Gate) { Current = catalog; }
                return ScanView(catalog);
            } finally { Interlocked.Exchange(ref Scanning, 0); }
        }

        public static object ListFiles(string query, string category, string cursor, int limit)
        {
            Catalog catalog; lock (Gate) { catalog = Current; }
            if (catalog == null) throw new InvalidOperationException("请先扫描本地文件目录。");
            return Page(catalog, query, category, cursor, limit);
        }

        public static object GetRoots()
        {
            List<Root> roots; List<Binding> bindings;
            lock (Gate) { bindings = LoadBindings(); roots = BindingRoots(Current == null ? DiscoverRoots() : Current.Roots, Current, bindings); }
            return Obj("roots", roots.Select(RootView).ToArray(), "bindings", bindings.Select(BindingView).ToArray());
        }

        public static object SetBindings(object bindings)
        {
            lock (Gate)
            {
                if (Interlocked.CompareExchange(ref Scanning, 0, 0) != 0) throw new InvalidOperationException("文件扫描正在运行，请完成后绑定目录。");
                List<Root> roots = BindingRoots(Current == null ? DiscoverRoots() : Current.Roots, Current, LoadBindings());
                List<Binding> parsed = ParseBindings(bindings, roots);
                SaveBindings(parsed); SavedBindings = parsed;
                // Replace the complete immutable snapshot, so concurrent JSON serialization cannot
                // see a dictionary modified in place or a mixture of old and new bindings.
                if (Current != null) {
                    Catalog updated = CopyCatalog(Current, parsed);
                    foreach (FileEntry file in updated.Files) {
                        Root root = roots.First(r => r.Id == file.RootId);
                        file.View["links"] = ReadLinks(updated, file.Path, root);
                    }
                    Current = updated;
                }
                return Obj("bindings", parsed.Select(BindingView).ToArray(), "roots", roots.Select(RootView).ToArray());
            }
        }

        private static Catalog CopyCatalog(Catalog original, List<Binding> bindings)
        {
            Catalog copy = new Catalog { Generated = original.Generated, Generation = Guid.NewGuid().ToString("N"), Deep = original.Deep, Truncated = original.Truncated,
                SysmonAvailable = original.SysmonAvailable, ExaminedEvents = original.ExaminedEvents, Duration = original.Duration };
            copy.Roots.AddRange(original.Roots); copy.Errors.AddRange(original.Errors); copy.Bookmarks.AddRange(original.Bookmarks); copy.Bindings.AddRange(bindings);
            foreach (KeyValuePair<string, CreatorEvent> item in original.Events) copy.Events[item.Key] = item.Value;
            foreach (KeyValuePair<string, Project> item in original.Projects) copy.Projects[item.Key] = item.Value;
            foreach (FileEntry file in original.Files) {
                FileEntry entry = new FileEntry { Id = file.Id, Path = file.Path, RootId = file.RootId, Risk = file.Risk, Category = file.Category, Extension = file.Extension,
                    Bytes = file.Bytes, Created = file.Created, Modified = file.Modified, Accessed = file.Accessed, Image = file.Image, Preview = file.Preview,
                    View = new Dictionary<string,object>(file.View) };
                copy.Files.Add(entry); copy.ById[entry.Id] = entry;
            }
            return copy;
        }

        // Read-only bridge for cleanup reports; does not authorize a path for cleaning.
        public static object FindMetadata(string path)
        {
            string canonical = Canonical(path); Catalog catalog; lock (Gate) { catalog = Current; }
            if (catalog == null) return null;
            FileEntry found; return catalog.ById.TryGetValue(Id(canonical), out found) ? found.View : null;
        }

        public static object Thumbnail(string id)
        {
            Catalog catalog; FileEntry file;
            lock (Gate) { catalog = Current; if (catalog == null || !catalog.ById.TryGetValue(id ?? "", out file)) throw new ArgumentException("图片 ID 不属于当前本地扫描。"); }
            if (!file.Preview || file.Bytes <= 0 || file.Bytes > 20 * 1024 * 1024) throw new ArgumentException("该文件不支持安全缩略图。");
            if (!SafePath(file.Path, false)) throw new ArgumentException("图片路径已变更或包含链接。");
            using (FileStream stream = OpenVerified(file.Path, file.Path, 20 * 1024 * 1024))
            {
                FileInfo now = new FileInfo(file.Path);
                if (stream.Length != file.Bytes || now.CreationTimeUtc != file.Created || now.LastWriteTimeUtc != file.Modified) throw new ArgumentException("图片已变更，请重新扫描。");
                CheckImageHeader(stream, file.Extension);
                using (Image source = Image.FromStream(stream, true, true))
                {
                    if (source.Width <= 0 || source.Height <= 0 || source.Width > 12000 || source.Height > 12000 || (long)source.Width * source.Height > 40000000) throw new ArgumentException("图片尺寸超出安全预览限制。");
                    double scale = Math.Min(1d, Math.Min(320d / source.Width, 240d / source.Height));
                    int width = Math.Max(1, (int)Math.Round(source.Width * scale)), height = Math.Max(1, (int)Math.Round(source.Height * scale));
                    using (Bitmap target = new Bitmap(width, height, PixelFormat.Format24bppRgb))
                    {
                        using (Graphics graphics = Graphics.FromImage(target)) {
                            graphics.Clear(Color.White); graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                            graphics.DrawImage(source, new Rectangle(0, 0, width, height));
                        }
                        using (MemoryStream output = new MemoryStream()) {
                            ImageCodecInfo encoder = ImageCodecInfo.GetImageEncoders().First(e => e.MimeType == "image/jpeg");
                            using (EncoderParameters parameters = new EncoderParameters(1)) {
                                parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 80L);
                                target.Save(output, encoder, parameters);
                            }
                            if (output.Length > 256 * 1024) throw new ArgumentException("缩略图超出响应限制。");
                            if (!SafePath(file.Path, false) || new FileInfo(file.Path).LastWriteTimeUtc != file.Modified) throw new ArgumentException("图片预览过程中发生变化，请重新扫描。");
                            return Obj("fileId", file.Id, "mime", "image/jpeg", "base64", Convert.ToBase64String(output.ToArray()), "width", width, "height", height);
                        }
                    }
                }
            }
        }

        private static Catalog RunScan(bool deep, List<Root> roots, List<Bookmark> bookmarks, object bindings)
        {
            Catalog catalog = new Catalog { Deep = deep, Generated = Utc(DateTime.UtcNow), Generation = Guid.NewGuid().ToString("N") };
            catalog.Roots.AddRange(roots); catalog.Bookmarks.AddRange(bookmarks);
            lock (Gate) {
                List<Binding> saved = LoadBindings().Where(b => roots.Any(r => Within(b.Path, r.Path)) && SafePath(b.Path, true)).ToList();
                List<Root> bindingRoots = BindingRoots(roots, Current, saved);
                catalog.Bindings.AddRange(bindings == null ? ParseBindings(saved.Select(BindingView).ToArray(), bindingRoots) : ParseBindings(bindings, bindingRoots));
            }
            ReadSysmon(catalog);
            List<Queue<string>> queues = roots.Select(r => new Queue<string>(new [] { r.Path })).ToList();
            bool pending = true;
            while (pending && !catalog.Expired)
            {
                pending = false;
                for (int index = 0; index < roots.Count && !catalog.Expired; index++)
                {
                    if (queues[index].Count == 0) continue;
                    pending = true; string directory = queues[index].Dequeue(); Root root = roots[index];
                    if (!SafePath(directory, true)) { root.Complete = false; RootError(root, "跳过目录链接、远程路径或不可访问目录：" + directory); continue; }
                    ReadProject(catalog, directory);
                    try {
                        foreach (string path in Directory.EnumerateFiles(directory)) {
                            if (catalog.Expired) break;
                            if (catalog.Seen.Contains(path)) continue;
                            try {
                                if (!SafePath(path, false)) { root.Complete = false; RootError(root, "跳过文件链接或不可访问文件：" + path); continue; }
                                FileEntry file = Entry(catalog, root, path); catalog.Seen.Add(file.Path); catalog.Files.Add(file); catalog.ById[file.Id] = file; root.Count++;
                            } catch (Exception e) { root.Complete = false; RootError(root, ShortError(path, e)); }
                        }
                        foreach (string child in Directory.EnumerateDirectories(directory)) {
                            if (catalog.Expired) break;
                            string name = Path.GetFileName(child);
                            // Git database and opaque system state are not user projects or cleanup targets.
                            if (name.Equals(".git", StringComparison.OrdinalIgnoreCase)) continue;
                            Root moreSpecific = roots.FirstOrDefault(r => r.Id != root.Id && SamePath(r.Path, child));
                            if (moreSpecific != null) continue;
                            if (!SafePath(child, true)) { root.Complete = false; RootError(root, "跳过目录链接或不可访问目录：" + child); continue; }
                            queues[index].Enqueue(child);
                        }
                    } catch (Exception e) { root.Complete = false; RootError(root, ShortError(directory, e)); }
                }
            }
            for (int index = 0; index < roots.Count; index++) if (queues[index].Count > 0 || catalog.Expired) roots[index].Complete = false;
            catalog.Truncated = catalog.Expired;
            if (catalog.Truncated) catalog.Errors.Add("达到扫描时间或文件数量上限；统计仅覆盖已枚举文件，可重新深度扫描。未枚举文件不表示不存在。");
            catalog.Duration = catalog.Clock.ElapsedMilliseconds;
            return catalog;
        }

        private static FileEntry Entry(Catalog catalog, Root root, string path)
        {
            FileInfo info = new FileInfo(path); info.Refresh();
            FileEntry file = new FileEntry { Id = Id(path), Path = Canonical(path), RootId = root.Id, Bytes = info.Length, Created = info.CreationTimeUtc, Modified = info.LastWriteTimeUtc, Accessed = info.LastAccessTimeUtc, Extension = info.Extension.ToLowerInvariant(), Category = root.Category };
            file.Image = Images.Contains(file.Extension); file.Preview = PreviewImages.Contains(file.Extension) && file.Bytes > 0 && file.Bytes <= 20 * 1024 * 1024;
            List<string> reasons = new List<string>();
            bool project = ProjectsFor(catalog, path).Any();
            if (root.Category != "cache" || project || file.Image || ProtectedExtensions.Contains(file.Extension) || info.Name.StartsWith(".env", StringComparison.OrdinalIgnoreCase)) {
                file.Risk = "protected"; reasons.Add(project ? "位于项目目录，保护源码、资源和配置。" : root.Category != "cache" ? "个人文件或项目范围，保留。" : "此文件可能含项目、文档、媒体、程序或凭据，保留。");
            } else if (root.Application == "临时文件" && file.Extension != ".tmp" && file.Extension != ".log" && file.Extension != ".cache") {
                file.Risk = "protected"; reasons.Add("未知临时文件用途，保留。");
            } else if (file.Modified > DateTime.UtcNow.AddDays(-7)) { file.Risk = "medium"; reasons.Add("已识别缓存但近期修改，可能正在使用，不自动处理。"); }
            else { file.Risk = "low"; reasons.Add("已识别缓存目录且超过 7 天未修改；风险分类不代表病毒检测或清理授权。"); }
            Dictionary<string,string> zone = ReadZone(path);
            object creator = Creator(catalog, root, file, zone);
            file.View = Obj("id", file.Id, "path", file.Path, "name", info.Name, "bytes", file.Bytes, "extension", file.Extension,
                "createdAt", Utc(file.Created), "lastModifiedAt", Utc(file.Modified), "lastAccessAt", Utc(file.Accessed),
                "risk", file.Risk, "reasons", reasons.ToArray(), "creator", creator, "links", ReadLinks(catalog, path, root, zone),
                "isImage", file.Image, "thumbnailAvailable", file.Preview, "rootId", root.Id, "category", root.Category,
                "creationTimeMeaning", "Windows 文件系统创建时间；复制、迁移或应用操作可改变它，不一定是最初创作时间。",
                "lastAccessTimeMeaning", "Windows 可能延迟或禁用访问时间更新，不据此判定文件无人使用。");
            return file;
        }

        private static object Creator(Catalog catalog, Root root, FileEntry file, Dictionary<string,string> zone)
        {
            CreatorEvent recorded;
            if (catalog.Events.TryGetValue(file.Path, out recorded) && Math.Abs((recorded.Creation - file.Created).TotalSeconds) < 2 && recorded.Recorded <= file.Modified.AddSeconds(2))
                return Obj("name", Path.GetFileNameWithoutExtension(recorded.Image), "confidence", "verified", "evidence", "本机 Sysmon Event 11 记录该应用在 " + Utc(recorded.Recorded) + " 创建或覆盖该路径；并非证明最初作者。", "scope", "create-or-overwrite", "applicationPath", recorded.Image);
            string package;
            if (zone.TryGetValue("LastWriterPackageFamilyName", out package) && package.Length <= 240)
                return Obj("name", package + "（最后写入应用）", "confidence", "inferred", "evidence", "Zone.Identifier 的 LastWriterPackageFamilyName 元数据；不是初始创建者证明。", "scope", "last-writer");
            if (!String.IsNullOrEmpty(root.Application) && root.Application != "临时文件")
                return Obj("name", root.Application, "confidence", "inferred", "evidence", "根据已知应用缓存目录推测；Windows 未提供该文件的历史创建进程。", "scope", "cache-owner");
            return Obj("name", "未知（Windows 未保留创建应用记录）", "confidence", "unknown", "evidence", "文件时间和扩展名不能证明创建应用；未找到匹配的本机创建事件。", "scope", "unknown");
        }

        private static object[] ReadLinks(Catalog catalog, string path, Root root, Dictionary<string,string> zone = null)
        {
            List<Dictionary<string, object>> result = new List<Dictionary<string, object>>(); HashSet<string> added = new HashSet<string>();
            foreach (Binding binding in catalog.Bindings.OrderByDescending(b => b.Path.Length)) {
                if (!Within(path, binding.Path)) continue;
                Bookmark bookmark = catalog.Bookmarks.FirstOrDefault(b => b.Id == binding.BookmarkId);
                if (bookmark != null && added.Add(bookmark.Id)) result.Add(Link(bookmark, "explicit", "你显式绑定此本地目录至网站收藏；绑定目录：" + binding.Path));
            }
            foreach (Project project in ProjectsFor(catalog, path)) foreach (KeyValuePair<string,string> source in project.Sources) {
                foreach (Bookmark bookmark in catalog.Bookmarks) {
                    bool matched = source.Key == "hosting-project" ? bookmark.ProjectId != null && bookmark.ProjectId == source.Value : bookmark.Key == UrlKey(source.Value);
                    if (matched && added.Add(bookmark.Id)) result.Add(Link(bookmark, "exact", source.Key == "hosting-project" ? "项目 .openai/hosting.json 的 project_id 与收藏保存的 projectId 精确一致。" : "项目 " + source.Key + " 链接与网站收藏完整地址精确一致。"));
                }
            }
            if (zone == null) zone = ReadZone(path);
            foreach (string field in new [] { "HostUrl", "ReferrerUrl" }) {
                string value; if (!zone.TryGetValue(field, out value)) continue;
                string safe = SafeUrl(value); if (safe == null) continue;
                Uri uri = new Uri(safe); string key = UrlKey(safe);
                foreach (Bookmark bookmark in catalog.Bookmarks) {
                    bool exact = bookmark.Key == key;
                    if (exact || bookmark.Host == uri.Host.ToLowerInvariant())
                        result.Add(Link(bookmark, exact ? "exact" : "domain", exact ? "文件 Zone.Identifier 的 " + field + " 与收藏完整地址精确一致；这是下载来源元数据。" : "文件下载来源 " + field + " 与收藏仅同域名；只作来源提示，不能确认属于该项目。"));
                }
            }
            // A later exact ReferrerUrl must supersede an earlier HostUrl domain hint.
            // Rank before truncating so domain hints cannot hide a concrete project link.
            return result.OrderByDescending(link => LinkRank((string)link["confidence"]))
                .GroupBy(link => (string)link["id"]).Select(group => group.First())
                .Take(12).Cast<object>().ToArray();
        }

        private static int LinkRank(string confidence) { return confidence == "explicit" ? 3 : confidence == "exact" ? 2 : confidence == "domain" ? 1 : 0; }

        private static IEnumerable<Project> ProjectsFor(Catalog catalog, string path) { return catalog.Projects.Values.Where(p => Within(path, p.Path)).OrderByDescending(p => p.Path.Length); }

        private static void ReadProject(Catalog catalog, string directory)
        {
            if (catalog.Projects.ContainsKey(directory)) return;
            string git = Path.Combine(directory, ".git", "config"), hosting = Path.Combine(directory, ".openai", "hosting.json");
            List<string> markers = new List<string>();
            foreach (string marker in new [] { ".git", ".hg", ".svn", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "CMakeLists.txt", "requirements.txt", ".qd-protect", ".openai\\hosting.json" })
                if (File.Exists(Path.Combine(directory, marker)) || Directory.Exists(Path.Combine(directory, marker))) markers.Add(marker);
            if (markers.Count == 0) return;
            Project project = new Project { Path = directory, Evidence = markers.ToArray() }; catalog.Projects[directory] = project;
            try {
                if (SafePath(git, false)) {
                    string text = ReadSmall(git, git, 32 * 1024); bool remoteSection = false;
                    foreach (string raw in text.Split('\n')) {
                        string line = raw.Trim();
                        if (line.StartsWith("[")) remoteSection = line.StartsWith("[remote ", StringComparison.OrdinalIgnoreCase);
                        else if (remoteSection && line.StartsWith("url", StringComparison.OrdinalIgnoreCase)) {
                            int equal = line.IndexOf('='); if (equal < 0) continue; string url = NormalizeGit(line.Substring(equal + 1).Trim());
                            if (url != null) project.Sources.Add(new KeyValuePair<string,string>(".git/config remote", url));
                        }
                    }
                }
            } catch { }
            try {
                if (SafePath(hosting, false)) {
                    object parsed = new JavaScriptSerializer { MaxJsonLength = 32768, RecursionLimit = 8 }.DeserializeObject(ReadSmall(hosting, hosting, 32768));
                    Dictionary<string,object> map = parsed as Dictionary<string,object>;
                    if (map != null) {
                        foreach (string key in new [] { "url", "site_url", "siteUrl", "public_url", "deployment_url", "published_url", "domain" }) {
                            object raw; if (map.TryGetValue(key, out raw)) { string url = SafeUrl(Convert.ToString(raw, CultureInfo.InvariantCulture)); if (url != null) project.Sources.Add(new KeyValuePair<string,string>(".openai/hosting.json " + key, url)); }
                        }
                        object projectId; if (map.TryGetValue("project_id", out projectId) && projectId is string && ((string)projectId).Length <= 128) project.Sources.Add(new KeyValuePair<string,string>("hosting-project", (string)projectId));
                    }
                }
            } catch { }
        }

        private static Dictionary<string,string> ReadZone(string path)
        {
            Dictionary<string,string> result = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            try {
                if (!SafePath(path, false)) return result;
                string text = ReadSmall(path + ":Zone.Identifier", path + ":Zone.Identifier", 8192);
                foreach (string line in text.Split('\n')) { int equal = line.IndexOf('='); if (equal <= 0) continue; string key = line.Substring(0,equal).Trim(); if (key == "HostUrl" || key == "ReferrerUrl" || key == "LastWriterPackageFamilyName") result[key] = line.Substring(equal + 1).Trim(); }
            } catch { }
            return result;
        }

        private static void ReadSysmon(Catalog catalog)
        {
            Stopwatch watch = Stopwatch.StartNew();
            try {
                EventLogQuery query = new EventLogQuery("Microsoft-Windows-Sysmon/Operational", PathType.LogName, "*[System[(EventID=11)]]") { ReverseDirection = true, TolerateQueryErrors = false };
                using (EventLogReader reader = new EventLogReader(query)) {
                    catalog.SysmonAvailable = true;
                    while (catalog.ExaminedEvents < 5000 && watch.ElapsedMilliseconds < 1500) {
                        using (EventRecord record = reader.ReadEvent(TimeSpan.FromMilliseconds(150))) {
                            if (record == null) break;
                            catalog.ExaminedEvents++;
                            XmlDocument xml = new XmlDocument { XmlResolver = null }; using (StringReader source = new StringReader(record.ToXml())) using (XmlReader input = XmlReader.Create(source, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null })) xml.Load(input);
                            Dictionary<string,string> fields = new Dictionary<string,string>();
                            foreach (XmlNode node in xml.GetElementsByTagName("Data")) { XmlAttribute name = node.Attributes["Name"]; if (name != null) fields[name.Value] = node.InnerText; }
                            string filename, image, created; DateTime creation;
                            if (!fields.TryGetValue("TargetFilename",out filename) || !fields.TryGetValue("Image",out image) || !fields.TryGetValue("CreationUtcTime",out created) || !DateTime.TryParse(created, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out creation)) continue;
                            string canonical = Canonical(filename); if (!catalog.Events.ContainsKey(canonical)) catalog.Events[canonical] = new CreatorEvent { Image = image, Creation = creation, Recorded = record.TimeCreated.HasValue ? record.TimeCreated.Value.ToUniversalTime() : creation };
                        }
                    }
                }
            } catch (Exception e) { if (!(e is EventLogNotFoundException)) catalog.Errors.Add("无法读取已有 Sysmon 创建事件：" + e.GetType().Name + "；不安装或启用监控。未知应用将明确标注。"); }
        }

        private static List<Root> DiscoverRoots()
        {
            List<Root> roots = new List<Root>(); string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            AddRoot(roots, "Codex 项目", Path.Combine(documents, "Codex"), "project", null);
            AddRoot(roots, "Documents 项目", Path.Combine(documents, "Projects"), "project", null);
            AddRoot(roots, "源码仓库", Path.Combine(profile, "source", "repos"), "project", null);
            AddRoot(roots, "项目目录", Path.Combine(profile, "Projects"), "project", null);
            AddRoot(roots, "桌面", Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "personal", null);
            AddRoot(roots, "下载", Path.Combine(profile, "Downloads"), "personal", null);
            AddRoot(roots, "图片", Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "personal", null);
            AddRoot(roots, "文档", documents, "personal", null);
            AddRoot(roots, "用户临时文件", Path.GetTempPath(), "cache", "临时文件");
            AddRoot(roots, "Windows 临时文件", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Temp"), "cache", "临时文件");
            AddRoot(roots, "npm 缓存", Path.Combine(local, "npm-cache"), "cache", "npm / Node.js");
            AddRoot(roots, "pip 缓存", Path.Combine(local, "pip", "Cache"), "cache", "pip / Python");
            AddRoot(roots, "uv 缓存", Path.Combine(local, "uv", "cache"), "cache", "uv / Python");
            AddRoot(roots, "NuGet 缓存", Path.Combine(local, "NuGet", "v3-cache"), "cache", "NuGet / .NET");
            AddBrowserRoots(roots, Path.Combine(local,"Google","Chrome","User Data"),"Chrome");
            AddBrowserRoots(roots, Path.Combine(local,"Microsoft","Edge","User Data"),"Edge");
            return roots;
        }

        private static void AddBrowserRoots(List<Root> roots, string path, string application)
        {
            if (!SafePath(path,true)) return;
            try { foreach (string profile in Directory.EnumerateDirectories(path).Take(40)) {
                string name = Path.GetFileName(profile); if (!(name == "Default" || name.StartsWith("Profile ",StringComparison.Ordinal))) continue;
                foreach (string cache in new [] { "Cache", "Code Cache", "GPUCache" }) AddRoot(roots, application + " " + name + " " + cache, Path.Combine(profile,cache),"cache",application);
            } } catch { }
        }

        private static void AddRoot(List<Root> roots, string name, string path, string category, string application)
        {
            try { if (String.IsNullOrEmpty(path) || !SafePath(path,true)) return; path = Canonical(path); if (roots.Any(r=>SamePath(r.Path,path))) return; roots.Add(new Root { Id=Id(path), Name=name, Path=path, Category=category, Application=application }); } catch { }
        }

        // Additional IDs are choices for a precise project binding and a subtree filter only.
        // They never expand traversal roots and never authorize reading or deleting arbitrary paths.
        private static List<Root> BindingRoots(List<Root> fixedRoots, Catalog catalog, List<Binding> bindings)
        {
            List<Root> result = new List<Root>(fixedRoots);
            if (catalog != null) foreach (Project project in catalog.Projects.Values.OrderBy(p => p.Path, StringComparer.OrdinalIgnoreCase).Take(500))
                AddBindingRoot(result, fixedRoots, project.Path, project.Evidence);
            foreach (Binding binding in bindings) AddBindingRoot(result, fixedRoots, binding.Path, new [] { "已保存的显式目录绑定" });
            return result;
        }
        private static void AddBindingRoot(List<Root> result, List<Root> fixedRoots, string path, string[] evidence)
        {
            if (result.Any(r => SamePath(r.Path, path)) || !fixedRoots.Any(r => Within(path, r.Path)) || !SafePath(path, true)) return;
            result.Add(new Root { Id = Id(path), Name = "项目：" + Path.GetFileName(path) + " · " + Path.GetFileName(Path.GetDirectoryName(path)), Path = path, Category = "project", BindingOnly = true, ProjectEvidence = evidence });
        }

        private static List<Bookmark> ParseBookmarks(object value)
        {
            List<Bookmark> result = new List<Bookmark>(); HashSet<string> ids = new HashSet<string>();
            foreach (object item in Array(value).Take(5000)) {
                Dictionary<string,object> map = item as Dictionary<string,object>; if (map == null) continue;
                string id = Field(map,"id",128), title=Field(map,"title",512), url=SafeUrl(Field(map,"url",4096));
                if (id==null || url==null || !ids.Add(id)) continue;
                result.Add(new Bookmark { Id=id, Title=title??url, Url=url, Key=UrlKey(url), Host=new Uri(url).Host.ToLowerInvariant(), ProjectId=Field(map,"projectId",128)??Field(map,"project_id",128) });
            }
            return result;
        }

        private static List<Binding> ParseBindings(object value, List<Root> roots)
        {
            Dictionary<string,object> wrapper=value as Dictionary<string,object>; if(wrapper!=null && wrapper.ContainsKey("bindings")) value=wrapper["bindings"];
            List<Binding> result=new List<Binding>();
            foreach(object item in Array(value).Take(500)) {
                Dictionary<string,object> map=item as Dictionary<string,object>; if(map==null) throw new ArgumentException("目录绑定格式无效。");
                string bookmarkId=Field(map,"bookmarkId",128), rootId=Field(map,"rootId",128), path=Field(map,"path",32760);
                Root root=roots.FirstOrDefault(r=>r.Id==rootId);
                if(path==null && root!=null) path=root.Path;
                if(path==null || bookmarkId==null) throw new ArgumentException("目录绑定需要有效本地目录和收藏 ID。");
                path=Canonical(path); root=roots.Where(r=>Within(path,r.Path)).OrderByDescending(r=>r.Path.Length).FirstOrDefault();
                if(root==null || !SafePath(path,true)) throw new ArgumentException("只能绑定已扫描范围内的真实本地目录，不能使用目录链接或网络路径。");
                if(!result.Any(b=>SamePath(b.Path,path)&&b.BookmarkId==bookmarkId)) result.Add(new Binding {Path=path,BookmarkId=bookmarkId,RootId=Id(path)});
            }
            return result;
        }

        private static List<Binding> LoadBindings()
        {
            if(SavedBindings!=null) return SavedBindings;
            SavedBindings=new List<Binding>();
            try { string path=BindingsFile(); if(SafePath(path,false)) { object parsed=new JavaScriptSerializer {MaxJsonLength=256*1024,RecursionLimit=12}.DeserializeObject(ReadSmall(path,path,256*1024)); SavedBindings=ParseBindings(parsed,DiscoverRoots()); } } catch { }
            return SavedBindings;
        }

        private static void SaveBindings(List<Binding> bindings)
        {
            string path=BindingsFile(), directory=Path.GetDirectoryName(path);
            Directory.CreateDirectory(directory); if(!SafePath(directory,true) || (File.Exists(path) && !SafePath(path,false))) throw new ArgumentException("本地绑定保存目录不安全。");
            string json=new JavaScriptSerializer {MaxJsonLength=256*1024}.Serialize(bindings.Select(BindingView).ToArray());
            // Only root paths and saved bookmark IDs are retained locally; no reports, images, keys or website URLs.
            using(SafeFileHandle handle=CreateFile(path,0x40000000,0,IntPtr.Zero,4,0x00200000,IntPtr.Zero)) {
                if(handle.IsInvalid) throw new IOException("无法保存本地目录绑定。");
                if(!HandleMatches(handle,path)) throw new IOException("本地目录绑定路径发生变化。");
                using(FileStream stream=new FileStream(handle,FileAccess.Write)) { byte[] bytes=new UTF8Encoding(false).GetBytes(json); stream.SetLength(0); stream.Write(bytes,0,bytes.Length); stream.Flush(true); }
            }
        }
        private static string BindingsFile() { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"QDuoWindows","file-bindings.json"); }

        private static object Page(Catalog catalog,string query,string category,string cursor,int limit)
        {
            limit=Math.Max(1,Math.Min(100,limit)); query=(query??"").Trim(); if(query.Length>512) throw new ArgumentException("搜索文字过长。"); category=category??"all";
            IEnumerable<FileEntry> filtered=catalog.Files;
            if(category=="low"||category=="medium"||category=="protected") filtered=filtered.Where(f=>f.Risk==category);
            else if(category=="image") filtered=filtered.Where(f=>f.Image);
            else if(category=="linked") filtered=filtered.Where(f=>((object[])f.View["links"]).Length>0);
            else if(category=="unknown") filtered=filtered.Where(f=>((Dictionary<string,object>)f.View["creator"])["confidence"].ToString()=="unknown");
            else if(category.StartsWith("root:",StringComparison.Ordinal)) {
                Root selected = BindingRoots(catalog.Roots, catalog, catalog.Bindings).FirstOrDefault(r => r.Id == category.Substring(5));
                if(selected==null) throw new ArgumentException("目录编号不属于本次扫描。");
                filtered=filtered.Where(f=>Within(f.Path,selected.Path));
            }
            else if(category!="all") throw new ArgumentException("文件分类无效。");
            if(query.Length>0) filtered=filtered.Where(f=>f.Path.IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0);
            List<FileEntry> matches=filtered.ToList(); int offset=0;
            if(!String.IsNullOrEmpty(cursor)) { string[] parts=cursor.Split(':'); if(parts.Length!=2||parts[0]!=catalog.Generation||!Int32.TryParse(parts[1],out offset)||offset<0||offset>matches.Count) throw new ArgumentException("分页游标已过期或无效，请重新加载文件列表。"); }
            object[] items=matches.Skip(offset).Take(limit).Select(f=>(object)f.View).ToArray(); int next=offset+items.Length;
            return Obj("items",items,"total",matches.Count,"nextCursor",next<matches.Count?catalog.Generation+":"+next.ToString(CultureInfo.InvariantCulture):null,"generatedAt",catalog.Generated,"coverage",Coverage(catalog));
        }

        private static object ScanView(Catalog catalog)
        {
            long bytes=0; foreach(FileEntry file in catalog.Files) { if(Int64.MaxValue-bytes<file.Bytes) {bytes=Int64.MaxValue;break;} bytes+=file.Bytes; }
            return Obj("schemaVersion",1,"generatedAt",catalog.Generated,"summary",Obj("totalFiles",catalog.Files.Count,"totalBytes",bytes,"lowFiles",catalog.Files.Count(f=>f.Risk=="low"),"mediumFiles",catalog.Files.Count(f=>f.Risk=="medium"),"protectedFiles",catalog.Files.Count(f=>f.Risk=="protected"),"images",catalog.Files.Count(f=>f.Image),"linkedFiles",catalog.Files.Count(f=>((object[])f.View["links"]).Length>0)),
                "coverage",Coverage(catalog),"provenance",Obj("sysmonAvailable",catalog.SysmonAvailable,"examinedEvents",catalog.ExaminedEvents,"note","只读取已存在且可访问的 Sysmon Event 11（最多近期 5000 条）；未安装、未启用或未保存历史时，不能追溯创建应用。"),"bookmarksCount",catalog.Bookmarks.Count,"bindings",catalog.Bindings.Select(BindingView).ToArray(),"roots",BindingRoots(catalog.Roots,catalog,catalog.Bindings).Select(RootView).ToArray(),"firstPage",Page(catalog,"","all",null,24));
        }
        private static object Coverage(Catalog catalog) { return Obj("complete",!catalog.Truncated&&catalog.Roots.All(r=>r.Complete),"truncated",catalog.Truncated,"examinedFiles",catalog.Files.Count,"durationMs",catalog.Duration,"roots",catalog.Roots.Select(r=>Obj("id",r.Id,"name",r.Name,"path",r.Path,"category",r.Category,"complete",r.Complete,"examinedFiles",r.Count,"errors",r.Errors.ToArray())).ToArray(),"errors",catalog.Errors.ToArray(),"notes",new [] {"范围为列出的真实本地个人、项目和已知缓存目录；不遍历网络位置、目录链接或 .git 数据库。", "仅枚举文件元数据、来源标记与项目链接配置；图片仅在请求缩略图时读取。", "创建时间是文件系统时间；最后访问时间可能延迟，清理风险分类不判断病毒。", "未发现来源证据时明确显示未知，不根据文件名猜测网站项目。", "PNG/JPEG/GIF/BMP 支持安全缩略图；WebP 标记为图片但系统 GDI+ 不支持时不预览。"}); }
        private static Dictionary<string,object> RootView(Root root) {return Obj("id",root.Id,"name",root.Name,"path",root.Path,"category",root.Category,"bindingOnly",root.BindingOnly,"projectEvidence",root.ProjectEvidence);}
        private static Dictionary<string,object> BindingView(Binding binding) {return Obj("path",binding.Path,"bookmarkId",binding.BookmarkId,"rootId",binding.RootId);}
        private static Dictionary<string,object> Link(Bookmark bookmark,string confidence,string evidence) {return Obj("id",bookmark.Id,"title",bookmark.Title,"url",bookmark.Url,"confidence",confidence,"evidence",evidence);}
        private static Dictionary<string,object> Obj(params object[] pairs) {Dictionary<string,object> result=new Dictionary<string,object>();for(int i=0;i<pairs.Length;i+=2)result[(string)pairs[i]]=pairs[i+1];return result;}
        private static IEnumerable<object> Array(object value) { if(value==null || value is string || value is IDictionary) return Enumerable.Empty<object>(); IEnumerable enumerable=value as IEnumerable; return enumerable==null?Enumerable.Empty<object>():enumerable.Cast<object>(); }
        private static string Field(Dictionary<string,object> map,string key,int limit) {object value; if(!map.TryGetValue(key,out value)||!(value is string)||String.IsNullOrWhiteSpace((string)value)||((string)value).Length>limit)return null;return ((string)value).Trim();}
        private static string Utc(DateTime value) {return value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture);}
        private static string Canonical(string path) {if(String.IsNullOrWhiteSpace(path)||path.Length>32760||path.StartsWith(@"\\",StringComparison.Ordinal)||path.IndexOf('\0')>=0)throw new ArgumentException("只支持真实本地路径。");string full=Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);if(full.Length<3)throw new ArgumentException("不支持磁盘根目录。");return full;}
        private static bool SamePath(string a,string b) {return String.Equals(a.TrimEnd('\\'),b.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase);}
        private static bool Within(string path,string root) {return SamePath(path,root)||path.StartsWith(root.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase);}
        private static string Id(string path) {using(SHA256 hash=SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Canonical(path).ToLowerInvariant()))).Replace("-","").ToLowerInvariant();}
        private static bool SafePath(string path,bool directory) {
            try {
                string full=Canonical(path);if(full.Substring(2).Contains(":"))return false;
                DriveInfo drive=new DriveInfo(Path.GetPathRoot(full));if(drive.DriveType!=DriveType.Fixed && drive.DriveType!=DriveType.Removable)return false;
                if(directory?!Directory.Exists(full):!File.Exists(full))return false;
                string check=full;
                while(!String.IsNullOrEmpty(check)) {FileAttributes attributes=File.GetAttributes(check);if((attributes&FileAttributes.ReparsePoint)!=0)return false; string parent=Path.GetDirectoryName(check);if(parent==check)break;check=parent;}
                return true;
            } catch {return false;}
        }
        private static void RootError(Root root,string value) {if(root.Errors.Count<30)root.Errors.Add(value);}
        private static string ShortError(string path,Exception e) {return path+"："+e.GetType().Name;}
        private static string SafeUrl(string value) {Uri uri;if(value==null||value.Length>4096||!Uri.TryCreate(value,UriKind.Absolute,out uri)||(uri.Scheme!="http"&&uri.Scheme!="https")||!String.IsNullOrEmpty(uri.UserInfo)||String.IsNullOrEmpty(uri.Host))return null;return uri.AbsoluteUri;}
        private static string NormalizeGit(string value) {if(value.StartsWith("git@",StringComparison.Ordinal)){int colon=value.IndexOf(':');if(colon>4)value="https://"+value.Substring(4,colon-4)+"/"+value.Substring(colon+1);}else if(value.StartsWith("ssh://git@",StringComparison.Ordinal))value="https://"+value.Substring(10);string safe=SafeUrl(value);if(safe==null)return null;return safe.EndsWith(".git",StringComparison.OrdinalIgnoreCase)?safe.Substring(0,safe.Length-4):safe;}
        private static string UrlKey(string value) {Uri uri;if(!Uri.TryCreate(value,UriKind.Absolute,out uri))return "";string path=uri.AbsolutePath.TrimEnd('/');if(path.EndsWith(".git",StringComparison.OrdinalIgnoreCase))path=path.Substring(0,path.Length-4);return uri.Scheme.ToLowerInvariant()+"://"+uri.Host.ToLowerInvariant()+(uri.IsDefaultPort?"":":"+uri.Port.ToString(CultureInfo.InvariantCulture))+path+uri.Query+uri.Fragment;}
        private static string ReadSmall(string path,string expected,int limit) {using(FileStream stream=OpenVerified(path,expected,limit)) {using(StreamReader reader=new StreamReader(stream,Encoding.UTF8,true,1024))return reader.ReadToEnd();}}
        private static FileStream OpenVerified(string path,string expected,int limit) {
            using(SafeFileHandle handle=CreateFile(path,0x80000000,1|2|4,IntPtr.Zero,3,0x00200000|0x08000000,IntPtr.Zero)) {
                if(handle.IsInvalid)throw new IOException("本地元数据不可访问。");
                if(!HandleMatches(handle,expected))throw new IOException("文件路径在读取时发生变化。");
                // Duplicate the safe handle ownership because FileStream survives this using block.
                IntPtr duplicate; if(!DuplicateHandle(GetCurrentProcess(),handle.DangerousGetHandle(),GetCurrentProcess(),out duplicate,0,false,2))throw new IOException("无法读取本地文件。");
                FileStream stream=new FileStream(new SafeFileHandle(duplicate,true),FileAccess.Read);
                if(stream.Length>limit) {stream.Dispose();throw new IOException("文件超过元数据读取限制。");} return stream;
            }
        }
        private static bool HandleMatches(SafeFileHandle handle,string expected) {ByHandleInformation information;if(!GetFileInformationByHandle(handle,out information)||(information.Attributes&0x400)!=0)return false;StringBuilder builder=new StringBuilder(32768);uint length=GetFinalPathNameByHandle(handle,builder,(uint)builder.Capacity,0);if(length==0||length>=builder.Capacity)return false;string final=builder.ToString();if(final.StartsWith(@"\\?\",StringComparison.Ordinal))final=final.Substring(4);return String.Equals(final,expected,StringComparison.OrdinalIgnoreCase);}
        private static void CheckImageHeader(FileStream stream,string extension)
        {
            int width=0,height=0;stream.Position=0;
            using(BinaryReader reader=new BinaryReader(stream,Encoding.UTF8,true)) {
                if(extension==".png") {
                    byte[] header=reader.ReadBytes(24);if(header.Length!=24||header[0]!=137||header[1]!=80||header[2]!=78||header[3]!=71||header[12]!=73||header[13]!=72||header[14]!=68||header[15]!=82)throw new ArgumentException("PNG 头无效。");
                    width=BigEndian(header,16);height=BigEndian(header,20);
                } else if(extension==".gif") {
                    byte[] header=reader.ReadBytes(10);if(header.Length!=10||Encoding.ASCII.GetString(header,0,3)!="GIF")throw new ArgumentException("GIF 头无效。");width=header[6]|header[7]<<8;height=header[8]|header[9]<<8;
                } else if(extension==".bmp") {
                    if(reader.ReadUInt16()!=0x4d42)throw new ArgumentException("BMP 头无效。");stream.Position=14;uint size=reader.ReadUInt32();if(size==12){width=reader.ReadUInt16();height=reader.ReadUInt16();}else if(size>=40){width=reader.ReadInt32();int raw=reader.ReadInt32();if(raw==Int32.MinValue)throw new ArgumentException("BMP 高度无效。");height=Math.Abs(raw);}else throw new ArgumentException("不支持该 BMP 头。");
                } else {
                    if(reader.ReadByte()!=0xff||reader.ReadByte()!=0xd8)throw new ArgumentException("JPEG 头无效。");
                    while(stream.Position<Math.Min(stream.Length,1024*1024)) {
                        if(reader.ReadByte()!=0xff)throw new ArgumentException("JPEG 标记无效。");byte marker;do{marker=reader.ReadByte();}while(marker==0xff);
                        if(marker==0xd9||marker==0xda)break;if(marker==0x01||(marker>=0xd0&&marker<=0xd7))continue;
                        int length=reader.ReadByte()<<8|reader.ReadByte();if(length<2||stream.Position+length-2>stream.Length)throw new ArgumentException("JPEG 段长度无效。");
                        if((marker>=0xc0&&marker<=0xcf)&&marker!=0xc4&&marker!=0xc8&&marker!=0xcc){if(length<8)throw new ArgumentException("JPEG 尺寸头无效。");reader.ReadByte();height=reader.ReadByte()<<8|reader.ReadByte();width=reader.ReadByte()<<8|reader.ReadByte();break;}
                        stream.Position+=length-2;
                    }
                }
            }
            if(width<=0||height<=0||width>12000||height>12000||(long)width*height>40000000)throw new ArgumentException("图片尺寸超出安全预览限制。");stream.Position=0;
        }
        private static int BigEndian(byte[] bytes,int offset){uint value=(uint)bytes[offset]<<24|(uint)bytes[offset+1]<<16|(uint)bytes[offset+2]<<8|bytes[offset+3];return value>Int32.MaxValue?0:(int)value;}
        [StructLayout(LayoutKind.Sequential)] private struct ByHandleInformation {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Created,Accessed,Modified;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
        [DllImport("kernel32.dll",SetLastError=true)] private static extern bool GetFileInformationByHandle(SafeFileHandle handle,out ByHandleInformation info);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder path,uint size,uint flags);
        [DllImport("kernel32.dll",SetLastError=true)] private static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr sourceHandle,IntPtr targetProcess,out IntPtr targetHandle,uint access,bool inherit,uint options);
        [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();

#if FILECATALOG_TESTS
        public static object ScanFixture(string[] paths,object bookmarks,object bindings) {List<Root> roots=new List<Root>();foreach(string path in paths)AddRoot(roots,"Fixture",path,"personal",null);Catalog catalog=RunScan(true,roots,ParseBookmarks(bookmarks),bindings);lock(Gate){Current=catalog;}return ScanView(catalog);}
#endif
    }
}
