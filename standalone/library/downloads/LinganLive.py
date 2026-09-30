"""Downloadable Lingan Windows companion; recording is handled by official tools."""
from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import webbrowser

from live_core import (ApiClient, ApiError, Cancelled, CredentialVault, DirectoryWatcher,
                       EXTENSIONS, ORIGIN, PLATFORMS, UploadChanged, atomic_write,
                       file_signature, friendly_error, hash_file, valid_pairing)


class Engine:
    def __init__(self, emit, folder: Path):
        self.emit = emit
        self.folder = folder
        self.state_path = folder / "state.json"
        self.vault = CredentialVault(folder)
        self.lock = threading.RLock()
        self.shutdown = threading.Event()
        self.wakeup = threading.Event()
        self.client = None
        self.token = ""
        self.pair_request = None
        self.watcher = None
        self.platform = "douyin"
        self.monitored_folder = ""
        self.monitoring = False
        self.tasks = []
        self.completed = set()
        self.auth_blocked = False
        self._load_state()
        try:
            saved = self.vault.load()
            if saved:
                self.pair_request = (saved, False)
        except Exception as exc:
            self.emit("log", friendly_error(exc))
        threading.Thread(target=self._monitor, daemon=True).start()
        threading.Thread(target=self._uploads, daemon=True).start()

    def _load_state(self):
        try:
            data = json.loads(self.state_path.read_text("utf-8"))
            self.tasks = [t for t in data.get("tasks", []) if isinstance(t, dict) and "path" in t and t.get("platform") in PLATFORMS]
            for task in self.tasks:
                task["retryAt"] = 0
            self.completed = set(data.get("completed", []))
            self.monitored_folder = data.get("folder", "")
            self.platform = data.get("platform", "douyin") if data.get("platform") in PLATFORMS else "douyin"
        except (OSError, ValueError, TypeError):
            pass

    def _save(self):
        with self.lock:
            data = {"tasks": self.tasks, "completed": sorted(self.completed),
                    "folder": self.monitored_folder, "platform": self.platform}
            atomic_write(self.state_path, json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def pair(self, code):
        if not valid_pairing(code):
            raise ValueError("请粘贴网站生成的完整配对码，格式为 llive_设备编号.凭据。")
        with self.lock:
            self.pair_request = (code.strip(), True)
        self.wakeup.set()

    def start_watch(self, folder, platform):
        path = Path(folder)
        if not path.is_dir():
            raise ValueError("请先选择有效的本地录制目录。")
        if platform not in PLATFORMS:
            raise ValueError("请选择平台。")
        with self.lock:
            if not self.client:
                raise ValueError("请先完成网站配对。")
            self.watcher = DirectoryWatcher(path)
            self.monitored_folder = str(path.resolve())
            self.platform = platform
            self.monitoring = True
            self._save()
        self.emit("monitor", True)
        self.emit("log", "已启动监测：只接收此刻以后出现的新回放。已有文件可通过“手动上传历史文件”导入。")

    def stop_watch(self):
        with self.lock:
            self.monitoring = False
        self.emit("monitor", False)
        self.emit("log", "已停止发现新回放；已加入队列的文件继续保存。")

    def enqueue(self, paths, platform, automatic=False):
        with self.lock:
            known = {t["path"] for t in self.tasks}
            for source in paths:
                path = Path(source).resolve()
                if path.suffix.lower() not in EXTENSIONS:
                    continue
                if str(path) in known:
                    continue
                self.tasks.append({"path": str(path), "platform": platform, "attempts": 0,
                                   "retryAt": 0, "automatic": automatic})
                known.add(str(path))
                self.emit("log", f"已加入上传队列：{path.name}")
            self._save()
        self.wakeup.set()

    def _monitor(self):
        while not self.shutdown.wait(3):
            try:
                with self.lock:
                    if not self.monitoring or not self.watcher:
                        continue
                    if not self.watcher.folder.is_dir():
                        self.monitoring = False
                        self.emit("monitor", False)
                        self.emit("log", "录制目录已不可用，请重新选择目录。")
                        continue
                    found = self.watcher.poll()
                    platform = self.platform
                if found:
                    self.enqueue(found, platform, automatic=True)
            except Exception as exc:
                self.emit("log", friendly_error(exc, self.token))

    def _progress(self, phase, name, done, size):
        percent = int(done * 100 / size) if size else 0
        self.emit("progress", (percent, f"{phase} {name} · {percent}%"))

    def _check_pair(self, request):
        code, save = request
        self.emit("status", "正在验证配对…")
        try:
            client = ApiClient(code)
            result = client.device()
            if save:
                self.vault.save(code)
            with self.lock:
                self.client = client
                self.token = code
                self.auth_blocked = False
                for task in self.tasks:
                    task["retryAt"] = 0
            self.emit("status", "已配对：" + str(result.get("name", "我的直播助手"))[:100])
            self.emit("paired", True)
            self.emit("log", "配对成功。回放上传后会进入网站的“待处理”和“直播回放历史”。")
        except Exception as exc:
            self.emit("status", "配对失败，请检查网站生成的配对码。")
            self.emit("log", friendly_error(exc, code))
            # A failed replacement does not accidentally resume an old blocked token.
            if isinstance(exc, ApiError) and exc.auth_failed:
                with self.lock:
                    self.client = None
                    self.auth_blocked = True
                self.emit("paired", False)

    def _uploads(self):
        while not self.shutdown.is_set():
            self.wakeup.wait(2)
            self.wakeup.clear()
            with self.lock:
                pairing = self.pair_request
                self.pair_request = None
            if pairing:
                self._check_pair(pairing)
            with self.lock:
                if not self.client or self.auth_blocked:
                    continue
                task = next((t for t in self.tasks if t.get("retryAt", 0) <= time.time()), None)
                client = self.client
            if task is None:
                continue
            path = Path(task["path"])
            try:
                self.emit("log", f"准备保存：{path.name}")
                sha, signature = hash_file(path, lambda d, s: self._progress("校验", path.name, d, s), self.shutdown.is_set)
                with self.lock:
                    already_saved = sha in self.completed
                if not already_saved:
                    if file_signature(path) != signature:
                        raise UploadChanged("录制文件仍在变化。")
                    def saved_id(upload_id):
                        with self.lock:
                            task["id"] = upload_id
                            task["sha256"] = sha
                            self._save()
                    client.upload(path, task["platform"], sha,
                                  lambda d, s: self._progress("上传", path.name, d, s),
                                  self.shutdown.is_set, saved_id)
                with self.lock:
                    self.completed.add(sha)
                    self.tasks.remove(task)
                    self._save()
                self.emit("log", f"已保存到网站：{path.name}；可在待处理和直播回放历史查看。")
                self.emit("progress", (100, "已保存：" + path.name))
                self.wakeup.set()
            except Cancelled:
                break
            except Exception as exc:
                if isinstance(exc, ApiError) and exc.auth_failed:
                    with self.lock:
                        self.auth_blocked = True
                        self.client = None
                        self.monitoring = False
                    self.emit("monitor", False)
                    self.emit("paired", False)
                    self.emit("status", "配对已失效，请在网站生成新的配对码。")
                    self.emit("log", "网站拒绝了配对凭据，已停止自动重试。请重新配对。")
                else:
                    with self.lock:
                        task["attempts"] = task.get("attempts", 0) + 1
                        delay = min(900, 15 * 2 ** min(task["attempts"] - 1, 6))
                        task["retryAt"] = time.time() + delay
                        self._save()
                    self.emit("log", f"{path.name}：{friendly_error(exc, self.token)}（{delay} 秒后自动重试）")


class Application(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("灵感库 · 直播回放助手")
        self.geometry("820x710")
        self.minsize(720, 600)
        self.events = queue.Queue()
        self._closed = False
        self.configure(bg="#f5f7fb")
        self.platform = tk.StringVar(value="douyin")
        self.recording_folder = tk.StringVar()
        self.code = tk.StringVar()
        self.status = tk.StringVar(value="请在网站的直播功能中生成配对码")
        self.progress_label = tk.StringVar(value="等待回放文件")
        self.monitor_state = tk.StringVar(value="未监测")
        self._build()
        data_folder = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "LinganLive"
        self.engine = Engine(lambda *event: self.events.put(event), data_folder)
        self.recording_folder.set(self.engine.monitored_folder)
        self.platform.set(self.engine.platform)
        self.after(150, self._events)
        self.protocol("WM_DELETE_WINDOW", self._close)

    def _build(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TFrame", background="#f5f7fb")
        style.configure("TLabel", background="#f5f7fb", font=("Microsoft YaHei UI", 10))
        style.configure("TButton", font=("Microsoft YaHei UI", 10), padding=(12, 7))
        outer = ttk.Frame(self, padding=24)
        outer.pack(fill="both", expand=True)
        ttk.Label(outer, text="直播结束，回放自动归档", font=("Microsoft YaHei UI", 20, "bold")).pack(anchor="w")
        ttk.Label(outer, text="使用抖音直播伴侣或 OBS 直播并开启本地录制；助手将回放保存到灵感库。", wraplength=740).pack(anchor="w", pady=(8, 16))
        tools = ttk.Frame(outer)
        tools.pack(fill="x", pady=(0, 12))
        ttk.Label(tools, text="直播平台").pack(side="left", padx=(0, 10))
        ttk.Combobox(tools, textvariable=self.platform, values=PLATFORMS, width=13, state="readonly").pack(side="left")
        ttk.Button(tools, text="打开抖音直播伴侣", command=lambda: webbrowser.open("https://streamingtool.douyin.com/")).pack(side="left", padx=10)
        ttk.Button(tools, text="打开 OBS 官网", command=lambda: webbrowser.open("https://obsproject.com/download")).pack(side="left")
        pairing = ttk.LabelFrame(outer, text="1 · 与我的灵感库配对", padding=12)
        pairing.pack(fill="x", pady=6)
        ttk.Label(pairing, text="在网站生成设备配对码后，粘贴到此处。凭据仅通过 Windows 加密保存在本机。", wraplength=720).pack(anchor="w")
        row = ttk.Frame(pairing)
        row.pack(fill="x", pady=(10, 0))
        ttk.Entry(row, textvariable=self.code, show="•").pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="配对并保存", command=self._pair).pack(side="left", padx=(10, 0))
        ttk.Label(pairing, textvariable=self.status, wraplength=720).pack(anchor="w", pady=(8, 0))
        folder = ttk.LabelFrame(outer, text="2 · 选择直播软件的本地录制目录", padding=12)
        folder.pack(fill="x", pady=6)
        row = ttk.Frame(folder)
        row.pack(fill="x")
        ttk.Entry(row, textvariable=self.recording_folder).pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="选择目录", command=self._folder).pack(side="left", padx=(10, 0))
        ttk.Label(folder, text="仅监测所选目录中的新 MP4 / WebM / MKV；文件稳定 60 秒且已关闭后上传。单文件最大 8 GiB。", wraplength=720).pack(anchor="w", pady=(8, 0))
        actions = ttk.Frame(outer)
        actions.pack(fill="x", pady=12)
        ttk.Button(actions, text="启动监测", command=self._start).pack(side="left")
        ttk.Button(actions, text="停止监测", command=self._stop).pack(side="left", padx=8)
        ttk.Button(actions, text="手动上传历史文件", command=self._manual).pack(side="left")
        ttk.Label(actions, textvariable=self.monitor_state).pack(side="right")
        ttk.Label(outer, textvariable=self.progress_label, wraplength=720).pack(anchor="w")
        self.progress = ttk.Progressbar(outer, maximum=100)
        self.progress.pack(fill="x", pady=(6, 10))
        self.log = tk.Text(outer, height=7, state="disabled", wrap="word", font=("Microsoft YaHei UI", 9), bg="white", relief="flat")
        self.log.pack(fill="both", expand=True)
        footer = ttk.Frame(outer)
        footer.pack(fill="x", pady=(10, 0))
        ttk.Label(footer, text="原始录像保留在本机。上传失败会自动重试；关闭助手会暂停队列。", wraplength=540).pack(side="left")
        ttk.Button(footer, text="打开我的灵感库", command=lambda: webbrowser.open(ORIGIN + "/?view=live")).pack(side="right")

    def _try(self, action):
        try:
            action()
        except Exception as exc:
            messagebox.showerror("灵感库直播助手", friendly_error(exc, self.code.get()))

    def _pair(self):
        self._try(lambda: self.engine.pair(self.code.get().strip()))
        self.code.set("")

    def _folder(self):
        folder = filedialog.askdirectory(title="选择直播软件保存录像的目录")
        if folder:
            self.recording_folder.set(folder)

    def _start(self):
        self._try(lambda: self.engine.start_watch(self.recording_folder.get(), self.platform.get()))

    def _stop(self):
        self.engine.stop_watch()

    def _manual(self):
        if not self.engine.client:
            messagebox.showinfo("请先配对", "请先完成网站配对，然后选择历史回放文件。")
            return
        paths = filedialog.askopenfilenames(title="选择历史回放", filetypes=[("回放文件", "*.mp4 *.webm *.mkv")])
        if paths:
            self.engine.enqueue(paths, self.platform.get())

    def _events(self):
        if self._closed:
            return
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == "log":
                    self.log.configure(state="normal")
                    self.log.insert("end", time.strftime("%H:%M:%S") + "  " + value + "\n")
                    if int(self.log.index("end-1c").split(".")[0]) > 400:
                        self.log.delete("1.0", "101.0")
                    self.log.see("end")
                    self.log.configure(state="disabled")
                elif kind == "status":
                    self.status.set(value)
                elif kind == "progress":
                    self.progress["value"] = value[0]
                    self.progress_label.set(value[1])
                elif kind == "monitor":
                    self.monitor_state.set("监测中" if value else "未监测")
        except queue.Empty:
            pass
        self.after(150, self._events)

    def _close(self):
        self._closed = True
        self.engine.shutdown.set()
        self.engine.wakeup.set()
        self.engine._save()
        self.destroy()


if __name__ == "__main__":
    Application().mainloop()
