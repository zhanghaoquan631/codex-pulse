// QDuo Windows: an independent Windows implementation inspired by XueshiQiao/qduo.
// Copyright (C) 2026. Distributed under GNU GPL v3 or later. See LICENSE.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Speech.Synthesis;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Windows.Forms;
using Microsoft.VisualBasic;

[assembly: System.Reflection.AssemblyVersion("1.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.1.0.0")]
[assembly: System.Reflection.AssemblyProduct("QDuo Windows")]

namespace QDuoWindows
{
    public sealed class AiAction
    {
        public string Name { get; set; }
        public string Prompt { get; set; }
        public AiAction() { }
        public AiAction(string name, string prompt) { Name = name; Prompt = prompt; }
        public override string ToString() { return Name; }
    }
    public sealed class ScriptAction
    {
        public string Name { get; set; }
        public string Body { get; set; }
        public string ApprovedHash { get; set; }
        public override string ToString() { return Name; }
    }
    public sealed class AppConfig
    {
        public const string SiteUrl = "https://codex-pulse-willow-0911.wozhe0196.chatgpt.site/";
        public static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QDuoWindows");
        public string BaseUrl = "https://api.openai.com/v1";
        public string Model = "gpt-4o-mini";
        public string ApiKey = "";
        public string Token = "";
        public string SearchTemplate = "https://www.bing.com/search?q={{text}}";
        public List<AiAction> Actions = Defaults();
        public List<ScriptAction> Scripts = new List<ScriptAction>();
        static List<AiAction> Defaults()
        {
            return new List<AiAction> {
                new AiAction("翻译", "将以下文本翻译为中文；如果原文是中文，翻译为英语。保持原文信息，只输出译文。\n\n{{text}}"),
                new AiAction("润色", "润色以下文本，保持原意和原文语言。让表达清晰、自然、简洁，只输出改写结果。\n\n{{text}}"),
                new AiAction("总结", "用原文语言总结以下内容，列出核心观点与必要事实，不添加原文没有的信息。\n\n{{text}}"),
                new AiAction("解释", "用中文解释以下内容；遇到术语时给出简单示例，区分事实与推测。\n\n{{text}}")
            };
        }
        public static string Protect(string value)
        {
            return Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value ?? ""), null, DataProtectionScope.CurrentUser));
        }
        public static string Unprotect(string value)
        {
            if (String.IsNullOrEmpty(value)) return "";
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value), null, DataProtectionScope.CurrentUser));
        }
        public static string NewToken()
        {
            byte[] bytes = new byte[32];
            using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }
        public static AppConfig Load()
        {
            AppConfig result = new AppConfig();
            string path = Path.Combine(DirectoryPath, "settings.json");
            if (File.Exists(path))
            {
                try
                {
                    Dictionary<string, object> d = Diagnostics.Parse(File.ReadAllText(path, Encoding.UTF8)) as Dictionary<string, object>;
                    if (d == null) throw new InvalidDataException("设置必须是 JSON 对象。");
                    result.BaseUrl = Strings(d, "baseUrl", result.BaseUrl);
                    result.Model = Strings(d, "model", result.Model);
                    result.SearchTemplate = Strings(d, "searchTemplate", result.SearchTemplate);
                    result.ApiKey = Unprotect(Strings(d, "encryptedKey", ""));
                    result.Token = Unprotect(Strings(d, "encryptedToken", ""));
                    if (d.ContainsKey("actions"))
                    {
                        List<AiAction> actions = new JavaScriptSerializer().ConvertToType<List<AiAction>>(d["actions"]);
                        if (actions != null && actions.Count > 0) result.Actions = actions;
                    }
                    if (d.ContainsKey("scripts")) result.Scripts = new JavaScriptSerializer().ConvertToType<List<ScriptAction>>(d["scripts"]) ?? new List<ScriptAction>();
                }
                catch (Exception ex) { throw new InvalidDataException("无法读取或解密本机设置。请检查 settings.json，或将其改名后重新启动。", ex); }
            }
            if (result.Token.Length < 32) result.Token = NewToken();
            result.Save();
            return result;
        }
        public void Save()
        {
            Directory.CreateDirectory(DirectoryPath);
            Dictionary<string, object> data = new Dictionary<string, object> {
                {"version", 1}, {"baseUrl", BaseUrl}, {"model", Model},
                {"encryptedKey", Protect(ApiKey)}, {"encryptedToken", Protect(Token)},
                {"searchTemplate", SearchTemplate}, {"actions", Actions}, {"scripts", Scripts}
            };
            string destination = Path.Combine(DirectoryPath, "settings.json");
            string temporary = Path.Combine(DirectoryPath, "settings.tmp");
            File.WriteAllText(temporary, Diagnostics.Json(data), new UTF8Encoding(false));
            if (File.Exists(destination)) File.Replace(temporary, destination, null);
            else File.Move(temporary, destination);
        }
        public static string Strings(IDictionary<string, object> data, string key, string fallback)
        {
            object value;
            return data.TryGetValue(key, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) : fallback;
        }
    }

    public static class TextTransforms
    {
        public static readonly string[] Ids = {"upper", "lower", "title", "sentence", "camel", "pascal", "snake", "kebab", "trim", "collapseWhitespace", "removeBlankLines", "sortLines", "uniqueLines", "joinLines", "simplified", "traditional", "jsonFormat", "jsonMinify", "urlEncode", "urlDecode", "stripTracking", "count"};
        public static readonly string[] Labels = {"全部大写", "全部小写", "英文标题大小写", "英文句首大写", "camelCase", "PascalCase", "snake_case", "kebab-case", "去除每行首尾空格", "合并连续空白", "删除空行", "按行排序", "按行去重", "合并为一行", "繁体转简体", "简体转繁体", "JSON 格式化", "JSON 压缩", "URL 编码", "URL 解码", "删除 URL 追踪参数", "字数统计"};
        public static string Apply(string operation, string input)
        {
            string value = input ?? "";
            string[] lines = Regex.Split(value, "\\r\\n|\\n|\\r");
            switch (operation)
            {
                case "upper": return value.ToUpperInvariant();
                case "lower": return value.ToLowerInvariant();
                case "title": return CultureInfo.GetCultureInfo("en-US").TextInfo.ToTitleCase(value.ToLowerInvariant());
                case "sentence": return Regex.Replace(value.ToLowerInvariant(), @"(^|[.!?]\s+)([a-z])", m => m.Groups[1].Value + m.Groups[2].Value.ToUpperInvariant());
                case "camel": case "pascal": case "snake": case "kebab":
                    string wordsText = Regex.Replace(value.Trim(), "([a-z0-9])([A-Z])", "$1 $2");
                    wordsText = Regex.Replace(wordsText, "([A-Z])([A-Z][a-z])", "$1 $2");
                    string[] words = Regex.Split(wordsText, @"[^\p{L}\p{N}]+").Where(w => w.Length > 0).Select(w => w.ToLowerInvariant()).ToArray();
                    if (operation == "snake") return String.Join("_", words);
                    if (operation == "kebab") return String.Join("-", words);
                    return String.Concat(words.Select((word, i) => (operation == "camel" && i == 0) ? word : Char.ToUpperInvariant(word[0]) + word.Substring(1)));
                case "trim": return String.Join(Environment.NewLine, lines.Select(line => line.Trim()));
                case "collapseWhitespace": return Regex.Replace(value, @"\s+", " ").Trim();
                case "removeBlankLines": return String.Join(Environment.NewLine, lines.Where(line => !String.IsNullOrWhiteSpace(line)));
                case "sortLines": return String.Join(Environment.NewLine, lines.OrderBy(line => line, StringComparer.Ordinal));
                case "uniqueLines": return String.Join(Environment.NewLine, lines.Distinct(StringComparer.Ordinal));
                case "joinLines": return String.Join(" ", lines.Select(line => line.Trim()).Where(line => line.Length > 0));
                case "simplified": return ConvertChinese(value, VbStrConv.SimplifiedChinese);
                case "traditional": return ConvertChinese(value, VbStrConv.TraditionalChinese);
                case "jsonFormat": return PrettyJson(new JavaScriptSerializer {MaxJsonLength = 4 * 1024 * 1024}.Serialize(new JavaScriptSerializer {MaxJsonLength = 4 * 1024 * 1024}.DeserializeObject(value)));
                case "jsonMinify": return new JavaScriptSerializer {MaxJsonLength = 4 * 1024 * 1024}.Serialize(new JavaScriptSerializer {MaxJsonLength = 4 * 1024 * 1024}.DeserializeObject(value));
                case "urlEncode": return Uri.EscapeDataString(value);
                case "urlDecode": return HttpUtility.UrlDecode(value, Encoding.UTF8);
                case "stripTracking":
                    Uri url;
                    if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out url) || (url.Scheme != "http" && url.Scheme != "https")) throw new ArgumentException("请提供完整的 http 或 https URL。");
                    var query = HttpUtility.ParseQueryString(url.Query);
                    foreach (string key in query.AllKeys.Where(k => k != null).ToArray())
                        if (key.StartsWith("utm_", StringComparison.OrdinalIgnoreCase) || new[] {"fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "_ga", "yclid", "spm"}.Contains(key.ToLowerInvariant())) query.Remove(key);
                    UriBuilder builder = new UriBuilder(url); builder.Query = query.ToString(); return builder.Uri.AbsoluteUri;
                case "count":
                    int characters = new StringInfo(value).LengthInTextElements;
                    return String.Format(CultureInfo.InvariantCulture, "字符（含空白）：{0}\r\n字符（不含空白）：{1}\r\n中文汉字：{2}\r\n词（空白分隔）：{3}\r\n行数：{4}\r\nUTF-8 字节：{5}", characters, new StringInfo(Regex.Replace(value, @"\s", "")).LengthInTextElements, Regex.Matches(value, @"[\p{IsCJKUnifiedIdeographs}]").Count, Regex.Matches(value, @"\S+").Count, value.Length == 0 ? 0 : lines.Length, Encoding.UTF8.GetByteCount(value));
                default: throw new ArgumentException("未知的本地文本动作：" + operation);
            }
        }
        static string ConvertChinese(string value, VbStrConv conversion)
        {
            // StrConv passes through the locale code page. Keep emoji and characters
            // that cannot round-trip through that code page instead of turning them into '?'.
            return Regex.Replace(value, @"[\u3400-\u9fff\uf900-\ufaff]", match => {
                string converted = Strings.StrConv(match.Value, conversion, 0x0804);
                return converted.IndexOf('?') >= 0 ? match.Value : converted;
            });
        }
        static string PrettyJson(string json)
        {
            StringBuilder result = new StringBuilder(); bool quoted = false, escape = false; int depth = 0;
            foreach (char c in json)
            {
                if (quoted) { result.Append(c); if (escape) escape = false; else if (c == '\\') escape = true; else if (c == '"') quoted = false; continue; }
                if (c == '"') { quoted = true; result.Append(c); }
                else if (c == '{' || c == '[') { result.Append(c).AppendLine(); depth++; result.Append(' ', depth * 2); }
                else if (c == '}' || c == ']') { depth--; result.AppendLine().Append(' ', depth * 2).Append(c); }
                else if (c == ',') result.Append(c).AppendLine().Append(' ', depth * 2);
                else if (c == ':') result.Append(": ");
                else result.Append(c);
            }
            return result.ToString();
        }
    }

    public sealed class AiClient
    {
        readonly AppConfig config;
        public AiClient(AppConfig settings) { config = settings; }
        public static Uri Endpoint(string baseUrl)
        {
            Uri url;
            if (!Uri.TryCreate(baseUrl.Trim(), UriKind.Absolute, out url) || (url.Scheme != "https" && url.Scheme != "http")) throw new ArgumentException("Base URL 必须为完整的 http/https 地址。");
            if (url.Scheme == "http" && !url.IsLoopback) throw new ArgumentException("远程 AI 服务必须使用 HTTPS；本机 Ollama 可使用 HTTP。");
            if (!String.IsNullOrEmpty(url.UserInfo) || !String.IsNullOrEmpty(url.Query) || !String.IsNullOrEmpty(url.Fragment)) throw new ArgumentException("Base URL 不能包含账号、查询参数或锚点。");
            string path = url.AbsoluteUri.TrimEnd('/');
            if (!path.EndsWith("/chat/completions", StringComparison.OrdinalIgnoreCase)) path += "/chat/completions";
            return new Uri(path);
        }
        public async Task<string> Run(string prompt, string text, CancellationToken cancellation)
        {
            Uri url = Endpoint(config.BaseUrl);
            if (String.IsNullOrWhiteSpace(config.Model)) throw new ArgumentException("请先在设置中填写模型名称。");
            if (!url.IsLoopback && String.IsNullOrWhiteSpace(config.ApiKey)) throw new ArgumentException("请先在设置中填写 API Key。");
            string content = prompt.Contains("{{text}}") ? prompt.Replace("{{text}}", text ?? "") : prompt + "\n\n" + (text ?? "");
            var body = new Dictionary<string, object> { {"model", config.Model}, {"stream", false}, {"messages", new object[] {new Dictionary<string, object> {{"role", "user"}, {"content", content}}}} };
            using (HttpClient client = new HttpClient(new HttpClientHandler {AllowAutoRedirect = false}) {Timeout = TimeSpan.FromSeconds(100)})
            using (HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url))
            {
                if (!String.IsNullOrWhiteSpace(config.ApiKey)) request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", config.ApiKey);
                request.Content = new StringContent(Diagnostics.Json(body), Encoding.UTF8, "application/json");
                using (HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellation).ConfigureAwait(false))
                {
                    string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    if (!response.IsSuccessStatusCode) throw new InvalidOperationException("AI 服务返回 HTTP " + (int)response.StatusCode + "。请检查地址、模型、密钥和服务状态。");
                    var data = Diagnostics.Parse(json) as Dictionary<string, object>;
                    if (data == null) throw new InvalidDataException("AI 响应必须是 JSON 对象。");
                    object rawChoices;
                    if (!data.TryGetValue("choices", out rawChoices)) throw new InvalidDataException("AI 响应缺少 choices，服务需要兼容 Chat Completions API。");
                    IEnumerable choices = rawChoices as IEnumerable;
                    if (choices == null) throw new InvalidDataException("AI choices 格式无效。");
                    foreach (object choice in choices)
                    {
                        var item = choice as Dictionary<string, object>; object message;
                        if (item != null && item.TryGetValue("message", out message))
                        {
                            var m = message as Dictionary<string, object>;
                            if (m != null && m.ContainsKey("content") && m["content"] is string) return (string)m["content"];
                        }
                    }
                    throw new InvalidDataException("AI 未返回文本内容。");
                }
            }
        }
    }

    internal static class Native
    {
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
        [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
        [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
        [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr window, int id);
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        public static bool IsOwnWindow(IntPtr window)
        {
            uint pid; GetWindowThreadProcessId(window, out pid); return pid == (uint)Process.GetCurrentProcess().Id;
        }
    }
    internal sealed class SelectionSnapshot
    {
        public IntPtr Window;
        public uint ProcessId;
        public string Text;
        public bool FromOcr;
    }
    internal static class SelectionReader
    {
        public static async Task<SelectionSnapshot> Capture(IntPtr source)
        {
            SelectionSnapshot result = new SelectionSnapshot {Window = source, Text = ""};
            Native.GetWindowThreadProcessId(source, out result.ProcessId);
            if (source == IntPtr.Zero || Native.IsOwnWindow(source)) return result;
            Task<string> read = Task.Run(() => ReadAutomationSelection(source, result.ProcessId));
            if (await Task.WhenAny(read, Task.Delay(1500)) == read)
            {
                try { result.Text = await read; } catch { }
            }
            if (Native.GetForegroundWindow() != source) { result.Text = ""; return result; }
            if (!String.IsNullOrEmpty(result.Text)) return result;
            IDataObject oldData = null; bool clipboardChanged = false;
            try
            {
                oldData = Clipboard.GetDataObject();
                uint sequence = Native.GetClipboardSequenceNumber();
                SendKeys.SendWait("^c");
                for (int attempt = 0; attempt < 12; attempt++)
                {
                    await Task.Delay(50);
                    if (Native.GetClipboardSequenceNumber() != sequence) { clipboardChanged = true; break; }
                }
                if (clipboardChanged && Native.GetForegroundWindow() == source && Clipboard.ContainsText()) result.Text = Clipboard.GetText();
            }
            catch { result.Text = ""; }
            finally
            {
                if (clipboardChanged)
                {
                    try { if (oldData == null) Clipboard.Clear(); else Clipboard.SetDataObject(oldData, true, 5, 80); } catch { }
                }
            }
            return result;
        }
        static string ReadAutomationSelection(IntPtr source, uint sourceProcess)
        {
            if (Native.GetForegroundWindow() != source) return "";
            AutomationElement focused = AutomationElement.FocusedElement;
            for (int ancestor = 0; focused != null && ancestor < 5; ancestor++)
            {
                if ((uint)focused.Current.ProcessId != sourceProcess || Native.GetForegroundWindow() != source) return "";
                object pattern;
                if (focused.TryGetCurrentPattern(TextPattern.Pattern, out pattern))
                {
                    TextPattern textPattern = (TextPattern)pattern;
                    TextPatternRange[] ranges = textPattern.GetSelection();
                    string selected = String.Join("\n", ranges.Select(r => r.GetText(200000)));
                    if (!String.IsNullOrWhiteSpace(selected) && Native.GetForegroundWindow() == source) return selected;
                }
                focused = TreeWalker.ControlViewWalker.GetParent(focused);
            }
            return "";
        }
        public static async Task WaitForModifiers()
        {
            for (int i = 0; i < 25; i++)
            {
                if ((Native.GetAsyncKeyState(0x11) & 0x8000) == 0 && (Native.GetAsyncKeyState(0x12) & 0x8000) == 0 && (Native.GetAsyncKeyState(0x10) & 0x8000) == 0) return;
                await Task.Delay(40);
            }
            throw new InvalidOperationException("请松开 Ctrl、Alt、Shift 后再试。");
        }
        public static async Task<bool> PasteVerified(SelectionSnapshot snapshot, string value, bool append)
        {
            if (snapshot == null || snapshot.FromOcr || snapshot.Window == IntPtr.Zero || !Native.IsWindow(snapshot.Window)) return false;
            uint process; Native.GetWindowThreadProcessId(snapshot.Window, out process);
            if (process != snapshot.ProcessId) return false;
            if (!Native.SetForegroundWindow(snapshot.Window)) return false;
            await Task.Delay(200);
            if (Native.GetForegroundWindow() != snapshot.Window) return false;
            SelectionSnapshot current = await Capture(snapshot.Window);
            if (String.IsNullOrEmpty(current.Text) || !String.Equals(current.Text, snapshot.Text, StringComparison.Ordinal)) return false;
            IDataObject saved = Clipboard.GetDataObject();
            try
            {
                Clipboard.SetText(append ? snapshot.Text + Environment.NewLine + value : value);
                if (Native.GetForegroundWindow() != snapshot.Window) return false;
                SendKeys.SendWait("^v");
                await Task.Delay(500);
                return true;
            }
            finally { try { if (saved != null) Clipboard.SetDataObject(saved, true, 5, 80); else Clipboard.Clear(); } catch { } }
        }
    }

    public static class SafeBrowser
    {
        public static string Validate(string url)
        {
            Uri parsed;
            if (!Uri.TryCreate(url, UriKind.Absolute, out parsed) || (parsed.Scheme != "https" && parsed.Scheme != "http") || !String.IsNullOrEmpty(parsed.UserInfo)) throw new ArgumentException("只允许打开完整的 HTTP/HTTPS 网页地址。");
            IPAddress address;
            if (parsed.IsLoopback || parsed.Host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) || !parsed.Host.Contains(".")) throw new ArgumentException("网页动作不能打开本机或内网地址。");
            if (IPAddress.TryParse(parsed.Host, out address))
            {
                byte[] bytes = address.GetAddressBytes();
                if (address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork || bytes[0] == 10 || bytes[0] == 127 || bytes[0] == 0 || bytes[0] >= 224 || (bytes[0] == 169 && bytes[1] == 254) || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] == 192 && bytes[1] == 168)) throw new ArgumentException("网页动作不能打开本机或内网地址。");
            }
            return parsed.AbsoluteUri;
        }
        public static void Open(string url) { Process.Start(new ProcessStartInfo(Validate(url)) {UseShellExecute = true}); }
    }

    internal sealed class SnipForm : Form
    {
        Point anchor; Rectangle selection; bool dragging;
        public Rectangle SelectedRectangle { get; private set; }
        public SnipForm()
        {
            FormBorderStyle = FormBorderStyle.None; Bounds = SystemInformation.VirtualScreen; TopMost = true;
            BackColor = Color.Black; Opacity = 0.32; Cursor = Cursors.Cross; DoubleBuffered = true; KeyPreview = true;
            MouseDown += (s, e) => { if (e.Button == MouseButtons.Left) { anchor = e.Location; dragging = true; selection = new Rectangle(anchor, Size.Empty); } else { DialogResult = DialogResult.Cancel; Close(); } };
            MouseMove += (s, e) => { if (dragging) { selection = Rectangle.FromLTRB(Math.Min(anchor.X, e.X), Math.Min(anchor.Y, e.Y), Math.Max(anchor.X, e.X), Math.Max(anchor.Y, e.Y)); Invalidate(); } };
            MouseUp += (s, e) => { if (dragging) { dragging = false; if (selection.Width >= 8 && selection.Height >= 8) { SelectedRectangle = new Rectangle(selection.X + Left, selection.Y + Top, selection.Width, selection.Height); DialogResult = DialogResult.OK; } else DialogResult = DialogResult.Cancel; Close(); } };
            KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) { DialogResult = DialogResult.Cancel; Close(); } };
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.DrawString("拖动框选识别区域 · Esc 取消", new Font("Microsoft YaHei UI", 18), Brushes.White, 24, 24);
            if (selection.Width > 0) using (Pen pen = new Pen(Color.Cyan, 3)) e.Graphics.DrawRectangle(pen, selection);
        }
    }

    internal static class OcrRunner
    {
        public static async Task<string> Recognize(string imagePath)
        {
            string script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Ocr.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("缺少随程序提供的 Ocr.ps1。请解压完整文件夹。", script);
            string scriptText = File.ReadAllText(script, Encoding.UTF8);
            // Prevent running a replaced on-disk script without native review; the distributed fixed bridge is hashed at build.
            string expectedFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Ocr.sha256");
            if (!File.Exists(expectedFile) || !String.Equals(ScriptRunner.Hash(scriptText), File.ReadAllText(expectedFile).Trim(), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("OCR 桥接脚本校验未通过。请从完整安装包重新解压 Ocr.ps1 和 Ocr.sha256。");
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
            return await Task.Run(() => {
                var start = new ProcessStartInfo(powershell, "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\" -ImagePath \"" + imagePath + "\"") {UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8};
                using (Process process = Process.Start(start))
                {
                    Task<string> output = process.StandardOutput.ReadToEndAsync(); Task<string> error = process.StandardError.ReadToEndAsync();
                    if (!process.WaitForExit(45000)) { process.Kill(); throw new TimeoutException("本地 OCR 超过 45 秒。请缩小截图范围后重试。"); }
                    Task.WaitAll(output, error);
                    if (process.ExitCode != 0) throw new InvalidOperationException("本地 OCR 失败：" + error.Result.Trim());
                    return output.Result.Trim();
                }
            });
        }
    }

    internal static class ScriptRunner
    {
        public static string Hash(string script)
        {
            using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(script ?? ""))).Replace("-", "").ToLowerInvariant();
        }
        public static async Task<string> Run(ScriptAction script, string text)
        {
            if (String.IsNullOrEmpty(script.ApprovedHash) || script.ApprovedHash != Hash(script.Body)) throw new InvalidOperationException("此脚本尚未审核，或内容已经修改。");
            string temporary = Path.Combine(AppConfig.DirectoryPath, "script-" + Guid.NewGuid().ToString("N") + ".ps1");
            File.WriteAllText(temporary, "$OutputEncoding = [Console]::OutputEncoding = [Console]::InputEncoding = [Text.UTF8Encoding]::new($false)\r\n$QDuoText = [Console]::In.ReadToEnd()\r\n" + script.Body, new UTF8Encoding(true));
            try
            {
                return await Task.Run(() => {
                    string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
                    var start = new ProcessStartInfo(powershell, "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + temporary + "\"") {UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8};
                    using (Process process = Process.Start(start))
                    {
                        Task<string> output = process.StandardOutput.ReadToEndAsync(); Task<string> error = process.StandardError.ReadToEndAsync();
                        using (StreamWriter writer = new StreamWriter(process.StandardInput.BaseStream, new UTF8Encoding(false))) writer.Write(text ?? "");
                        if (!process.WaitForExit(30000)) { process.Kill(); throw new TimeoutException("脚本超过 30 秒，已终止。"); }
                        Task.WaitAll(output, error);
                        if (process.ExitCode != 0) throw new InvalidOperationException(error.Result.Trim());
                        return output.Result.TrimEnd();
                    }
                });
            }
            finally { try { File.Delete(temporary); } catch { } }
        }
    }

    internal sealed class PromptEditor : Form
    {
        public TextBox NameBox, BodyBox;
        public PromptEditor(string caption, string name, string body, bool script)
        {
            Text = caption; Size = new Size(690, 570); StartPosition = FormStartPosition.CenterParent; MinimumSize = new Size(500, 400);
            Font = new Font("Microsoft YaHei UI", 10); Padding = new Padding(16);
            var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5};
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 25)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 35)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
            layout.Controls.Add(new Label {Text = "动作名称", Dock = DockStyle.Fill}, 0, 0);
            NameBox = new TextBox {Text = name, Dock = DockStyle.Fill}; layout.Controls.Add(NameBox, 0, 1);
            layout.Controls.Add(new Label {Text = script ? "脚本在本机以你的用户权限运行，可读写文件和联网。输入文本在 $QDuoText 中。保存后首次执行必须审核；每次修改后重新审核。" : "提示词中的 {{text}} 会替换为当前文本。AI 会把该文本发送到你设置的服务。", Dock = DockStyle.Fill}, 0, 2);
            BodyBox = new TextBox {Text = body, Multiline = true, AcceptsReturn = true, AcceptsTab = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, Font = new Font("Consolas", 11)}; layout.Controls.Add(BodyBox, 0, 3);
            var controls = new FlowLayoutPanel {Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft};
            var save = new Button {Text = "保存", Width = 100, Height = 34}; save.Click += (s, e) => { if (String.IsNullOrWhiteSpace(NameBox.Text) || String.IsNullOrWhiteSpace(BodyBox.Text)) { MessageBox.Show(this, "名称和内容都需要填写。", "QDuo"); return; } DialogResult = DialogResult.OK; Close(); };
            var cancel = new Button {Text = "取消", Width = 100, Height = 34, DialogResult = DialogResult.Cancel}; controls.Controls.Add(save); controls.Controls.Add(cancel); layout.Controls.Add(controls, 0, 4); Controls.Add(layout); AcceptButton = save; CancelButton = cancel;
        }
    }

    internal sealed class CapsuleForm : Form
    {
        public CapsuleForm(MainForm main, string text)
        {
            Text = "QDuo 划词动作"; FormBorderStyle = FormBorderStyle.FixedToolWindow; TopMost = true;
            StartPosition = FormStartPosition.Manual; Size = new Size(510, 150); Font = new Font("Microsoft YaHei UI", 10);
            Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea; Location = new Point(Math.Min(Math.Max(Cursor.Position.X - 250, area.Left), area.Right - Width), Math.Min(Cursor.Position.Y + 16, area.Bottom - Height));
            var preview = new Label {Dock = DockStyle.Top, Height = 45, Padding = new Padding(12, 8, 12, 0), Text = text.Length > 82 ? text.Substring(0, 82) + "…" : text}; Controls.Add(preview);
            var buttons = new FlowLayoutPanel {Dock = DockStyle.Bottom, Height = 56, Padding = new Padding(8)};
            foreach (string label in new[] {"翻译", "润色", "总结", "解释"})
            {
                string action = label; var button = new Button {Text = action, Width = 74, Height = 32}; button.Click += async (s, e) => { Close(); main.OpenWorkspace(); await main.RunNamedAi(action); }; buttons.Controls.Add(button);
            }
            var more = new Button {Text = "更多动作", Width = 120, Height = 32}; more.Click += (s, e) => { Close(); main.OpenWorkspace(); }; buttons.Controls.Add(more); Controls.Add(buttons);
        }
    }

    public sealed class MainForm : Form
    {
        readonly AppConfig config; readonly AiClient ai; readonly NotifyIcon tray; readonly System.Windows.Forms.Timer foregroundTimer;
        LocalBridge bridge; SpeechSynthesizer speech; CancellationTokenSource currentRequest;
        TextBox input, output, report, baseUrl, model, apiKey, token, searchTemplate; Label status, bridgeStatus;
        ComboBox transform, aiActions, scripts; TabControl tabs; Button runAi; SelectionSnapshot selected; IntPtr lastExternal;
        bool exiting, capturing; readonly bool headless;
        public MainForm(bool hidden)
        {
            headless = hidden; config = AppConfig.Load(); ai = new AiClient(config);
            Text = "QDuo Windows · 划词与本机体检"; Size = new Size(1000, 760); MinimumSize = new Size(860, 610); StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Microsoft YaHei UI", 10); BackColor = Color.FromArgb(246, 248, 250);
            tabs = new TabControl {Dock = DockStyle.Fill, Padding = new Point(18, 8)};
            tabs.TabPages.Add(BuildWorkspace()); tabs.TabPages.Add(BuildDiagnostics()); tabs.TabPages.Add(BuildSettings()); Controls.Add(tabs);
            status = new Label {Dock = DockStyle.Bottom, Height = 34, Padding = new Padding(16, 7, 0, 0), Text = "Ctrl+Alt+Q 划词动作 · Ctrl+Alt+S 截图识字 · 关闭窗口后留在托盘", ForeColor = Color.FromArgb(60, 79, 90)}; Controls.Add(status);
            var context = new ContextMenuStrip(); context.Items.Add("打开 QDuo", null, (s, e) => OpenWorkspace()); context.Items.Add("查看应用与 C 盘", null, (s, e) => { OpenWorkspace(); tabs.SelectedIndex = 1; }); context.Items.Add("打开网站板块", null, (s, e) => SafeBrowser.Open(AppConfig.SiteUrl + "#qduo")); context.Items.Add("退出", null, (s, e) => { exiting = true; Close(); });
            tray = new NotifyIcon {Icon = SystemIcons.Application, Text = "QDuo Windows · Ctrl+Alt+Q", Visible = true, ContextMenuStrip = context}; tray.DoubleClick += (s, e) => OpenWorkspace();
            foregroundTimer = new System.Windows.Forms.Timer {Interval = 300}; foregroundTimer.Tick += (s, e) => { IntPtr handle = Native.GetForegroundWindow(); if (handle != IntPtr.Zero && !Native.IsOwnWindow(handle)) lastExternal = handle; }; foregroundTimer.Start();
            try { bridge = new LocalBridge(config.Token, Diagnostics.BuildReport, OpenCleanupFromBridge, HandleWebAction, HandleLocalService); bridge.Start(); bridgeStatus.Text = "本机接口已开启 · http://127.0.0.1:" + bridge.Port + " · 配对码仅在此窗口显示"; }
            catch (Exception ex) { bridgeStatus.Text = "本机接口未开启：" + ex.Message; }
            Shown += (s, e) => { if (headless) Hide(); };
            FormClosing += OnClosing;
        }
        TabPage BuildWorkspace()
        {
            var page = new TabPage("文本工作台"); var layout = new TableLayoutPanel {Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 7};
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 44)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 56)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 47));
            layout.Controls.Add(new Label {Text = "选中文本后按 Ctrl+Alt+Q，或直接在下方粘贴。AI 使用你自己的服务；本地转换不联网。", Dock = DockStyle.Fill}, 0, 0);
            input = new TextBox {Multiline = true, AcceptsReturn = true, AcceptsTab = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, Font = new Font("Microsoft YaHei UI", 11)}; layout.Controls.Add(input, 0, 1);
            var aiRow = Row(); aiActions = new ComboBox {Width = 155, DropDownStyle = ComboBoxStyle.DropDownList}; runAi = MakeButton("运行 AI", async () => await RunSelectedAi());
            aiRow.Controls.Add(aiActions); aiRow.Controls.Add(runAi); aiRow.Controls.Add(MakeButton("取消请求", () => { if (currentRequest != null) currentRequest.Cancel(); })); aiRow.Controls.Add(MakeButton("新建 AI 动作", () => EditAi(true))); aiRow.Controls.Add(MakeButton("编辑动作", () => EditAi(false))); aiRow.Controls.Add(MakeButton("删除动作", DeleteAi)); layout.Controls.Add(aiRow, 0, 2);
            var localRow = Row(); transform = new ComboBox {Width = 210, DropDownStyle = ComboBoxStyle.DropDownList}; transform.Items.AddRange(TextTransforms.Labels); transform.SelectedIndex = 0; localRow.Controls.Add(transform); localRow.Controls.Add(MakeButton("本地转换", () => TryAction(() => output.Text = TextTransforms.Apply(TextTransforms.Ids[transform.SelectedIndex], input.Text)))); localRow.Controls.Add(MakeButton("朗读", () => Speak(input.Text))); localRow.Controls.Add(MakeButton("停止朗读", () => { if (speech != null) speech.SpeakAsyncCancelAll(); })); localRow.Controls.Add(MakeButton("网页搜索", () => TryAction(() => SafeBrowser.Open(config.SearchTemplate.Replace("{{text}}", Uri.EscapeDataString(input.Text)))))); layout.Controls.Add(localRow, 0, 3);
            var scriptsRow = Row(); scripts = new ComboBox {Width = 210, DropDownStyle = ComboBoxStyle.DropDownList}; scriptsRow.Controls.Add(scripts); scriptsRow.Controls.Add(MakeButton("运行脚本", async () => await RunScript())); scriptsRow.Controls.Add(MakeButton("新建脚本", () => EditScript(true))); scriptsRow.Controls.Add(MakeButton("编辑脚本", () => EditScript(false))); scriptsRow.Controls.Add(MakeButton("删除脚本", DeleteScript)); scriptsRow.Controls.Add(MakeButton("截图识字", async () => await CaptureOcr())); layout.Controls.Add(scriptsRow, 0, 4);
            output = new TextBox {Multiline = true, ReadOnly = false, AcceptsReturn = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, Font = new Font("Microsoft YaHei UI", 11), BackColor = Color.FromArgb(240, 245, 246)}; layout.Controls.Add(output, 0, 5);
            var resultRow = Row(); resultRow.Controls.Add(MakeButton("复制结果", () => TryAction(() => { Clipboard.SetText(output.Text); status.Text = "结果已复制。"; }))); resultRow.Controls.Add(MakeButton("替换原选区", async () => await PasteResult(false))); resultRow.Controls.Add(MakeButton("追加到原选区", async () => await PasteResult(true))); resultRow.Controls.Add(MakeButton("作为新输入", () => { input.Text = output.Text; selected = null; })); layout.Controls.Add(resultRow, 0, 6); page.Controls.Add(layout); RefreshActions(); return page;
        }
        TabPage BuildDiagnostics()
        {
            var page = new TabPage("应用与 C 盘"); var layout = new TableLayoutPanel {Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 4};
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 62)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
            layout.Controls.Add(new Label {Text = "只读体检：查看磁盘空间、运行进程、已安装应用和已知缓存目录占用。体检不会删除文件。建议通过 Windows 存储设置执行系统支持的清理。", Dock = DockStyle.Fill}, 0, 0);
            var scan = Row(); scan.Controls.Add(MakeButton("快速体检", async () => await Scan(false))); scan.Controls.Add(MakeButton("扫描缓存与大文件", async () => await Scan(true))); scan.Controls.Add(MakeButton("Windows 存储设置", OpenCleanup)); scan.Controls.Add(MakeButton("打开网页体检板块", () => SafeBrowser.Open(AppConfig.SiteUrl + "#qduo"))); layout.Controls.Add(scan, 0, 1);
            report = new TextBox {Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new Font("Consolas", 10), Text = "点击快速体检查看本机状态；扩展扫描会读取已知缓存目录和 Downloads 大文件，时间取决于文件数量与访问权限。"}; layout.Controls.Add(report, 0, 2);
            var export = Row(); export.Controls.Add(MakeButton("导出体检 JSON", ExportReport)); layout.Controls.Add(export, 0, 3); page.Controls.Add(layout); return page;
        }
        TabPage BuildSettings()
        {
            var page = new TabPage("连接与设置"); var flow = new FlowLayoutPanel {Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(18)};
            flow.Controls.Add(new Label {Text = "网站配对 · 在网站 QDuo 板块填写下方配对码", AutoSize = true, Font = new Font(Font, FontStyle.Bold)});
            bridgeStatus = new Label {Text = "正在启动本机接口…", Width = 865, Height = 40}; flow.Controls.Add(bridgeStatus);
            token = new TextBox {Text = config.Token, Width = 800, ReadOnly = true, UseSystemPasswordChar = true}; flow.Controls.Add(token);
            var tokenButtons = Row(); tokenButtons.Width = 840; tokenButtons.Controls.Add(MakeButton("复制配对码", () => { Clipboard.SetText(config.Token); status.Text = "配对码已复制，请只填入你的网站。"; })); tokenButtons.Controls.Add(MakeButton("显示 / 隐藏", () => token.UseSystemPasswordChar = !token.UseSystemPasswordChar)); tokenButtons.Controls.Add(MakeButton("重新生成", RotateToken)); tokenButtons.Controls.Add(MakeButton("打开网站", () => SafeBrowser.Open(AppConfig.SiteUrl + "#qduo"))); flow.Controls.Add(tokenButtons);
            flow.Controls.Add(new Label {Text = "AI 服务 · OpenAI 兼容接口 / 本机 Ollama", AutoSize = true, Margin = new Padding(3, 18, 3, 9), Font = new Font(Font, FontStyle.Bold)});
            baseUrl = SettingsBox(flow, "Base URL（示例 https://api.openai.com/v1 或 http://localhost:11434/v1）", config.BaseUrl, false);
            model = SettingsBox(flow, "模型名称（需要服务端已经提供的模型）", config.Model, false);
            apiKey = SettingsBox(flow, "API Key（使用当前 Windows 用户的 DPAPI 加密保存；Ollama 可以留空）", config.ApiKey, true);
            searchTemplate = SettingsBox(flow, "搜索 URL 模板（{{text}} 为 URL 编码后的文本）", config.SearchTemplate, false);
            var settingsButtons = Row(); settingsButtons.Width = 840; settingsButtons.Controls.Add(MakeButton("保存设置", SaveSettings)); settingsButtons.Controls.Add(MakeButton("使用 Ollama", () => { baseUrl.Text = "http://localhost:11434/v1"; model.Text = "qwen3:8b"; apiKey.Text = ""; status.Text = "请填写你已安装的 Ollama 模型名，再保存。"; })); flow.Controls.Add(settingsButtons);
            flow.Controls.Add(new Label {Text = "Ctrl+Alt+Q：读取当前选区并弹出动作胶囊。Ctrl+Alt+S：框选截图并在本机识别。\r\n简繁转换使用 Windows 系统转换；没有内置拼音词典。OCR 需要 Windows 10/11 和已安装的识别语言。\r\n上游参考：XueshiQiao/qduo · 本 Windows 实现使用 GPL-3.0-or-later。", Width = 850, Height = 98, Margin = new Padding(3, 16, 3, 3)});
            page.Controls.Add(flow); return page;
        }
        static TextBox SettingsBox(FlowLayoutPanel flow, string label, string value, bool password)
        {
            flow.Controls.Add(new Label {Text = label, Width = 850, Height = 26, Margin = new Padding(3, 8, 3, 0)});
            var text = new TextBox {Text = value, Width = 800, UseSystemPasswordChar = password}; flow.Controls.Add(text); return text;
        }
        static FlowLayoutPanel Row() { return new FlowLayoutPanel {Dock = DockStyle.Fill, Height = 44, WrapContents = false, AutoScroll = true, Padding = new Padding(0, 5, 0, 0)}; }
        static Button MakeButton(string text, Action action) { var b = new Button {Text = text, AutoSize = true, Height = 33, Padding = new Padding(8, 0, 8, 0), Margin = new Padding(3)}; b.Click += (s, e) => action(); return b; }
        void TryAction(Action action) { try { action(); } catch (Exception ex) { Error(ex); } }
        void Error(Exception ex) { status.Text = ex.Message; MessageBox.Show(this, ex.Message, "QDuo Windows", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        public void OpenWorkspace() { Show(); WindowState = FormWindowState.Normal; Activate(); }
        void RefreshActions()
        {
            if (aiActions != null) { aiActions.DataSource = null; aiActions.DataSource = config.Actions.ToList(); }
            if (scripts != null) { scripts.DataSource = null; scripts.DataSource = config.Scripts.ToList(); }
        }
        void EditAi(bool create)
        {
            AiAction action = create ? new AiAction("自定义动作", "处理以下文本：\n\n{{text}}") : aiActions.SelectedItem as AiAction;
            if (action == null) return;
            using (var editor = new PromptEditor(create ? "新建 AI 动作" : "编辑 AI 动作", action.Name, action.Prompt, false))
            {
                if (editor.ShowDialog(this) != DialogResult.OK) return;
                action.Name = editor.NameBox.Text.Trim(); action.Prompt = editor.BodyBox.Text; if (create) config.Actions.Add(action); config.Save(); RefreshActions();
            }
        }
        void DeleteAi()
        {
            AiAction action = aiActions.SelectedItem as AiAction; if (action == null) return;
            if (MessageBox.Show(this, "删除动作“" + action.Name + "”？", "QDuo", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            config.Actions.Remove(action); config.Save(); RefreshActions();
        }
        void EditScript(bool create)
        {
            ScriptAction action = create ? new ScriptAction {Name = "本地脚本", Body = "$QDuoText.ToUpperInvariant()"} : scripts.SelectedItem as ScriptAction;
            if (action == null) return;
            using (var editor = new PromptEditor(create ? "新建 PowerShell 动作" : "编辑 PowerShell 动作", action.Name, action.Body, true))
            {
                if (editor.ShowDialog(this) != DialogResult.OK) return;
                if (action.Body != editor.BodyBox.Text) action.ApprovedHash = "";
                action.Name = editor.NameBox.Text.Trim(); action.Body = editor.BodyBox.Text; if (create) config.Scripts.Add(action); config.Save(); RefreshActions();
            }
        }
        void DeleteScript()
        {
            ScriptAction action = scripts.SelectedItem as ScriptAction; if (action == null) return;
            if (MessageBox.Show(this, "删除脚本“" + action.Name + "”？", "QDuo", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            config.Scripts.Remove(action); config.Save(); RefreshActions();
        }
        async Task RunScript()
        {
            ScriptAction script = scripts.SelectedItem as ScriptAction; if (script == null) { status.Text = "请先新建本地脚本。"; return; }
            try
            {
                if (script.ApprovedHash != ScriptRunner.Hash(script.Body))
                {
                    using (var review = new PromptEditor("审核脚本 · 本机权限执行", script.Name, script.Body, true))
                    {
                        review.NameBox.ReadOnly = true; review.BodyBox.ReadOnly = true;
                        if (review.ShowDialog(this) != DialogResult.OK) return;
                    }
                    if (MessageBox.Show(this, "已阅读此脚本，并允许它使用当前用户权限执行？脚本可以访问本机文件及网络。", "批准此版本脚本", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
                    script.ApprovedHash = ScriptRunner.Hash(script.Body); config.Save();
                }
                status.Text = "本地脚本正在运行…"; output.Text = await ScriptRunner.Run(script, input.Text); status.Text = "脚本完成。";
            }
            catch (Exception ex) { Error(ex); }
        }
        public async Task RunNamedAi(string name)
        {
            AiAction action = config.Actions.FirstOrDefault(a => a.Name == name);
            if (action == null) { status.Text = "动作已删除，请从列表选择其他动作。"; return; }
            await RunAi(action);
        }
        async Task RunSelectedAi() { AiAction action = aiActions.SelectedItem as AiAction; if (action != null) await RunAi(action); }
        async Task RunAi(AiAction action)
        {
            if (String.IsNullOrWhiteSpace(input.Text)) { status.Text = "请先选中、截图或输入文本。"; return; }
            if (currentRequest != null) { status.Text = "已有 AI 请求，完成或取消后再运行。"; return; }
            currentRequest = new CancellationTokenSource(); runAi.Enabled = false; status.Text = "正在运行“" + action.Name + "”…";
            try { output.Text = await ai.Run(action.Prompt, input.Text, currentRequest.Token); status.Text = "AI 动作完成。可复制、替换或追加。"; }
            catch (OperationCanceledException) { status.Text = "请求已取消或超时。"; }
            catch (Exception ex) { Error(ex); }
            finally { currentRequest.Dispose(); currentRequest = null; runAi.Enabled = true; }
        }
        void Speak(string value)
        {
            TryAction(() => StartSpeech(value));
        }
        void StartSpeech(string value)
        {
            if (String.IsNullOrWhiteSpace(value)) throw new ArgumentException("朗读需要文本。");
            if (speech == null) speech = new SpeechSynthesizer(); speech.SpeakAsyncCancelAll(); speech.SpeakAsync(value); status.Text = "正在使用 Windows 已安装的声音朗读。";
        }
        async Task PasteResult(bool append)
        {
            if (String.IsNullOrEmpty(output.Text)) return;
            try
            {
                bool same = selected != null && lastExternal == selected.Window;
                if (same && await SelectionReader.PasteVerified(selected, output.Text, append)) { status.Text = append ? "结果已追加到原选区。" : "已向原选区发送粘贴。请确认目标应用的结果。"; selected = null; }
                else { Clipboard.SetText(output.Text); OpenWorkspace(); status.Text = "原窗口或选区无法确认，结果已复制，请手动粘贴。"; }
            }
            catch (Exception ex) { TryAction(() => Clipboard.SetText(output.Text)); OpenWorkspace(); status.Text = "回写未完成，结果已复制。" + ex.Message; }
        }
        async Task CaptureSelection()
        {
            if (capturing) return; capturing = true;
            try
            {
                IntPtr window = Native.GetForegroundWindow();
                await SelectionReader.WaitForModifiers();
                if (Native.GetForegroundWindow() != window) return;
                SelectionSnapshot selection = await SelectionReader.Capture(window);
                if (String.IsNullOrWhiteSpace(selection.Text)) { OpenWorkspace(); status.Text = "未读取到选区。请先选中文本，或直接粘贴到工作台。"; return; }
                selected = selection; lastExternal = selection.Window; input.Text = selection.Text;
                new CapsuleForm(this, selection.Text).Show(); status.Text = "已读取当前选区。";
            }
            catch (Exception ex) { OpenWorkspace(); Error(ex); }
            finally { capturing = false; }
        }
        async Task CaptureOcr()
        {
            if (capturing) return; capturing = true; string imagePath = null;
            try
            {
                await SelectionReader.WaitForModifiers();
                Hide(); await Task.Delay(170);
                Rectangle rectangle;
                using (var snip = new SnipForm()) { if (snip.ShowDialog() != DialogResult.OK) return; rectangle = snip.SelectedRectangle; }
                await Task.Delay(180);
                Directory.CreateDirectory(AppConfig.DirectoryPath); imagePath = Path.Combine(AppConfig.DirectoryPath, "ocr-" + Guid.NewGuid().ToString("N") + ".png");
                using (Bitmap screenshot = new Bitmap(rectangle.Width, rectangle.Height)) { using (Graphics g = Graphics.FromImage(screenshot)) g.CopyFromScreen(rectangle.Location, Point.Empty, rectangle.Size); screenshot.Save(imagePath, ImageFormat.Png); }
                OpenWorkspace(); tabs.SelectedIndex = 0; status.Text = "正在本机识别截图文字…";
                string text = await OcrRunner.Recognize(imagePath); input.Text = text; selected = new SelectionSnapshot {Text = text, FromOcr = true}; status.Text = String.IsNullOrWhiteSpace(text) ? "截图中未识别到文字。请安装相应 Windows OCR 语言或扩大区域。" : "截图文字已识别，可运行 AI 或本地转换。";
            }
            catch (Exception ex) { OpenWorkspace(); Error(ex); }
            finally { capturing = false; if (imagePath != null) { try { File.Delete(imagePath); } catch { } } OpenWorkspace(); }
        }
        async Task Scan(bool deep)
        {
            status.Text = deep ? "正在扫描已知缓存与 Downloads 大文件…" : "正在读取本机状态…";
            try { var data = await Task.Run(() => Diagnostics.BuildReport(deep)); report.Text = TextTransforms.Apply("jsonFormat", Diagnostics.Json(data)); status.Text = "只读体检完成。访问不到的目录会在报告中标记。"; }
            catch (Exception ex) { Error(ex); }
        }
        void ExportReport()
        {
            TryAction(() => { if (!report.Text.TrimStart().StartsWith("{")) throw new InvalidOperationException("请先完成一次体检。"); using (var save = new SaveFileDialog {Filter = "JSON 文件 (*.json)|*.json", FileName = "QDuo-Windows-report-" + DateTime.Now.ToString("yyyyMMdd-HHmm") + ".json"}) { if (save.ShowDialog(this) == DialogResult.OK) File.WriteAllText(save.FileName, report.Text, new UTF8Encoding(false)); } });
        }
        void OpenCleanup() { TryAction(() => Process.Start(new ProcessStartInfo("ms-settings:storagesense") {UseShellExecute = true})); }
        void OpenCleanupFromBridge() { if (!IsDisposed) BeginInvoke(new Action(OpenCleanup)); }
        void SaveSettings()
        {
            TryAction(() => { AiClient.Endpoint(baseUrl.Text); SafeBrowser.Validate(searchTemplate.Text.Replace("{{text}}", "test")); if (!searchTemplate.Text.Contains("{{text}}")) throw new ArgumentException("搜索模板需要 {{text}} 占位符。"); config.BaseUrl = baseUrl.Text.Trim(); config.Model = model.Text.Trim(); config.ApiKey = apiKey.Text.Trim(); config.SearchTemplate = searchTemplate.Text.Trim(); config.Save(); status.Text = "设置已保存，密钥已使用 Windows DPAPI 加密。"; });
        }
        void RotateToken()
        {
            TryAction(() => { if (bridge != null) bridge.Dispose(); config.Token = AppConfig.NewToken(); config.Save(); token.Text = config.Token; bridge = new LocalBridge(config.Token, Diagnostics.BuildReport, OpenCleanupFromBridge, HandleWebAction, HandleLocalService); bridge.Start(); bridgeStatus.Text = "本机接口已开启 · http://127.0.0.1:" + bridge.Port; status.Text = "配对码已重新生成。旧网站连接需要重新配对。"; });
        }
        public async Task<object> HandleLocalService(string path, Dictionary<string, object> request)
        {
            switch (path)
            {
                case "/safety/status": return await Task.Run(() => SafetyService.GetStatus());
                case "/safety/scan": return await Task.Run(() => SafetyService.Scan(ServiceRoutes.Deep(request)));
                case "/safety/plan": return await Task.Run(() => SafetyService.CreatePlan(ServiceRoutes.Text(request, "risk"), ServiceRoutes.Ids(request)));
                case "/safety/clean":
                    string planId = ServiceRoutes.Text(request, "planId");
                    var plan = await Task.Run(() => SafetyService.GetPlan(planId)) as Dictionary<string, object>;
                    if (plan == null) throw new InvalidOperationException("清理计划格式无效。");
                    bool medium = ServiceRoutes.Text(plan, "risk") == "medium";
                    bool approved = !medium || await ConfirmLocalOperation("确认中风险缓存隔离", "以下清单在这台电脑上生成。文件将存入可恢复隔离区；请核对路径和保护规则。", plan);
                    if (!approved) throw new InvalidOperationException("已在本机取消清理，文件未变动。");
                    return await Task.Run(() => SafetyService.ExecutePlan(planId, medium && approved));
                case "/safety/restore": return await Task.Run(() => SafetyService.Restore(ServiceRoutes.Text(request, "transactionId")));
                case "/security/status": return await Task.Run(() => SafetyService.DefenderStatus());
                case "/security/start":
                    string action = ServiceRoutes.Text(request, "action");
                    if (action == "remediate")
                    {
                        var security = await Task.Run(() => SafetyService.DefenderStatus());
                        if (!await ConfirmLocalOperation("确认 Windows Defender 威胁处理", "Windows Defender 将按系统策略处理已检测到的威胁。请核对下面的检测信息；正常文件不会被当作清理缓存。", security))
                            throw new InvalidOperationException("已在本机取消威胁处理。");
                    }
                    return await Task.Run(() => SafetyService.StartDefender(action));
                case "/files/roots": return await Task.Run(() => FileCatalog.GetRoots());
                case "/files/scan": return await Task.Run(() => FileCatalog.Scan(ServiceRoutes.Deep(request), ServiceRoutes.Value(request, "bookmarks"), ServiceRoutes.Value(request, "bindings")));
                case "/files/list": return await Task.Run(() => FileCatalog.ListFiles(ServiceRoutes.Text(request, "query"), ServiceRoutes.Text(request, "category", "all"), ServiceRoutes.Text(request, "cursor"), ServiceRoutes.Limit(request)));
                case "/files/thumbnail": return await Task.Run(() => FileCatalog.Thumbnail(ServiceRoutes.Text(request, "id")));
                case "/files/bindings": return await Task.Run(() => FileCatalog.SetBindings(ServiceRoutes.Value(request, "bindings")));
                default: throw new ArgumentException("不支持此本机操作。");
            }
        }
        Task<bool> ConfirmLocalOperation(string title, string description, object details)
        {
            var promise = new TaskCompletionSource<bool>();
            if (IsDisposed || !IsHandleCreated) { promise.SetException(new InvalidOperationException("本机确认窗口尚未就绪。")); return promise.Task; }
            BeginInvoke(new Action(() => {
                try
                {
                    using (var dialog = new Form {Text = title, Size = new Size(890, 660), MinimumSize = new Size(720, 480), StartPosition = FormStartPosition.CenterScreen, Font = Font, ShowInTaskbar = true})
                    {
                        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 3};
                        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 76)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
                        layout.Controls.Add(new Label {Text = description + "\r\n此确认只在本机有效，2 分钟未确认会取消。", Dock = DockStyle.Fill}, 0, 0);
                        layout.Controls.Add(new TextBox {Text = FormatLocalReview(details), Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new Font("Microsoft YaHei UI", 10)}, 0, 1);
                        var buttons = Row(); var cancel = new Button {Text = "取消", DialogResult = DialogResult.Cancel, Width = 140, Height = 36}; var accept = new Button {Text = "确认执行此清单", DialogResult = DialogResult.OK, Width = 190, Height = 36}; buttons.Controls.Add(cancel); buttons.Controls.Add(accept); layout.Controls.Add(buttons, 0, 2);
                        dialog.Controls.Add(layout); dialog.CancelButton = cancel; dialog.AcceptButton = cancel;
                        using (var deadline = new System.Windows.Forms.Timer {Interval = 120000})
                        { deadline.Tick += (s, e) => { deadline.Stop(); dialog.DialogResult = DialogResult.Cancel; dialog.Close(); }; deadline.Start(); promise.SetResult(dialog.ShowDialog(this) == DialogResult.OK); }
                    }
                }
                catch (Exception ex) { promise.TrySetException(ex); }
            }));
            return promise.Task;
        }
        static string FormatLocalReview(object details)
        {
            var data = details as Dictionary<string, object>;
            if (data == null) return "无法取得完整清单，请取消并重新读取。";
            var text = new StringBuilder(); object value;
            if (data.TryGetValue("files", out value) && value is IEnumerable)
            {
                text.AppendLine("中风险缓存隔离清单（完整原件保留，可恢复）");
                text.AppendLine("本次数量：" + Convert.ToString(data["fileCount"]) + " 个；文件逻辑大小：" + Convert.ToInt64(data["logicalBytes"]).ToString("N0") + " 字节");
                int index = 0;
                foreach (object entry in (IEnumerable)value)
                {
                    var file = entry as Dictionary<string, object>; if (file == null) continue;
                    text.AppendLine().AppendLine((++index) + ". " + AppConfig.Strings(file, "path", "未知路径"));
                    text.AppendLine("大小：" + Convert.ToInt64(file["bytes"]).ToString("N0") + " 字节");
                    text.AppendLine("依据：" + AppConfig.Strings(file, "reason", "未提供"));
                    text.AppendLine("创建：" + AppConfig.Strings(file, "createdAt", "未记录") + "；修改：" + AppConfig.Strings(file, "modifiedAt", "未记录"));
                }
                if (data.TryGetValue("warnings", out value) && value is IEnumerable) foreach (object line in (IEnumerable)value) text.AppendLine().AppendLine(Convert.ToString(line));
            }
            else
            {
                text.AppendLine("Microsoft Defender 检测记录");
                bool any = false;
                if (data.TryGetValue("threats", out value) && value is IEnumerable) foreach (object entry in (IEnumerable)value)
                {
                    var threat = entry as Dictionary<string, object>; if (threat == null || !threat.ContainsKey("isActive") || !Convert.ToBoolean(threat["isActive"])) continue;
                    any = true; text.AppendLine().AppendLine("已确认活跃威胁：" + AppConfig.Strings(threat, "name", "未命名"));
                    object resources; if (threat.TryGetValue("resources", out resources) && resources is IEnumerable) foreach (object resource in (IEnumerable)resources) text.AppendLine("涉及资源：" + Convert.ToString(resource));
                }
                if (!any) text.AppendLine("当前记录没有活跃威胁。请取消并重新读取状态。");
                if (data.TryGetValue("errors", out value) && value is IEnumerable) foreach (object error in (IEnumerable)value) text.AppendLine("读取异常：" + Convert.ToString(error));
                text.AppendLine().AppendLine("处置由 Windows Defender 按系统策略执行；其隔离区在 Windows 安全中心管理。");
            }
            return text.ToString();
        }
        public Task<string> HandleWebAction(Dictionary<string, object> request)
        {
            var promise = new TaskCompletionSource<string>();
            if (IsDisposed || !IsHandleCreated) { promise.SetException(new InvalidOperationException("桌面尚未就绪。")); return promise.Task; }
            BeginInvoke(new Action(async () => {
                try
                {
                    string action = AppConfig.Strings(request, "action", ""), text = AppConfig.Strings(request, "text", ""); string result;
                    switch (action)
                    {
                        case "transform": result = TextTransforms.Apply(AppConfig.Strings(request, "operation", ""), text); break;
                        case "ai":
                            string prompt = AppConfig.Strings(request, "prompt", "");
                            if (String.IsNullOrWhiteSpace(prompt)) { string name = AppConfig.Strings(request, "name", "总结"); AiAction named = config.Actions.FirstOrDefault(a => a.Name == name); if (named == null) throw new ArgumentException("未找到此 AI 动作。"); prompt = named.Prompt; }
                            result = await ai.Run(prompt, text, CancellationToken.None); break;
                        case "translate": case "rewrite": case "summarize": case "explain":
                            string label = action == "translate" ? "翻译" : action == "rewrite" ? "润色" : action == "summarize" ? "总结" : "解释";
                            AiAction predefined = config.Actions.FirstOrDefault(a => a.Name == label); if (predefined == null) throw new ArgumentException("桌面中已删除此 AI 动作。"); result = await ai.Run(predefined.Prompt, text, CancellationToken.None); break;
                        case "speak": StartSpeech(text); result = "已开始 Windows 本地朗读。"; break;
                        case "openURL": SafeBrowser.Open(AppConfig.Strings(request, "url", "")); result = "已在默认浏览器打开网页。"; break;
                        case "search": SafeBrowser.Open(config.SearchTemplate.Replace("{{text}}", Uri.EscapeDataString(text))); result = "已在默认浏览器搜索。"; break;
                        case "copy": Clipboard.SetText(text); result = "已复制到本机剪贴板。"; break;
                        default: throw new ArgumentException("网页仅允许预定义文本、AI、朗读和网页动作。");
                    }
                    promise.SetResult(result);
                }
                catch (Exception ex) { promise.SetException(ex); }
            }));
            return promise.Task;
        }
        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            bool selectionRegistered = Native.RegisterHotKey(Handle, 4101, 0x0001 | 0x0002 | 0x4000, (uint)Keys.Q);
            bool ocrRegistered = Native.RegisterHotKey(Handle, 4102, 0x0001 | 0x0002 | 0x4000, (uint)Keys.S);
            if (!selectionRegistered || !ocrRegistered) { if (status != null) status.Text = "部分快捷键已被其他软件占用，可直接在工作台操作。"; }
        }
        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 0x0312) { if (message.WParam.ToInt32() == 4101) { var task = CaptureSelection(); } else if (message.WParam.ToInt32() == 4102) { var task = CaptureOcr(); } }
            base.WndProc(ref message);
        }
        void OnClosing(object sender, FormClosingEventArgs e)
        {
            if (!exiting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); return; }
            Native.UnregisterHotKey(Handle, 4101); Native.UnregisterHotKey(Handle, 4102); foregroundTimer.Stop(); foregroundTimer.Dispose(); tray.Visible = false; tray.Dispose(); if (bridge != null) bridge.Dispose(); if (speech != null) speech.Dispose(); if (currentRequest != null) currentRequest.Cancel();
        }
    }

    internal static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            if (args.Contains("--self-test")) return SelfTest();
            int reportIndex = Array.IndexOf(args, "--report");
            if (reportIndex >= 0)
            {
                if (reportIndex + 1 >= args.Length) return 2;
                try { File.WriteAllText(Path.GetFullPath(args[reportIndex + 1]), Diagnostics.Json(Diagnostics.BuildReport(args.Contains("--deep"))), new UTF8Encoding(false)); return 0; }
                catch (Exception ex) { Console.Error.WriteLine(ex.Message); return 1; }
            }
            Native.SetProcessDPIAware(); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            bool created;
            using (Mutex mutex = new Mutex(true, "Local\\QDuoWindows.Desktop", out created))
            {
                if (!created) { MessageBox.Show("QDuo Windows 已在运行。请使用托盘图标打开。", "QDuo"); return 0; }
                try { Application.Run(new MainForm(args.Contains("--headless") || args.Contains("--serve-test"))); return 0; }
                catch (Exception ex) { if (args.Contains("--serve-test")) Console.Error.WriteLine(ex.Message); else MessageBox.Show(ex.Message, "QDuo 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
            }
        }
        static int SelfTest()
        {
            int count = 0;
            try
            {
                Action<bool, string> check = (ok, name) => { if (!ok) throw new Exception("FAIL: " + name); count++; };
                check(TextTransforms.Ids.Length == 22, "22 local actions");
                check(TextTransforms.Apply("camel", "HTTP server_name") == "httpServerName", "camel boundary");
                check(TextTransforms.Apply("snake", "XMLHttpRequest") == "xml_http_request", "acronym split");
                check(TextTransforms.Apply("uniqueLines", "a\na\nb") == "a\r\nb", "line deduplication");
                check(TextTransforms.Apply("sortLines", "z\na") == "a\r\nz", "line sorting");
                check(TextTransforms.Apply("joinLines", "a\r\n\r\nb") == "a b", "join lines");
                check(TextTransforms.Apply("jsonMinify", "{ \"a\" : [1, 2] }") == "{\"a\":[1,2]}", "JSON parsing");
                check(TextTransforms.Apply("stripTracking", "https://example.com/a?keep=1&utm_source=x&fbclid=y") == "https://example.com/a?keep=1", "URL tracking");
                check(TextTransforms.Apply("urlDecode", TextTransforms.Apply("urlEncode", "中文 + ?")) == "中文 + ?", "URL Unicode roundtrip");
                check(TextTransforms.Apply("traditional", "汉语") == "漢語", "Windows traditional conversion");
                check(TextTransforms.Apply("simplified", "漢語") == "汉语", "Windows simplified conversion");
                check(TextTransforms.Apply("traditional", "😀 汉语 𠮷") == "😀 漢語 𠮷", "Chinese conversion preserves emoji and extended characters");
                check(AppConfig.Unprotect(AppConfig.Protect("private test key")) == "private test key", "DPAPI roundtrip");
                check(AppConfig.NewToken().Length == 64, "256 bit pairing token");
                check(AiClient.Endpoint("http://localhost:11434/v1").AbsoluteUri == "http://localhost:11434/v1/chat/completions", "Ollama endpoint");
                bool rejected = false; try { AiClient.Endpoint("http://example.com/v1"); } catch (ArgumentException) { rejected = true; } check(rejected, "remote plaintext key rejected");
                rejected = false; try { SafeBrowser.Validate("file:///C:/Windows"); } catch (ArgumentException) { rejected = true; } check(rejected, "file URL rejected");
                rejected = false; try { SafeBrowser.Validate("http://127.0.0.1:80"); } catch (ArgumentException) { rejected = true; } check(rejected, "loopback browse rejected");
                rejected = false; try { TextTransforms.Apply("unknown", "a"); } catch (ArgumentException) { rejected = true; } check(rejected, "unknown transform rejected");
                rejected = false; try { TextTransforms.Apply("jsonFormat", "{broken"); } catch { rejected = true; } check(rejected, "invalid JSON rejected");
                check(TextTransforms.Apply("count", "😀中").Contains("字符（含空白）：2"), "grapheme counting");
                Console.WriteLine("PASS " + count + " desktop checks"); return 0;
            }
            catch (Exception ex) { Console.Error.WriteLine(ex.Message); return 1; }
        }
    }
}
