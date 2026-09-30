using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

namespace QDuoWindows
{
    // No endpoint accepts filesystem paths. Candidate IDs are bound to a current
    // metadata snapshot and fixed disposable-cache roots. Quarantine is permanent
    // until explicitly restored; this program never purges recovery archives.
    public static class SafetyService
    {
        private const int MaxPlanFiles = 500;
        private const long MaxPlanBytes = 8L * 1024 * 1024 * 1024;
        private const long MaxFileBytes = 4L * 1024 * 1024 * 1024;
        private const string Policy = "qd-safe-cache-2026-09-v1";
        private static readonly object Gate = new object();
        private static readonly Dictionary<string, Candidate> Candidates = new Dictionary<string, Candidate>(StringComparer.Ordinal);
        private static readonly Dictionary<string, Plan> Plans = new Dictionary<string, Plan>(StringComparer.Ordinal);
        private static Dictionary<string, object> LastScan;
        private static Dictionary<string, object> LastCleanup;
        private static volatile bool Busy;
        private static readonly Dictionary<string, byte[]> JournalKeys = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        private static readonly string Quarantine = Path.Combine(@"D:\QDuo-Backups", Environment.UserName, "Recovery");
        private static readonly string LegacyQuarantine = LocateLegacyRecoveryDirectory();
        private static readonly string[] ProtectedExtensions = { ".cs", ".cpp", ".c", ".h", ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".vue", ".sln", ".csproj", ".json", ".yaml", ".yml", ".toml", ".xml", ".ipynb", ".blend", ".psd", ".ai", ".dwg", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf", ".txt", ".md", ".rtf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".mp3", ".wav", ".mp4", ".mov", ".avi", ".db", ".sqlite", ".sqlite3", ".exe", ".dll", ".msi", ".ps1", ".bat", ".cmd", ".pem", ".key", ".pfx" };
        private static readonly string[] ProjectMarkers = { ".git", ".hg", ".svn", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "CMakeLists.txt", "requirements.txt", ".qd-protect" };

        private sealed class Root { public string Path, Name, App, Risk; public string[] Processes; public int AgeDays; }
        private sealed class Candidate
        {
            public string Id, Path, RootPath, Risk, Name, App, Reason;
            public long Bytes, CreatedTicks, ModifiedTicks, AccessTicks;
            public int Attributes;
            public uint VolumeSerial, IndexHigh, IndexLow;
            public Root Root;
            public Dictionary<string, object> Public()
            {
                return D("id", Id, "path", Path, "name", Name, "bytes", Bytes, "risk", Risk, "reason", Reason,
                    "createdAt", Iso(new DateTime(CreatedTicks, DateTimeKind.Utc)), "modifiedAt", Iso(new DateTime(ModifiedTicks, DateTimeKind.Utc)),
                    "lastAccessAt", Iso(new DateTime(AccessTicks, DateTimeKind.Utc)), "application", App,
                    "applicationEvidence", "根据固定缓存目录推断用途；Windows 文件时间不能证明确切创建应用。", "root", RootPath);
            }
        }
        private sealed class Plan { public string Id, Risk; public DateTime Created, Expires; public List<Candidate> Files; public bool Used; public int Excluded; }

        public static object GetStatus()
        {
            lock (Gate)
            {
                var history = new List<Dictionary<string, object>>();
                var errors = new List<string>();
                string backupError = BackupReadiness();
                if (backupError != null) errors.Add(backupError);
                foreach (string recoveryRoot in new[] { Quarantine, LegacyQuarantine }.Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    if (!Directory.Exists(recoveryRoot)) continue;
                    if (!SafeAncestors(recoveryRoot)) { errors.Add("恢复目录含重解析点，已停止读取：" + recoveryRoot); continue; }
                    foreach (string dir in Directory.GetDirectories(recoveryRoot).OrderByDescending(delegate(string p) { return p; }).Take(100))
                        try { var summary = Summary(ReadJournalAt(recoveryRoot, Path.GetFileName(dir))); summary["quarantinePath"] = dir; history.Add(summary); } catch (Exception ex) { errors.Add("恢复记录无法验证：" + Path.GetFileName(dir) + " / " + ex.Message); }
                }
                return D("schemaVersion", 1, "generatedAt", Iso(DateTime.UtcNow), "policyVersion", Policy, "quarantinePath", Quarantine, "backupDrive", "D:", "backupMode", "verified-cross-volume", "backupAvailable", backupError == null, "backupError", backupError,
                    "lastScan", LastScan, "lastCleanup", LastCleanup, "transactions", history, "busy", Busy, "errors", errors);
            }
        }

        public static object Scan(bool deep)
        {
            lock (Gate)
            {
                if (Busy) throw new InvalidOperationException("清理或恢复正在进行，请稍候。");
                Candidates.Clear();
                foreach (string old in Plans.Where(delegate(KeyValuePair<string, Plan> p) { return p.Value.Expires < DateTime.UtcNow || p.Value.Used; }).Select(delegate(KeyValuePair<string, Plan> p) { return p.Key; }).ToArray()) Plans.Remove(old);
                HashSet<string> running = RunningProcesses();
                List<string> errors = new List<string>();
                List<Dictionary<string, object>> files = new List<Dictionary<string, object>>();
                int examined = 0, protectedCount = 0;
                bool complete = true;
                Stopwatch clock = Stopwatch.StartNew();
                foreach (Root root in Roots())
                {
                    if (!Directory.Exists(root.Path)) continue;
                    if (!SafeAncestors(root.Path) || IsProjectPath(root.Path, root.Path)) { protectedCount++; continue; }
                    if (root.Processes.Any(delegate(string p) { return running.Contains(p); })) { protectedCount++; errors.Add(root.Name + "：相关应用正在运行，整处缓存已保护。"); continue; }
                    Stack<string> queue = new Stack<string>(); queue.Push(root.Path);
                    while (queue.Count != 0)
                    {
                        if (clock.ElapsedMilliseconds > (deep ? 15000 : 5000) || examined >= (deep ? 30000 : 8000)) { complete = false; break; }
                        string dir = queue.Pop();
                        if (!SafeAncestors(dir) || IsProjectPath(dir, root.Path)) { protectedCount++; continue; }
                        try
                        {
                            foreach (string path in Directory.GetFiles(dir))
                            {
                                if (++examined >= (deep ? 30000 : 8000)) { complete = false; break; }
                                try
                                {
                                    Candidate candidate = MakeCandidate(path, root, running);
                                    if (candidate == null) { protectedCount++; continue; }
                                    if (Candidates.Count >= 5000) { complete = false; break; }
                                    Candidates[candidate.Id] = candidate; files.Add(candidate.Public());
                                }
                                catch (Exception ex) { protectedCount++; if (errors.Count < 100) errors.Add(path + "：" + ex.Message); }
                            }
                            foreach (string child in Directory.GetDirectories(dir)) if (SafeAncestors(child)) queue.Push(child); else protectedCount++;
                        }
                        catch (Exception ex) { complete = false; if (errors.Count < 100) errors.Add(dir + "：" + ex.Message); }
                    }
                    if (!complete && (clock.ElapsedMilliseconds > (deep ? 15000 : 5000) || examined >= (deep ? 30000 : 8000))) break;
                }
                if (!complete) errors.Add("扫描达到时间或数量限制，候选大小是已扫描部分，不能视为整台电脑的全部可清理空间。");
                LastScan = D("schemaVersion", 1, "generatedAt", Iso(DateTime.UtcNow), "scanId", Guid.NewGuid().ToString("N"), "complete", complete,
                    "examinedFiles", examined, "protectedFiles", protectedCount, "durationMs", clock.ElapsedMilliseconds, "candidates", files,
                    "totals", D("lowFiles", Candidates.Values.Count(delegate(Candidate c) { return c.Risk == "low"; }), "mediumFiles", Candidates.Values.Count(delegate(Candidate c) { return c.Risk == "medium"; }),
                        "lowBytes", Candidates.Values.Where(delegate(Candidate c) { return c.Risk == "low"; }).Sum(delegate(Candidate c) { return c.Bytes; }), "mediumBytes", Candidates.Values.Where(delegate(Candidate c) { return c.Risk == "medium"; }).Sum(delegate(Candidate c) { return c.Bytes; })),
                    "exclusions", new[] { "固定缓存范围以外的所有文件", "项目标志目录、源码、文档、原始图片音视频、数据库、密钥及可执行文件", "7 天内使用或修改的缓存；30 天内的临时文件", "运行应用的缓存、锁定文件、硬链接、符号链接/目录联接、加密或只读文件", "有额外 NTFS 数据流（包括 Zone.Identifier）或无法验证数据流的文件", "文件名含 backup、autosave、draft、recovery 或 unsaved 的恢复资料" },
                    "errors", errors, "suggestions", new[] { "先关闭浏览器或相关应用，再重新扫描缓存。", "中风险临时文件可能属于未完成工作，查看路径后在电脑端确认。", "新清理会先把固定 C 盘缓存备份到 D 盘，校验内容并保存恢复日志后才释放 C 盘；D 盘备份长期保留。" });
                return LastScan;
            }
        }

        public static object CreatePlan(string risk, string[] fileIds)
        {
            lock (Gate)
            {
                if (Busy) throw new InvalidOperationException("清理或恢复正在进行。");
                if (risk != "low" && risk != "medium") throw new ArgumentException("风险必须是 low 或 medium。");
                if (LastScan == null) Scan(false);
                List<Candidate> selected = new List<Candidate>();
                if (fileIds == null || fileIds.Length == 0) selected.AddRange(Candidates.Values.Where(delegate(Candidate c) { return c.Risk == risk; }).OrderByDescending(delegate(Candidate c) { return c.Bytes; }));
                else
                {
                    if (fileIds.Length > 5000) throw new ArgumentException("选择数量超出限制。");
                    foreach (string id in fileIds.Distinct())
                    {
                        Candidate c; if (id == null || !Candidates.TryGetValue(id, out c) || c.Risk != risk) throw new ArgumentException("文件 ID 不在当前风险扫描中，请重新扫描。"); selected.Add(c);
                    }
                }
                Plan plan = new Plan { Id = Guid.NewGuid().ToString("N"), Risk = risk, Created = DateTime.UtcNow, Expires = DateTime.UtcNow.AddMinutes(10), Files = new List<Candidate>() };
                long bytes = 0;
                foreach (Candidate candidate in selected)
                {
                    if (plan.Files.Count >= MaxPlanFiles || bytes + candidate.Bytes > MaxPlanBytes) { plan.Excluded++; continue; }
                    plan.Files.Add(candidate); bytes += candidate.Bytes;
                }
                if (Plans.Count > 30) throw new InvalidOperationException("待执行计划过多，请稍后再试。");
                Plans[plan.Id] = plan;
                return PlanPublic(plan);
            }
        }

        public static object GetPlan(string planId)
        {
            lock (Gate)
            {
                Plan plan;
                if (!Plans.TryGetValue(planId ?? "", out plan) || plan.Used || plan.Expires < DateTime.UtcNow) throw new ArgumentException("计划不存在、已执行或已过期。");
                return PlanPublic(plan);
            }
        }
        private static Dictionary<string, object> PlanPublic(Plan plan)
        {
            return D("schemaVersion", 1, "planId", plan.Id, "createdAt", Iso(plan.Created), "expiresAt", Iso(plan.Expires), "risk", plan.Risk,
                "requiresMediumApproval", plan.Risk == "medium", "files", plan.Files.Select(delegate(Candidate c) { return c.Public(); }).ToArray(), "fileCount", plan.Files.Count,
                "logicalBytes", plan.Files.Sum(delegate(Candidate c) { return c.Bytes; }), "excludedCount", plan.Excluded,
                "warnings", new[] { "执行时会再次检查每个文件；任何改变、正在使用或无法验证的文件都会跳过。", "每次最多 500 个文件 / 8 GiB，单文件最多 4 GiB；剩余文件可重新扫描分批处理。", "先在 D 盘写入并校验备份及恢复日志，再删除 C 盘缓存。D 盘必须是本地 NTFS 磁盘且有足够空间。" });
        }

        public static object ExecutePlan(string planId, bool mediumApproved)
        {
            Plan plan;
            lock (Gate)
            {
                if (Busy) throw new InvalidOperationException("已有清理或恢复任务。");
                if (!Plans.TryGetValue(planId ?? "", out plan) || plan.Used || plan.Expires < DateTime.UtcNow) throw new ArgumentException("计划不存在、已执行或已过期，请重新扫描。");
                if (plan.Risk == "medium" && !mediumApproved) throw new InvalidOperationException("中风险清理必须经电脑端确认。");
                if (DefenderRunning()) throw new InvalidOperationException("Defender 任务正在运行，请完成后再清理。");
                plan.Used = true; Busy = true;
            }
            try
            {
                string id = Guid.NewGuid().ToString("N");
                EnsureRecoveryDirectory();
                string dir = Path.Combine(Quarantine, id); Directory.CreateDirectory(dir);
                using (AncestorLocks recoveryLocks = new AncestorLocks(Path.Combine(dir, "journal.json")))
                {
                var results = new List<Dictionary<string, object>>();
                var records = new List<Dictionary<string, object>>();
                var before = FreeSpace(plan.Files.Select(delegate(Candidate c) { return c.Path; }).Concat(new[] { dir }));
                var journal = D("schemaVersion", 1, "journalFormat", 3, "method", "verified-cross-volume", "policyVersion", Policy, "transactionId", id, "startedAt", Iso(DateTime.UtcNow), "completedAt", null, "status", "running", "records", records, "risk", plan.Risk);
                SaveJournal(id, journal);
                foreach (Candidate candidate in plan.Files)
                {
                    var item = D("id", candidate.Id, "path", candidate.Path, "status", "skipped", "bytes", candidate.Bytes, "reason", "");
                    results.Add(item);
                    try
                    {
                        Candidate current = MakeCandidate(candidate.Path, candidate.Root, RunningProcesses());
                        if (current == null || current.Id != candidate.Id || current.AccessTicks != candidate.AccessTicks) { item["reason"] = "文件属性、时间或使用状态已改变，已保护。"; continue; }
                        using (AncestorLocks ancestors = new AncestorLocks(candidate.Path))
                        using (SafeFileHandle handle = OpenCrossVolumeSource(candidate.Path))
                        using (FileStream input = new FileStream(handle, FileAccess.ReadWrite))
                        {
                            NativeInfo info = Info(handle);
                            HashSet<string> active = RunningProcesses();
                            if (info.Links != 1 || !Matches(candidate, info) || !SafeAncestors(candidate.Path) || !OnlyDefaultDataStream(handle) || IsProjectPath(Path.GetDirectoryName(candidate.Path), candidate.RootPath) || candidate.Root.Processes.Any(delegate(string p) { return active.Contains(p); })) { item["reason"] = "链接、项目标志、应用使用状态、额外数据流或文件快照不匹配，已保护。"; continue; }
                            if (SameVolume(handle, dir)) { item["reason"] = "备份与原文件必须位于不同的 C、D 磁盘卷，已保护。"; continue; }
                            if (DiskFree(@"D:\") < candidate.Bytes + Math.Max(256L * 1024 * 1024, candidate.Bytes / 50)) throw new IOException("D 盘剩余空间不足以安全保存此文件，原文件保留。");
                            byte[] security = ReadSecurity(handle);
                            string archiveName = Guid.NewGuid().ToString("N") + ".zip";
                            string archive = Path.Combine(dir, archiveName);
                            string hash;
                            using (SHA256 sha = SHA256.Create()) { hash = Hex(sha.ComputeHash(input)); } input.Position = 0;
                            using (FileStream output = new FileStream(archive, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None))
                            {
                                ValidateHandlePath(output.SafeFileHandle, archive);
                                using (ZipArchive zip = new ZipArchive(output, ZipArchiveMode.Create, true))
                                using (Stream content = zip.CreateEntry("content", CompressionLevel.Fastest).Open()) input.CopyTo(content);
                                output.Flush(true);
                            if (!VerifyArchiveStream(output, hash, candidate.Bytes)) throw new IOException("恢复档校验失败，原文件保留。");
                            var record = D("id", candidate.Id, "path", candidate.Path, "root", candidate.RootPath, "risk", candidate.Risk, "bytes", candidate.Bytes,
                                "createdTicks", candidate.CreatedTicks, "modifiedTicks", candidate.ModifiedTicks, "accessTicks", candidate.AccessTicks, "attributes", candidate.Attributes,
                                "sha256", hash, "archive", archiveName, "archiveBytes", output.Length, "zipBytes", output.Length,
                                "kind", "cross-volume", "security", Convert.ToBase64String(security), "originalCompression", (info.Attributes & 0x800) != 0, "state", "prepared");
                            records.Add(record); SaveJournal(id, journal);
                            // Deletion is pending while the exclusive source handle is
                            // held. New opens (including new named streams) then fail.
                            // Check the frozen object before closing it; on any failure
                            // revoke disposition so the source remains in place.
                            bool pending = false;
                            try
                            {
                                if (!OnlyDefaultDataStream(handle) || Info(handle).Links != 1 || !Matches(candidate, Info(handle))) throw new IOException("备份期间文件结构或属性发生变化，原文件保留。");
                                SetDeletePending(handle, true); pending = true;
                                if (!OnlyDefaultDataStream(handle)) throw new IOException("删除待决后无法确认唯一数据流，原文件保留。");
                                // On Windows NTFS, the sole name is removed from
                                // NumberOfLinks while delete-pending (1 becomes 0).
                                if (Info(handle).Links != 0) throw new IOException("删除待决后的链接数量不符，原文件保留。");
                                if (!Matches(candidate, Info(handle))) throw new IOException("删除待决后文件快照变化，原文件保留。");
                                if (!ReadSecurity(handle).SequenceEqual(security)) throw new IOException("删除待决后文件权限变化，原文件保留。");
                                input.Position = 0;
                                using (SHA256 sha = SHA256.Create()) if (Hex(sha.ComputeHash(input)) != hash) throw new IOException("删除前内容复验失败，原文件保留。");
                                record["state"] = "quarantined";
                                SaveJournal(id, journal);
                            }
                            catch
                            {
                                if (pending) SetDeletePending(handle, false);
                                record["state"] = "prepared";
                                throw;
                            }
                            item["status"] = "quarantined";
                            item["reason"] = "D 盘备份及 SHA-256、权限、时间已保存，C 盘缓存已安全释放。";
                            SaveJournal(id, journal);
                            }
                        }
                        SaveJournal(id, journal);
                    }
                    catch (Exception ex) { item["status"] = "failed"; item["reason"] = ex.Message; }
                }
                string status = results.All(delegate(Dictionary<string, object> r) { return S(r, "status") == "quarantined"; }) ? "completed" : (results.Any(delegate(Dictionary<string, object> r) { return S(r, "status") == "quarantined"; }) ? "partial" : "failed");
                journal["status"] = status; journal["completedAt"] = Iso(DateTime.UtcNow); SaveJournal(id, journal);
                LastCleanup = TransactionResult(journal, results, before, false); return LastCleanup;
                }
            }
            finally { Busy = false; }
        }

        public static object Restore(string transactionId)
        {
            lock (Gate) { if (Busy) throw new InvalidOperationException("已有清理或恢复任务。"); if (DefenderRunning()) throw new InvalidOperationException("Defender 任务正在运行。"); Busy = true; }
            try
            {
                ValidateId(transactionId);
                string recoveryRoot = FindRecoveryRoot(transactionId);
                using (AncestorLocks recoveryLocks = new AncestorLocks(Path.Combine(recoveryRoot, transactionId, "journal.json")))
                {
                Dictionary<string, object> journal = ReadJournalAt(recoveryRoot, transactionId);
                var records = Objects(journal["records"]).ToArray();
                var results = new List<Dictionary<string, object>>();
                var before = FreeSpace(records.Select(delegate(Dictionary<string, object> r) { return S(r, "path"); }).Concat(new[] { recoveryRoot }));
                foreach (var record in records)
                {
                    var item = D("id", S(record, "id"), "path", S(record, "path"), "status", "skipped", "bytes", L(record, "bytes"), "reason", ""); results.Add(item);
                    if (S(record, "state") == "restored") { item["reason"] = "该文件已恢复。"; continue; }
                    string destination = S(record, "path");
                    try
                    {
                        ValidateRecoveryRecord(record);
                        Root allowedRoot = Roots().First(delegate(Root r) { return String.Equals(r.Path, S(record, "root"), StringComparison.OrdinalIgnoreCase); });
                        HashSet<string> active = RunningProcesses();
                        if (allowedRoot.Processes.Any(delegate(string p) { return active.Contains(p); })) { item["reason"] = "相关应用正在运行，暂停恢复以保护当前缓存。"; continue; }
                        if (File.Exists(destination) || Directory.Exists(destination)) { item["reason"] = "原位置已有文件或目录，为保护现有数据不覆盖。"; continue; }
                        string parent = Path.GetDirectoryName(destination);
                        if (!Directory.Exists(parent)) { item["reason"] = "原目录已不存在，请手动查看恢复档；不会重建项目目录。"; continue; }
                        if (S(record, "kind") == "full-file")
                        {
                            string preserved = Path.Combine(recoveryRoot, transactionId, S(record, "preservedFile"));
                            if (!File.Exists(preserved)) { item["reason"] = "完整隔离原件不存在；主流 ZIP 不能代替全部文件数据，已停止自动恢复。"; continue; }
                            RestorePreservedFile(preserved, destination, record);
                            record["state"] = "restored"; record["restoredAt"] = Iso(DateTime.UtcNow); item["status"] = "restored";
                            item["reason"] = "完整原件已同盘恢复，所有数据流、权限及原始压缩状态和时间均随原件保全；主流 ZIP 仍保留。";
                            record["preservedBytes"] = 0; record["archiveBytes"] = L(record, "zipBytes"); SaveJournalAt(recoveryRoot, transactionId, journal);
                            continue;
                        }
                        // Legacy format-1 transactions contained only a validated
                        // default-stream ZIP. Preserve their existing recovery path.
                        string archive = Path.Combine(recoveryRoot, transactionId, S(record, "archive"));
                        using (SafeFileHandle archiveHandle = OpenFile(archive, false))
                        using (FileStream archiveStream = new FileStream(archiveHandle, FileAccess.Read))
                        {
                        if (!VerifyArchiveStream(archiveStream, S(record, "sha256"), L(record, "bytes"))) throw new IOException("恢复档内容校验失败。");
                        archiveStream.Position = 0;
                        using (AncestorLocks ancestors = new AncestorLocks(destination))
                        using (SafeFileHandle handle = CreateRecoveryFile(destination))
                        using (FileStream output = new FileStream(handle, FileAccess.ReadWrite))
                        using (ZipArchive zip = new ZipArchive(archiveStream, ZipArchiveMode.Read, true))
                        {
                            try
                            {
                                using (Stream content = zip.GetEntry("content").Open()) content.CopyTo(output);
                                output.Flush(true); output.Position = 0;
                                using (SHA256 sha = SHA256.Create()) if (Hex(sha.ComputeHash(output)) != S(record, "sha256")) throw new IOException("写回内容校验失败。");
                                if (S(record, "kind") == "cross-volume") RestoreMetadata(handle, record);
                                long created = L(record, "createdTicks"), modified = L(record, "modifiedTicks"), access = L(record, "accessTicks");
                                FileTime c = ToFileTime(created), m = ToFileTime(modified), a = ToFileTime(access);
                                if (!SetFileTime(handle, ref c, ref a, ref m)) throw new IOException("恢复文件时间失败。");
                            }
                            catch { DeleteDisposition dispose = new DeleteDisposition { Delete = true }; SetFileInformationByHandle(handle, 4, ref dispose, (uint)Marshal.SizeOf(typeof(DeleteDisposition))); throw; }
                        }
                        record["state"] = "restored"; record["restoredAt"] = Iso(DateTime.UtcNow); item["status"] = "restored"; item["reason"] = "内容和原始创建/修改/访问时间已恢复；跨盘备份另保留原始权限和属性；恢复档仍保留。"; SaveJournalAt(recoveryRoot, transactionId, journal);
                        }
                    }
                    catch (Exception ex) { item["status"] = "failed"; item["reason"] = ex.Message; }
                }
                journal["restoredAt"] = Iso(DateTime.UtcNow); SaveJournalAt(recoveryRoot, transactionId, journal);
                LastCleanup = TransactionResult(journal, results, before, true); return LastCleanup;
                }
            }
            finally { Busy = false; }
        }

        private static Dictionary<string, object> TransactionResult(Dictionary<string, object> journal, List<Dictionary<string, object>> results, Dictionary<string, long> before, bool restore)
        {
            var records = Objects(journal["records"]).ToArray();
            var drives = new List<Dictionary<string, object>>();
            foreach (var disk in before) { long after = DiskFree(disk.Key); drives.Add(D("name", disk.Key, "freeBefore", disk.Value, "freeAfter", after, "freeDelta", after - disk.Value)); }
            return D("schemaVersion", 1, "transactionId", S(journal, "transactionId"), "startedAt", S(journal, "startedAt"), "completedAt", Iso(DateTime.UtcNow),
                "status", results.All(delegate(Dictionary<string, object> r) { return S(r, "status") == (restore ? "restored" : "quarantined"); }) ? "completed" : (results.Any(delegate(Dictionary<string, object> r) { return S(r, "status") == (restore ? "restored" : "quarantined"); }) ? "partial" : "failed"),
                "operation", restore ? "restore" : "clean", "quarantinePath", Path.Combine(FindRecoveryRoot(S(journal, "transactionId")), S(journal, "transactionId")), "fileCount", results.Count,
                "quarantinedFiles", results.Count(delegate(Dictionary<string, object> r) { return S(r, "status") == "quarantined"; }), "restoredFiles", results.Count(delegate(Dictionary<string, object> r) { return S(r, "status") == "restored"; }),
                "skippedFiles", results.Count(delegate(Dictionary<string, object> r) { return S(r, "status") == "skipped"; }), "failedFiles", results.Count(delegate(Dictionary<string, object> r) { return S(r, "status") == "failed"; }),
                "logicalBytes", results.Where(delegate(Dictionary<string, object> r) { return S(r, "status") == (restore ? "restored" : "quarantined"); }).Sum(delegate(Dictionary<string, object> r) { return L(r, "bytes"); }),
                "archiveBytes", records.Sum(delegate(Dictionary<string, object> r) { return L(r, "archiveBytes"); }), "drives", drives, "results", results,
                "suggestions", new[] { "C、D 盘差额分别是操作期间系统实测值，其他程序写入会影响它；它不等于处理文件大小。", "新交易的 D 盘备份永不自动销毁；旧同盘隔离记录继续支持恢复。", "备份逻辑大小不能等同于磁盘实测差额。", "跳过文件表示安全规则保护，请根据具体原因关闭应用或保留该文件。" });
        }

        private static IEnumerable<Root> Roots()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            yield return R(Path.Combine(local, "npm-cache", "_cacache"), "npm 下载缓存", "npm", "low", 7, "node", "npm");
            yield return R(Path.Combine(local, "pip", "Cache"), "pip 下载缓存", "pip", "low", 7, "python", "pythonw", "pip");
            yield return R(Path.Combine(local, "uv", "cache"), "uv 下载缓存", "uv", "low", 7, "python", "pythonw", "uv");
            yield return R(Path.Combine(local, "NuGet", "v3-cache"), "NuGet HTTP 缓存", "NuGet", "low", 7, "devenv", "dotnet", "msbuild");
            yield return R(Path.Combine(local, "NVIDIA", "DXCache"), "NVIDIA 着色器缓存", "NVIDIA", "low", 7);
            yield return R(Path.Combine(local, "D3DSCache"), "Direct3D 着色器缓存", "Windows Direct3D", "low", 7);
            foreach (string browser in new[] { "Google\\Chrome", "Microsoft\\Edge" })
            {
                string userData = Path.Combine(local, browser, "User Data");
                if (!Directory.Exists(userData) || !SafeAncestors(userData)) continue;
                string[] profiles; try { profiles = Directory.GetDirectories(userData); } catch { continue; }
                foreach (string profile in profiles.Where(delegate(string p) { string n = Path.GetFileName(p); return n == "Default" || n.StartsWith("Profile ", StringComparison.Ordinal); }).Take(30))
                    foreach (string sub in new[] { "Cache", "Code Cache", "GPUCache" }) yield return R(Path.Combine(profile, sub), browser + " " + sub, browser.Contains("Chrome") ? "Google Chrome" : "Microsoft Edge", "low", 7, browser.Contains("Chrome") ? "chrome" : "msedge");
            }
            yield return R(Path.Combine(local, "Temp"), "用户临时文件", "来源未证实", "medium", 30);
        }
        private static Root R(string path, string name, string app, string risk, int age, params string[] processes) { return new Root { Path = Path.GetFullPath(path), Name = name, App = app, Risk = risk, AgeDays = age, Processes = processes }; }
        private static Candidate MakeCandidate(string path, Root root, HashSet<string> running)
        {
            path = Path.GetFullPath(path);
            if (!String.Equals(Path.GetPathRoot(path), @"C:\", StringComparison.OrdinalIgnoreCase)) return null;
            if (!Within(path, root.Path) || !SafeAncestors(path) || IsProjectPath(Path.GetDirectoryName(path), root.Path) || root.Processes.Any(delegate(string p) { return running.Contains(p); })) return null;
            FileInfo info = new FileInfo(path); if (!info.Exists) return null;
            if ((info.Attributes & (FileAttributes.ReparsePoint | FileAttributes.ReadOnly | FileAttributes.Encrypted | FileAttributes.System | FileAttributes.Directory | FileAttributes.SparseFile | FileAttributes.Offline)) != 0 || info.Length > MaxFileBytes) return null;
            if (((uint)info.Attributes & ~0x000029A2U) != 0) return null;
            string name = info.Name.ToLowerInvariant(), extension = info.Extension.ToLowerInvariant();
            if (ProtectedExtensions.Contains(extension) || new[] { "backup", "autosave", "draft", "recovery", "unsaved" }.Any(delegate(string word) { return name.Contains(word); })) return null;
            if (root.Risk == "medium" && extension != ".tmp" && extension != ".log" && extension != ".cache") return null;
            DateTime limit = DateTime.UtcNow.AddDays(-root.AgeDays);
            if (info.LastWriteTimeUtc >= limit || info.LastAccessTimeUtc >= limit || info.CreationTimeUtc >= limit) return null;
            NativeInfo native;
            using (SafeFileHandle handle = OpenFile(path, false)) { native = Info(handle); if (native.Links != 1 || !OnlyDefaultDataStream(handle)) return null; }
            string id = HashText(path.ToLowerInvariant() + "\n" + info.Length + "\n" + info.CreationTimeUtc.Ticks + "\n" + info.LastWriteTimeUtc.Ticks + "\n" + native.VolumeSerial + ":" + native.IndexHigh + ":" + native.IndexLow);
            return new Candidate { Id = id, Path = path, RootPath = root.Path, Root = root, Risk = root.Risk, Name = info.Name, App = root.App,
                Bytes = info.Length, CreatedTicks = info.CreationTimeUtc.Ticks, ModifiedTicks = info.LastWriteTimeUtc.Ticks, AccessTicks = info.LastAccessTimeUtc.Ticks, Attributes = (int)info.Attributes,
                VolumeSerial = native.VolumeSerial, IndexHigh = native.IndexHigh, IndexLow = native.IndexLow,
                Reason = root.Risk == "low" ? "固定应用缓存；7 天内无创建、修改或访问记录；应用未运行；可再下载或重建。" : "用户 Temp 中超过 30 天的临时/日志/缓存扩展名；来源未证实，必须人工确认。" };
        }
        private static bool IsProjectPath(string directory, string root)
        {
            string current = Path.GetFullPath(directory);
            while (true)
            {
                string name = Path.GetFileName(current.TrimEnd(Path.DirectorySeparatorChar)).ToLowerInvariant();
                if (name == "node_modules" || name == ".git" || name == "projects" || name == "workspace" || name == "workspaces") return true;
                foreach (string marker in ProjectMarkers) if (File.Exists(Path.Combine(current, marker)) || Directory.Exists(Path.Combine(current, marker))) return true;
                if (String.Equals(current.TrimEnd('\\'), root.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) break;
                DirectoryInfo parent = Directory.GetParent(current); if (parent == null || !Within(current, root)) break; current = parent.FullName;
            }
            return false;
        }
        private static HashSet<string> RunningProcesses()
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (Process process in Process.GetProcesses()) using (process) { try { result.Add(process.ProcessName); } catch { } }
            return result;
        }
        private static bool Within(string path, string root) { return Path.GetFullPath(path).StartsWith(Path.GetFullPath(root).TrimEnd('\\', '/') + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase); }
        private static bool SafeAncestors(string path)
        {
            try
            {
                string current = Path.GetFullPath(path);
                while (!String.IsNullOrEmpty(current))
                {
                    if (File.Exists(current) || Directory.Exists(current)) if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) return false;
                    current = Path.GetDirectoryName(current.TrimEnd(Path.DirectorySeparatorChar));
                }
                return true;
            }
            catch { return false; }
        }

        private sealed class AncestorLocks : IDisposable
        {
            private readonly List<SafeFileHandle> handles = new List<SafeFileHandle>();
            private readonly List<string> paths = new List<string>();
            public AncestorLocks(string path)
            {
                try
                {
                    string dir = Path.GetDirectoryName(Path.GetFullPath(path));
                    while (!String.IsNullOrEmpty(dir))
                    {
                        SafeFileHandle handle = CreateFile(dir, 0, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
                        if (handle.IsInvalid) { handle.Dispose(); throw new IOException("无法锁定父目录，保留文件。错误 " + Marshal.GetLastWin32Error()); }
                        handles.Add(handle); paths.Add(dir); if ((Info(handle).Attributes & 0x400) != 0) throw new IOException("父目录是重解析点。");
                        dir = Path.GetDirectoryName(dir.TrimEnd(Path.DirectorySeparatorChar));
                    }
                    // Validate only after the complete ancestor chain is locked.
                    // A redirect occurring while the chain is acquired is rejected.
                    for (int i = 0; i < handles.Count; i++) ValidateHandlePath(handles[i], paths[i]);
                }
                catch { Dispose(); throw; }
            }
            public void Dispose() { foreach (SafeFileHandle handle in handles) handle.Dispose(); handles.Clear(); paths.Clear(); }
        }
        private static SafeFileHandle OpenFile(string path, bool delete)
        {
            SafeFileHandle handle = CreateFile(path, 0x80000000U | (delete ? 0x10000U : 0U), 1, IntPtr.Zero, 3, 0x00200080, IntPtr.Zero);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("文件被占用或无法安全读取，已保留。错误 " + Marshal.GetLastWin32Error()); }
            try { ValidateHandlePath(handle, path); return handle; } catch { handle.Dispose(); throw; }
        }
        private static SafeFileHandle OpenPreservedFile(string path)
        {
            // READ/WRITE for hash verification and optional Windows compression,
            // DELETE for same-volume rename. Main-stream writes and replacement
            // stay blocked. Named streams can still be created independently;
            // renaming the complete object preserves them without a deletion race.
            SafeFileHandle handle = CreateFile(path, 0xC0010000U, 1, IntPtr.Zero, 3, 0x00200080, IntPtr.Zero);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("原文件被占用或无法安全隔离，已保留。错误 " + Marshal.GetLastWin32Error()); }
            try { ValidateHandlePath(handle, path); return handle; } catch { handle.Dispose(); throw; }
        }
        private static SafeFileHandle OpenCrossVolumeSource(string path)
        {
            // Exclusive main-stream access rejects active readers/writers. ADS
            // are also checked after delete-pending closes new pathname opens.
            SafeFileHandle handle = CreateFile(path, 0xC0030000U, 0, IntPtr.Zero, 3, 0x00200080, IntPtr.Zero);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("原文件正被使用或无法独占验证，已保留。错误 " + Marshal.GetLastWin32Error()); }
            try { ValidateHandlePath(handle, path); return handle; } catch { handle.Dispose(); throw; }
        }
        private static void SetDeletePending(SafeFileHandle handle, bool delete)
        {
            DeleteDisposition value = new DeleteDisposition { Delete = delete };
            if (!SetFileInformationByHandle(handle, 4, ref value, (uint)Marshal.SizeOf(typeof(DeleteDisposition)))) throw new IOException(delete ? "Windows 拒绝安全释放原文件，原文件保留。" : "Windows 拒绝撤销删除标记；已验证的 D 盘备份仍可恢复。");
        }
        private static byte[] ReadSecurity(SafeFileHandle handle)
        {
            uint needed;
            GetKernelObjectSecurity(handle, 7, null, 0, out needed);
            if (needed == 0 || needed > 65536) throw new IOException("无法读取原文件权限，原文件保留。");
            byte[] data = new byte[needed];
            if (!GetKernelObjectSecurity(handle, 7, data, needed, out needed)) throw new IOException("无法读取原文件权限，原文件保留。");
            return data;
        }
        private static void RestoreMetadata(SafeFileHandle handle, Dictionary<string, object> record)
        {
            byte[] security = Convert.FromBase64String(S(record, "security"));
            RawSecurityDescriptor descriptor = new RawSecurityDescriptor(security, 0);
            uint flags = 7U | ((descriptor.ControlFlags & ControlFlags.DiscretionaryAclProtected) != 0 ? 0x80000000U : 0x20000000U);
            if (!SetKernelObjectSecurity(handle, flags, security)) throw new IOException("无法完整恢复文件权限；已撤销新建文件，D 盘备份保留。错误 " + Marshal.GetLastWin32Error());
            bool compressed = (L(record, "attributes") & 0x800) != 0;
            if (((Info(handle).Attributes & 0x800) != 0) != compressed)
            {
                TrySetCompression(handle, compressed);
                if (((Info(handle).Attributes & 0x800) != 0) != compressed) throw new IOException("无法恢复原始压缩属性，D 盘备份保留。");
            }
            FileBasicInfo basic = new FileBasicInfo { Attributes = (uint)L(record, "attributes") & 0x000021A7U };
            if (basic.Attributes == 0) basic.Attributes = 0x80;
            int size = Marshal.SizeOf(typeof(FileBasicInfo)); IntPtr memory = Marshal.AllocHGlobal(size);
            try { Marshal.StructureToPtr(basic, memory, false); if (!SetFileInformationBuffer(handle, 0, memory, (uint)size)) throw new IOException("无法恢复原始文件属性，D 盘备份保留。"); }
            finally { Marshal.FreeHGlobal(memory); }
            byte[] restored = ReadSecurity(handle);
            RawSecurityDescriptor actual = new RawSecurityDescriptor(restored, 0);
            if (!SamePermissions(actual, descriptor)) throw new IOException("恢复权限复验失败，D 盘备份保留。");
        }
        private static bool SamePermissions(RawSecurityDescriptor actual, RawSecurityDescriptor expected)
        {
            // Windows normalizes bookkeeping flags such as AUTO_INHERITED when
            // applying a descriptor. Compare the actual owner, group, DACL
            // protection and every ACE, rather than that incidental flag.
            if (actual.Owner != expected.Owner || actual.Group != expected.Group || (actual.ControlFlags & ControlFlags.DiscretionaryAclProtected) != (expected.ControlFlags & ControlFlags.DiscretionaryAclProtected)) return false;
            if (actual.DiscretionaryAcl == null || expected.DiscretionaryAcl == null) return actual.DiscretionaryAcl == null && expected.DiscretionaryAcl == null;
            if (actual.DiscretionaryAcl.Count != expected.DiscretionaryAcl.Count) return false;
            for (int i = 0; i < actual.DiscretionaryAcl.Count; i++)
            {
                GenericAce a = actual.DiscretionaryAcl[i], b = expected.DiscretionaryAcl[i];
                byte[] x = new byte[a.BinaryLength], y = new byte[b.BinaryLength]; a.GetBinaryForm(x, 0); b.GetBinaryForm(y, 0);
                if (!x.SequenceEqual(y)) return false;
            }
            return true;
        }
        private static bool OnlyDefaultDataStream(SafeFileHandle handle)
        {
            // FileStreamInformation is queried on the already validated object,
            // avoiding a second pathname open. Unsupported/error/oversized stream
            // descriptions are protected instead of assumed to contain no ADS.
            const int capacity = 2048;
            IntPtr buffer = Marshal.AllocHGlobal(capacity);
            try
            {
                IoStatusBlock io;
                int status = NtQueryInformationFile(handle, out io, buffer, capacity, 22);
                ulong size = io.Information.ToUInt64();
                if (status != 0 || size < 24 || size > capacity) return false;
                uint next = unchecked((uint)Marshal.ReadInt32(buffer, 0));
                uint nameBytes = unchecked((uint)Marshal.ReadInt32(buffer, 4));
                if (next != 0 || (nameBytes & 1) != 0 || nameBytes > size - 24) return false;
                return nameBytes == 0 || String.Equals(Marshal.PtrToStringUni(IntPtr.Add(buffer, 24), (int)nameBytes / 2), "::$DATA", StringComparison.Ordinal);
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        private static bool SameVolume(SafeFileHandle source, string directory)
        {
            using (SafeFileHandle destination = CreateFile(directory, 0, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero))
            {
                if (destination.IsInvalid) throw new IOException("无法验证隔离磁盘卷。");
                ValidateHandlePath(destination, directory);
                return Info(source).VolumeSerial == Info(destination).VolumeSerial;
            }
        }
        private static void RenameByHandle(SafeFileHandle handle, string destination)
        {
            string full = Path.GetFullPath(destination);
            byte[] name = Encoding.Unicode.GetBytes(full);
            int rootOffset = IntPtr.Size == 8 ? 8 : 4;
            int lengthOffset = rootOffset + IntPtr.Size;
            int nameOffset = lengthOffset + 4;
            int size = checked(nameOffset + name.Length + 2);
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.Copy(new byte[size], 0, buffer, size); // ReplaceIfExists=false; RootDirectory=NULL
                Marshal.WriteInt32(buffer, lengthOffset, name.Length);
                Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length);
                if (!SetFileInformationBuffer(handle, 3, buffer, (uint)size)) throw new IOException("Windows 拒绝完整文件原子移动；不会覆盖已有文件。错误 " + Marshal.GetLastWin32Error());
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        private static string TrySetCompression(SafeFileHandle handle, bool compressed)
        {
            ushort format = compressed ? (ushort)1 : (ushort)0;
            uint returned;
            if (!DeviceIoControl(handle, 0x0009C040, ref format, 2, IntPtr.Zero, 0, out returned, IntPtr.Zero))
                return "Windows NTFS 压缩未完成（错误 " + Marshal.GetLastWin32Error() + "），完整原件仍保留，实际空间差额以磁盘实测为准。";
            return compressed ? "Windows NTFS 压缩已完成；实际空间差额以磁盘实测为准。" : "原始未压缩状态已恢复。";
        }
        private static long StoredBytes(SafeFileHandle handle, long fallback, out bool estimated)
        {
            // Count all known streams on the preserved file object, including an
            // ADS which may have arrived after the candidate guard. This is a
            // recorded allocation snapshot, not a claim about whole-drive delta.
            const int capacity = 65536;
            estimated = true;
            IntPtr buffer = Marshal.AllocHGlobal(capacity);
            try
            {
                IoStatusBlock io; int status = NtQueryInformationFile(handle, out io, buffer, capacity, 22);
                ulong size = io.Information.ToUInt64();
                if (status != 0 || size < 24 || size > capacity) return fallback;
                int offset = 0; long total = 0;
                while ((ulong)offset + 24 <= size)
                {
                    long allocated = Marshal.ReadInt64(buffer, offset + 16);
                    if (allocated < 0 || allocated > Int64.MaxValue - total) return fallback;
                    total += allocated;
                    uint next = unchecked((uint)Marshal.ReadInt32(buffer, offset));
                    if (next == 0) { estimated = false; return total; }
                    if (next < 24 || (next & 7) != 0 || (ulong)offset + next + 24 > size) return fallback;
                    offset += (int)next;
                }
                return fallback;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        private static void RestorePreservedFile(string preserved, string destination, Dictionary<string, object> record)
        {
            using (AncestorLocks recoveryParents = new AncestorLocks(preserved))
            using (AncestorLocks destinationParents = new AncestorLocks(destination))
            using (SafeFileHandle handle = OpenPreservedFile(preserved))
            using (FileStream content = new FileStream(handle, FileAccess.ReadWrite))
            {
                NativeInfo info = Info(handle);
                if (info.Links != 1 || (info.Attributes & 0x400) != 0 || content.Length != L(record, "bytes")) throw new IOException("完整隔离原件身份或大小不符，已保留原件。");
                using (SHA256 sha = SHA256.Create()) if (Hex(sha.ComputeHash(content)) != S(record, "sha256")) throw new IOException("完整隔离原件主流校验失败，已保留原件。");
                if (!SameVolume(handle, Path.GetDirectoryName(destination))) throw new IOException("完整文件恢复仅允许同一磁盘卷。");
                bool originalCompression = (L(record, "attributes") & 0x800) != 0;
                if (((info.Attributes & 0x800) != 0) != originalCompression)
                {
                    TrySetCompression(handle, originalCompression);
                    if (((Info(handle).Attributes & 0x800) != 0) != originalCompression) throw new IOException("无法恢复原始压缩状态，完整原件仍在隔离区。");
                }
                FileTime created = ToFileTime(L(record, "createdTicks")), modified = ToFileTime(L(record, "modifiedTicks")), accessed = ToFileTime(L(record, "accessTicks"));
                if (!SetFileTime(handle, ref created, ref accessed, ref modified)) throw new IOException("无法恢复原始文件时间，完整原件仍在隔离区。");
                content.Flush(true);
                RenameByHandle(handle, destination); // ReplaceIfExists is always false, including races.
                ValidateRenamedFile(handle, destination);
            }
        }
        private static void ValidateRenamedFile(SafeFileHandle original, string destination)
        {
            // Windows filesystem virtualization/filter drivers can retain the
            // old pathname association on an open handle after rename. Validate
            // the new name with a fresh metadata-only handle instead, and prove
            // that it names the exact object we continue to hold. The original
            // handle denies replacement and the caller holds both parent chains.
            NativeInfo expected = Info(original);
            using (SafeFileHandle fresh = CreateFile(destination, 0x80, 7, IntPtr.Zero, 3, 0x00200080, IntPtr.Zero))
            {
                if (fresh.IsInvalid) throw new IOException("无法验证已移动的完整原件；原件仍保留。错误 " + Marshal.GetLastWin32Error());
                ValidateHandlePath(fresh, destination);
                NativeInfo actual = Info(fresh);
                if ((actual.Attributes & 0x400) != 0 || actual.VolumeSerial != expected.VolumeSerial || actual.IndexHigh != expected.IndexHigh || actual.IndexLow != expected.IndexLow)
                    throw new IOException("移动目标并非持续持有的原文件对象，禁止继续操作。");
            }
        }
        private static SafeFileHandle CreateRecoveryFile(string path)
        {
            SafeFileHandle handle = CreateFile(path, 0xC00D0100U, 0, IntPtr.Zero, 1, 0x00200080, IntPtr.Zero);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("无法在原位置创建恢复文件；不会覆盖现有文件。错误 " + Marshal.GetLastWin32Error()); }
            try { ValidateHandlePath(handle, path); return handle; } catch { DeleteDisposition disposition = new DeleteDisposition { Delete = true }; SetFileInformationByHandle(handle, 4, ref disposition, (uint)Marshal.SizeOf(typeof(DeleteDisposition))); handle.Dispose(); throw; }
        }
        private static void ValidateHandlePath(SafeFileHandle handle, string expected)
        {
            string actual = FinalHandlePath(handle);
            if (!String.Equals(Path.GetFullPath(actual).TrimEnd('\\'), Path.GetFullPath(expected).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new IOException("实际文件位置与安全计划不符，已停止。实际：" + actual + "；计划：" + expected);
        }
        private static string FinalHandlePath(SafeFileHandle handle)
        {
            StringBuilder buffer = new StringBuilder(32768); uint count = GetFinalPathNameByHandle(handle, buffer, (uint)buffer.Capacity, 0);
            if (count == 0 || count >= buffer.Capacity) throw new IOException("无法验证实际文件位置。错误 " + Marshal.GetLastWin32Error());
            string actual = buffer.ToString(); if (actual.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) actual = @"\\" + actual.Substring(8); else if (actual.StartsWith(@"\\?\", StringComparison.Ordinal)) actual = actual.Substring(4);
            return Path.GetFullPath(actual);
        }
        private static string LocateRecoveryDirectory()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string logical = Path.Combine(local, "QDuoWindows", "Recovery");
            if (!SafeAncestors(logical)) throw new IOException("恢复目录不允许使用重解析点。");
            if (!Directory.Exists(logical)) return logical;
            if (!SafeAncestors(logical)) throw new IOException("恢复目录不允许使用重解析点。");
            using (SafeFileHandle handle = CreateFile(logical, 0, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero))
            {
                if (handle.IsInvalid || (Info(handle).Attributes & 0x400) != 0) throw new IOException("无法验证恢复目录。");
                string actual = FinalHandlePath(handle);
                if (String.Equals(actual.TrimEnd('\\'), logical.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) return actual;
                // Packaged desktop hosts can virtualize LocalAppData without a
                // reparse point. Accept only the OS-reported current package's
                // exact LocalCache path, then use that physical path thereafter.
                string packages = Path.Combine(local, "Packages");
                string prefix = packages.TrimEnd('\\') + "\\";
                if (!actual.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || !SafeAncestors(actual)) throw new IOException("恢复目录出现未经验证的重定向。");
                string suffix = actual.Substring(prefix.Length); int separator = suffix.IndexOf('\\');
                if (separator < 1 || !String.Equals(suffix.Substring(separator), @"\LocalCache\Local\QDuoWindows\Recovery", StringComparison.OrdinalIgnoreCase)) throw new IOException("恢复目录出现未经验证的重定向。");
                // An unpackaged child of a packaged desktop host may inherit
                // filesystem virtualization while reporting no package identity.
                // The accepted fallback is still confined to this user's exact
                // package LocalCache application-owned Recovery directory.
                uint length = 0; GetCurrentPackageFamilyName(ref length, null);
                if (length > 0 && length <= 512)
                {
                    StringBuilder family = new StringBuilder((int)length);
                    if (GetCurrentPackageFamilyName(ref length, family) != 0 || !String.Equals(suffix.Substring(0, separator), family.ToString(), StringComparison.OrdinalIgnoreCase)) throw new IOException("Windows 包存储映射不符。");
                }
                else if (!String.Equals(suffix.Substring(0, separator), "OpenAI.Codex_2p2nqsd0c76g0", StringComparison.OrdinalIgnoreCase))
                    throw new IOException("非当前 Windows 包或已验证 Codex 包的恢复目录映射被拒绝。");
                return actual;
            }
        }
        private static string LocateLegacyRecoveryDirectory()
        {
            try { return LocateRecoveryDirectory(); }
            catch { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QDuoWindows", "Recovery"); }
        }
        private static NativeInfo Info(SafeFileHandle handle) { NativeInfo info; if (!GetFileInformationByHandle(handle, out info)) throw new IOException("无法验证文件链接和身份。"); return info; }
        private static bool Matches(Candidate candidate, NativeInfo info)
        {
            long length = ((long)info.SizeHigh << 32) | info.SizeLow;
            return length == candidate.Bytes && FromFileTime(info.Created).Ticks == candidate.CreatedTicks && FromFileTime(info.Modified).Ticks == candidate.ModifiedTicks && (info.Attributes & 0x400) == 0 && info.Attributes == (uint)candidate.Attributes && info.VolumeSerial == candidate.VolumeSerial && info.IndexHigh == candidate.IndexHigh && info.IndexLow == candidate.IndexLow;
        }
        [StructLayout(LayoutKind.Sequential)] private struct FileTime { public uint Low, High; }
        [StructLayout(LayoutKind.Sequential)] private struct NativeInfo { public uint Attributes; public FileTime Created, Accessed, Modified; public uint VolumeSerial, SizeHigh, SizeLow, Links, IndexHigh, IndexLow; }
        [StructLayout(LayoutKind.Sequential)] private struct DeleteDisposition { [MarshalAs(UnmanagedType.U1)] public bool Delete; }
        [StructLayout(LayoutKind.Sequential)] private struct FileBasicInfo { public long Created, Accessed, Modified, Changed; public uint Attributes; }
        [StructLayout(LayoutKind.Sequential)] private struct IoStatusBlock { public IntPtr Status; public UIntPtr Information; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out NativeInfo info);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetFileInformationByHandle(SafeFileHandle handle, int kind, ref DeleteDisposition info, uint size);
        [DllImport("kernel32.dll", EntryPoint = "SetFileInformationByHandle", SetLastError = true)] private static extern bool SetFileInformationBuffer(SafeFileHandle handle, int kind, IntPtr info, uint size);
        [DllImport("ntdll.dll")] private static extern int NtQueryInformationFile(SafeFileHandle handle, out IoStatusBlock info, IntPtr buffer, int size, int kind);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool DeviceIoControl(SafeFileHandle handle, uint code, ref ushort input, uint inputSize, IntPtr output, uint outputSize, out uint returned, IntPtr overlapped);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetFileTime(SafeFileHandle handle, ref FileTime created, ref FileTime accessed, ref FileTime modified);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint capacity, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetCurrentPackageFamilyName(ref uint length, StringBuilder name);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetKernelObjectSecurity(SafeFileHandle handle, uint info, byte[] descriptor, uint length, out uint needed);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool SetKernelObjectSecurity(SafeFileHandle handle, uint info, byte[] descriptor);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool MoveFileEx(string existing, string destination, uint flags);
        private static DateTime FromFileTime(FileTime time) { return DateTime.FromFileTimeUtc(((long)time.High << 32) | time.Low); }
        private static FileTime ToFileTime(long ticks) { long ft = new DateTime(ticks, DateTimeKind.Utc).ToFileTimeUtc(); return new FileTime { High = (uint)(ft >> 32), Low = (uint)ft }; }

        private static string BackupReadiness()
        {
            try
            {
                DriveInfo disk = new DriveInfo(@"D:\");
                if (!disk.IsReady || disk.DriveType != DriveType.Fixed || !String.Equals(disk.DriveFormat, "NTFS", StringComparison.OrdinalIgnoreCase)) return "D 盘必须是可用的本地 NTFS 磁盘；未执行清理。";
                if (disk.AvailableFreeSpace < 256L * 1024 * 1024) return "D 盘至少需要 256 MiB 余量；未执行清理。";
                if (!SafeAncestors(Quarantine)) return "D 盘恢复目录含重解析点，禁止清理。";
                return null;
            }
            catch (Exception ex) { return "D 盘恢复目录暂不可用，禁止清理：" + ex.Message; }
        }
        private static void EnsureRecoveryDirectory()
        {
            string error = BackupReadiness(); if (error != null) throw new IOException(error);
            if (!SafeAncestors(Quarantine)) throw new IOException("恢复目录路径不安全。");
            Directory.CreateDirectory(Quarantine);
            if (!SafeAncestors(Quarantine)) throw new IOException("恢复目录不可使用重解析点。");
            using (AncestorLocks ancestors = new AncestorLocks(Path.Combine(Quarantine, "journal.key")))
            {
                DirectorySecurity permissions = new DirectorySecurity(); permissions.SetAccessRuleProtection(true, false);
                permissions.AddAccessRule(new FileSystemAccessRule(System.Security.Principal.WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                permissions.AddAccessRule(new FileSystemAccessRule(new System.Security.Principal.SecurityIdentifier("S-1-5-18"), FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                Directory.SetAccessControl(Quarantine, permissions);
                Key(Quarantine, true);
            }
        }
        private static byte[] Key(string recoveryRoot, bool create)
        {
            lock (JournalKeys)
            {
                byte[] value; if (JournalKeys.TryGetValue(recoveryRoot, out value)) return value;
                string path = Path.Combine(recoveryRoot, "journal.key");
                if (!SafeAncestors(path)) throw new IOException("恢复密钥路径不安全。");
                if (File.Exists(path))
                {
                    using (SafeFileHandle handle = OpenFile(path, false))
                    using (FileStream file = new FileStream(handle, FileAccess.Read))
                    {
                        if (file.Length > 65536 || Info(handle).Links != 1 || !OnlyDefaultDataStream(handle)) throw new IOException("恢复密钥格式不安全。");
                        byte[] protectedKey = new byte[(int)file.Length]; int offset = 0;
                        while (offset < protectedKey.Length) { int read = file.Read(protectedKey, offset, protectedKey.Length - offset); if (read == 0) throw new IOException("恢复密钥读取不完整。"); offset += read; }
                        value = ProtectedData.Unprotect(protectedKey, Encoding.UTF8.GetBytes(Policy), DataProtectionScope.CurrentUser);
                    }
                }
                else
                {
                    if (!create) throw new IOException("恢复密钥不存在，禁止修改或恢复该交易。");
                    value = new byte[32]; using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(value);
                    byte[] encrypted = ProtectedData.Protect(value, Encoding.UTF8.GetBytes(Policy), DataProtectionScope.CurrentUser);
                    using (FileStream file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { ValidateHandlePath(file.SafeFileHandle, path); file.Write(encrypted, 0, encrypted.Length); file.Flush(true); }
                }
                if (value.Length != 32) throw new IOException("恢复记录密钥无效。"); JournalKeys[recoveryRoot] = value; return value;
            }
        }
        private static void SaveJournal(string id, Dictionary<string, object> journal)
        { SaveJournalAt(Quarantine, id, journal); }
        private static void SaveJournalAt(string recoveryRoot, string id, Dictionary<string, object> journal)
        {
            ValidateId(id); string dir = Path.Combine(recoveryRoot, id); if (!SafeAncestors(dir)) throw new IOException("恢复记录目录不安全。");
            string payload = Serializer().Serialize(journal); string signature; using (HMACSHA256 hmac = new HMACSHA256(Key(recoveryRoot, false))) signature = Hex(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
            string temp = Path.Combine(dir, "journal." + Guid.NewGuid().ToString("N") + ".tmp"), dest = Path.Combine(dir, "journal.json");
            byte[] data = Encoding.UTF8.GetBytes(Serializer().Serialize(D("payload", payload, "signature", signature)));
            using (FileStream file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { ValidateHandlePath(file.SafeFileHandle, temp); file.Write(data, 0, data.Length); file.Flush(true); }
            // MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH commits the
            // already-flushed temporary journal before C-side release proceeds.
            if (!MoveFileEx(temp, dest, 9)) throw new IOException("无法持久化恢复记录；原文件保留。错误 " + Marshal.GetLastWin32Error());
            using (SafeFileHandle handle = OpenFile(dest, false))
            using (FileStream file = new FileStream(handle, FileAccess.Read))
            {
                if (Info(handle).Links != 1 || !OnlyDefaultDataStream(handle) || file.Length != data.Length) throw new IOException("落盘恢复记录身份或大小不符，原文件保留。");
                using (SHA256 sha = SHA256.Create()) if (!sha.ComputeHash(file).SequenceEqual(sha.ComputeHash(data))) throw new IOException("落盘恢复记录校验失败，原文件保留。");
            }
        }
        private static string FindRecoveryRoot(string id)
        {
            ValidateId(id);
            bool current = Directory.Exists(Path.Combine(Quarantine, id)), legacy = Directory.Exists(Path.Combine(LegacyQuarantine, id));
            if (current && legacy) throw new IOException("恢复交易 ID 同时存在于两个位置，禁止自动选择。");
            if (current) return Quarantine; if (legacy) return LegacyQuarantine;
            throw new IOException("恢复交易不存在。");
        }
        private static Dictionary<string, object> ReadJournalAt(string recoveryRoot, string id)
        {
            ValidateId(id); string path = Path.Combine(recoveryRoot, id, "journal.json"); if (!SafeAncestors(path)) throw new IOException("恢复记录路径不安全。");
            FileInfo file = new FileInfo(path); if (!file.Exists || file.Length > 4 * 1024 * 1024) throw new IOException("恢复记录不存在或过大。");
            var envelope = Serializer().DeserializeObject(File.ReadAllText(path, Encoding.UTF8)) as Dictionary<string, object>;
            if (envelope == null) throw new IOException("恢复记录格式错误。");
            string payload = S(envelope, "payload"), signature; using (HMACSHA256 hmac = new HMACSHA256(Key(recoveryRoot, false))) signature = Hex(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
            if (!FixedEqual(signature, S(envelope, "signature"))) throw new IOException("恢复记录签名不匹配，禁止恢复。");
            var journal = Serializer().DeserializeObject(payload) as Dictionary<string, object>;
            if (journal == null || S(journal, "transactionId") != id || S(journal, "policyVersion") != Policy) throw new IOException("恢复记录身份错误。");
            if (journal.ContainsKey("journalFormat"))
            {
                bool old = L(journal, "journalFormat") == 2 && S(journal, "method") == "original-rename-ntfs" && Objects(journal["records"]).All(delegate(Dictionary<string, object> r) { return S(r, "kind") == "full-file"; });
                bool cross = L(journal, "journalFormat") == 3 && S(journal, "method") == "verified-cross-volume" && Objects(journal["records"]).All(delegate(Dictionary<string, object> r) { return S(r, "kind") == "cross-volume"; });
                if (!old && !cross) throw new IOException("恢复记录版本或方法不受支持。");
            }
            return journal;
        }
        private static void ValidateRecoveryRecord(Dictionary<string, object> record)
        {
            string path = S(record, "path"), root = S(record, "root"), archive = S(record, "archive");
            if (!Within(path, root) || !Roots().Any(delegate(Root r) { return String.Equals(r.Path, root, StringComparison.OrdinalIgnoreCase); }) || !SafeAncestors(path) || archive != Path.GetFileName(archive) || !archive.EndsWith(".zip", StringComparison.Ordinal) || L(record, "bytes") < 0 || L(record, "bytes") > MaxFileBytes) throw new IOException("恢复文件不在受允许的固定缓存范围。");
            if (S(record, "kind") == "full-file")
            {
                string preserved = S(record, "preservedFile");
                if (!preserved.EndsWith(".original", StringComparison.Ordinal) || preserved.Length != 41) throw new IOException("完整隔离原件名称无效。");
                ValidateId(preserved.Substring(0, 32));
            }
            if (S(record, "kind") == "cross-volume")
            {
                byte[] security = Convert.FromBase64String(S(record, "security"));
                if (security.Length == 0 || security.Length > 65536 || !String.Equals(Path.GetPathRoot(path), @"C:\", StringComparison.OrdinalIgnoreCase)) throw new IOException("跨盘恢复记录无效。");
                new RawSecurityDescriptor(security, 0);
            }
        }
        private static Dictionary<string, object> Summary(Dictionary<string, object> journal)
        {
            var records = Objects(journal["records"]).ToArray(); return D("transactionId", S(journal, "transactionId"), "startedAt", S(journal, "startedAt"), "completedAt", journal["completedAt"], "status", S(journal, "status"),
                "fileCount", records.Length, "quarantinedFiles", records.Count(delegate(Dictionary<string, object> r) { return S(r, "state") == "quarantined"; }), "restoredFiles", records.Count(delegate(Dictionary<string, object> r) { return S(r, "state") == "restored"; }),
                "logicalBytes", records.Sum(delegate(Dictionary<string, object> r) { return L(r, "bytes"); }), "archiveBytes", records.Sum(delegate(Dictionary<string, object> r) { return L(r, "archiveBytes"); }), "canRestore", records.Any(delegate(Dictionary<string, object> r) { return S(r, "state") == "quarantined" || S(r, "state") == "prepared"; }));
        }
        private static bool VerifyArchive(string archive, string hash, long bytes)
        {
            if (!SafeAncestors(archive)) return false;
            using (FileStream file = new FileStream(archive, FileMode.Open, FileAccess.Read, FileShare.Read))
                return VerifyArchiveStream(file, hash, bytes);
        }
        private static bool VerifyArchiveStream(Stream file, string hash, long bytes)
        {
            file.Position = 0;
            using (ZipArchive zip = new ZipArchive(file, ZipArchiveMode.Read, true))
            {
                if (zip.Entries.Count != 1 || zip.Entries[0].FullName != "content" || zip.Entries[0].Length != bytes || bytes > MaxFileBytes) return false;
                using (Stream content = zip.Entries[0].Open()) using (SHA256 sha = SHA256.Create()) return Hex(sha.ComputeHash(content)) == hash;
            }
        }
        private static Dictionary<string, long> FreeSpace(IEnumerable<string> paths)
        {
            var result = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase); foreach (string path in paths) { string disk = Path.GetPathRoot(path); if (!result.ContainsKey(disk)) result[disk] = DiskFree(disk); } return result;
        }
        private static long DiskFree(string disk) { try { return new DriveInfo(disk).AvailableFreeSpace; } catch { return -1; } }
        private static void ValidateId(string id) { Guid guid; if (id == null || id.Length != 32 || !Guid.TryParseExact(id, "N", out guid)) throw new ArgumentException("事务 ID 无效。"); }
        private static bool FixedEqual(string a, string b) { if (a == null || b == null || a.Length != b.Length) return false; int diff = 0; for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i]; return diff == 0; }
        private static string HashText(string value) { using (SHA256 sha = SHA256.Create()) return Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(value))); }
        private static string Hex(byte[] bytes) { return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant(); }
        private static string Iso(DateTime date) { return date.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture); }
        private static JavaScriptSerializer Serializer() { return new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024, RecursionLimit = 32 }; }
        private static Dictionary<string, object> D(params object[] items) { var result = new Dictionary<string, object>(); for (int i = 0; i < items.Length; i += 2) result[(string)items[i]] = items[i + 1]; return result; }
        private static string S(Dictionary<string, object> obj, string key) { object value; return obj.TryGetValue(key, out value) ? Convert.ToString(value, CultureInfo.InvariantCulture) : ""; }
        private static long L(Dictionary<string, object> obj, string key) { object value; return obj.TryGetValue(key, out value) ? Convert.ToInt64(value, CultureInfo.InvariantCulture) : 0; }
        private static IEnumerable<Dictionary<string, object>> Objects(object obj) { IEnumerable sequence = obj as IEnumerable; if (sequence == null) yield break; foreach (object item in sequence) { var record = item as Dictionary<string, object>; if (record != null) yield return record; } }

        // Defender helper integrity is checked against a build-time constant, not
        // merely a sidecar that could be replaced together with the script.
        private const string ExpectedSecurityHash = "794f4cb08b6520525164dd52ada33e0c35e2e28e13ce1f6990e0cc162cd24b06";
        private static readonly object SecurityGate = new object();
        private static Dictionary<string, object> SecurityCache;
        private static DateTime SecurityChecked;
        private static Dictionary<string, object> SecurityJob;
        private static bool DefenderRunning() { lock (SecurityGate) return SecurityJob != null && S(SecurityJob, "state") == "running"; }

        public static object DefenderStatus()
        {
            lock (SecurityGate)
            {
                if (SecurityCache == null || DateTime.UtcNow - SecurityChecked > TimeSpan.FromSeconds(20))
                {
                    try { SecurityCache = RunSecurity("status", 25000); }
                    catch (Exception ex) { SecurityCache = D("schemaVersion", 1, "checkedAt", Iso(DateTime.UtcNow), "available", false, "status", null, "threats", new object[0], "detections", new object[0], "errors", new[] { ex.Message }); }
                    SecurityChecked = DateTime.UtcNow;
                }
                var response = new Dictionary<string, object>(SecurityCache); response["job"] = SecurityJob == null ? null : new Dictionary<string, object>(SecurityJob);
                response["suggestions"] = new[] { "病毒判断只采用 Microsoft Defender 检测结果，低/中清理风险不代表病毒。", "扫描可能按系统已有策略自动隔离威胁；处理威胁按钮仅调用 Defender 已确认的活动威胁处置。", "需要权限或 Defender 不可用时查看 Windows 安全中心；程序不会关闭防护、加排除项或自作病毒判断。" };
                return response;
            }
        }
        public static object StartDefender(string action)
        {
            if (action != "quick" && action != "full" && action != "remediate" && action != "refresh") throw new ArgumentException("安全动作只允许 quick、full、remediate、refresh。");
            lock (Gate)
            lock (SecurityGate)
            {
                if (Busy) throw new InvalidOperationException("请先等待文件清理或恢复完成。");
                if (SecurityJob != null && S(SecurityJob, "state") == "running") throw new InvalidOperationException("已有 Defender 任务运行中。");
                string jobId = Guid.NewGuid().ToString("N");
                SecurityJob = D("id", jobId, "action", action, "state", "running", "startedAt", Iso(DateTime.UtcNow), "completedAt", null, "message", "正在交由 Microsoft Defender 执行；系统不提供可靠百分比。", "exitCode", null);
                Task.Run(delegate
                {
                    try
                    {
                        int exit; Dictionary<string, object> result = RunSecurity(action, 0, out exit);
                        lock (SecurityGate)
                        {
                            SecurityCache = result; SecurityChecked = DateTime.UtcNow;
                            SecurityJob["state"] = exit == 0 ? "succeeded" : "failed"; SecurityJob["exitCode"] = exit; SecurityJob["completedAt"] = Iso(DateTime.UtcNow);
                            SecurityJob["message"] = exit == 0 ? "Defender 命令已完成；请依据威胁记录与扫描时间查看结果。" : "Defender 命令失败；请查看具体错误和 Windows 安全中心。";
                        }
                    }
                    catch (Exception ex) { lock (SecurityGate) { SecurityJob["state"] = "failed"; SecurityJob["completedAt"] = Iso(DateTime.UtcNow); SecurityJob["message"] = ex.Message; SecurityJob["exitCode"] = -1; } }
                });
                return DefenderStatus();
            }
        }
        private static Dictionary<string, object> RunSecurity(string action, int timeout) { int exit; return RunSecurity(action, timeout, out exit); }
        private static Dictionary<string, object> RunSecurity(string action, int timeout, out int exit)
        {
            string script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Security.ps1");
            if (!File.Exists(script) || !SafeAncestors(script)) throw new IOException("安全助手缺失或校验不符，请使用完整原版便携包。");
            using (AncestorLocks scriptParents = new AncestorLocks(script))
            using (SafeFileHandle scriptHandle = OpenFile(script, false))
            using (FileStream scriptStream = new FileStream(scriptHandle, FileAccess.Read))
            {
            string text; using (StreamReader reader = new StreamReader(scriptStream, Encoding.UTF8, true, 4096, true)) text = reader.ReadToEnd();
            if (HashText(text) != ExpectedSecurityHash) throw new IOException("安全助手缺失或校验不符，请使用完整原版便携包。");
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            ProcessStartInfo info = new ProcessStartInfo(powershell, "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\" -Action " + action) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8 };
            using (Process process = Process.Start(info))
            {
                Task<string> stdout = process.StandardOutput.ReadToEndAsync(), stderr = process.StandardError.ReadToEndAsync();
                if (timeout > 0 && !process.WaitForExit(timeout)) { try { process.Kill(); } catch { } throw new TimeoutException("Defender 状态查询超时；不会因此重启或重复安全任务。"); }
                if (timeout == 0) process.WaitForExit();
                string output = stdout.GetAwaiter().GetResult().Trim(), error = stderr.GetAwaiter().GetResult(); exit = process.ExitCode;
                if (output.Length > 4 * 1024 * 1024 || output.Length == 0) throw new IOException("Defender 未返回有效状态。" + (error.Length > 2000 ? error.Substring(0, 2000) : error));
                var result = Serializer().DeserializeObject(output) as Dictionary<string, object>;
                if (result == null || !result.ContainsKey("available")) throw new IOException("Defender 返回状态格式无效。"); return result;
            }
            }
        }
    }
}

