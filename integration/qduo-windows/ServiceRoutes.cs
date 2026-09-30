using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

namespace QDuoWindows
{
    // This boundary accepts fixed operations and opaque IDs, never commands or cleanup paths.
    public static class ServiceRoutes
    {
        public static bool IsRoute(string method, string path)
        {
            if (method == "GET") return new[] { "/safety/status", "/security/status", "/files/roots" }.Contains(path);
            return method == "POST" && new[] { "/safety/scan", "/safety/plan", "/safety/clean", "/safety/restore", "/security/start", "/files/scan", "/files/list", "/files/thumbnail", "/files/bindings" }.Contains(path);
        }
        public static string Validate(string path, Dictionary<string, object> data)
        {
            if (data == null) return "需要 JSON 对象。";
            string[] keys;
            switch (path)
            {
                case "/safety/scan": keys = new[] { "deep" }; break;
                case "/safety/plan": keys = new[] { "risk", "fileIds" }; break;
                case "/safety/clean": keys = new[] { "planId" }; break;
                case "/safety/restore": keys = new[] { "transactionId" }; break;
                case "/security/start": keys = new[] { "action" }; break;
                case "/files/scan": keys = new[] { "deep", "bookmarks", "bindings" }; break;
                case "/files/list": keys = new[] { "query", "category", "cursor", "limit" }; break;
                case "/files/thumbnail": keys = new[] { "id" }; break;
                case "/files/bindings": keys = new[] { "bindings" }; break;
                default: keys = new string[0]; break;
            }
            if (data.Keys.Any(k => !keys.Contains(k))) return "请求含不支持的参数。";
            object value;
            if (data.TryGetValue("deep", out value) && !(value is bool)) return "扫描范围参数无效。";
            if (path == "/safety/plan")
            {
                if (!StringField(data, "risk", 10, true) || !new[] { "low", "medium" }.Contains((string)data["risk"])) return "只允许低风险或中风险计划。";
                if (!data.TryGetValue("fileIds", out value) || !IdArray(value, 500)) return "文件选择无效或超过 500 个。";
            }
            if (path == "/safety/clean" && !StringField(data, "planId", 128, true)) return "清理计划编号无效。";
            if (path == "/safety/restore" && !StringField(data, "transactionId", 128, true)) return "恢复记录编号无效。";
            if (path == "/files/thumbnail" && !StringField(data, "id", 128, true)) return "图片编号无效。";
            if (path == "/security/start" && (!StringField(data, "action", 16, true) || !new[] { "quick", "full", "remediate", "refresh" }.Contains((string)data["action"]))) return "安全防护操作无效。";
            if (path == "/files/list")
            {
                if (!StringField(data, "query", 256, false) || !StringField(data, "category", 128, false) || (data.ContainsKey("cursor") && data["cursor"] != null && !StringField(data, "cursor", 128, false))) return "文件筛选参数无效。";
                if (data.TryGetValue("limit", out value) && (!(value is int) || (int)value < 1 || (int)value > 100)) return "每页允许 1–100 个文件。";
            }
            if (data.TryGetValue("bookmarks", out value))
            {
                IList entries = value as IList;
                if (entries == null || entries.Count > 2000) return "收藏列表无效或超过 2000 条。";
                foreach (object entry in entries)
                {
                    var row = entry as Dictionary<string, object>;
                    if (row == null || row.Keys.Any(k => !new[] { "id", "title", "url", "projectId" }.Contains(k)) || !StringField(row, "id", 128, true) || !StringField(row, "title", 512, false) || !StringField(row, "url", 4096, true) || !StringField(row, "projectId", 128, false)) return "收藏条目格式无效。";
                }
            }
            if (data.TryGetValue("bindings", out value))
            {
                IList entries = value as IList;
                if (entries == null || entries.Count > 64) return "最多绑定 64 个本机根目录。";
                foreach (object entry in entries)
                {
                    var row = entry as Dictionary<string, object>;
                    if (row == null || row.Keys.Any(k => !new[] { "rootId", "bookmarkId" }.Contains(k)) || !StringField(row, "rootId", 128, true) || !StringField(row, "bookmarkId", 128, true)) return "仅允许扫描目录与已有收藏编号绑定。";
                }
            }
            return null;
        }
        static bool StringField(Dictionary<string, object> data, string key, int max, bool required)
        {
            object value;
            if (!data.TryGetValue(key, out value)) return !required;
            string text = value as string;
            return text != null && text.Length <= max && (!required || text.Length > 0) && text.IndexOf('\0') < 0;
        }
        static bool IdArray(object value, int max)
        {
            IList list = value as IList;
            return list != null && list.Count <= max && list.Cast<object>().All(v => v is string && ((string)v).Length > 0 && ((string)v).Length <= 128 && ((string)v).IndexOf('\0') < 0);
        }
        public static string Text(Dictionary<string, object> data, string key, string fallback = "") { object value; return data.TryGetValue(key, out value) && value is string ? (string)value : fallback; }
        public static object Value(Dictionary<string, object> data, string key) { object value; return data.TryGetValue(key, out value) ? value : null; }
        public static bool Deep(Dictionary<string, object> data) { object value; return data.TryGetValue("deep", out value) && value is bool && (bool)value; }
        public static int Limit(Dictionary<string, object> data) { object value; return data.TryGetValue("limit", out value) && value is int ? (int)value : 24; }
        public static string[] Ids(Dictionary<string, object> data) { return ((IList)data["fileIds"]).Cast<object>().Select(v => (string)v).ToArray(); }
    }
}
