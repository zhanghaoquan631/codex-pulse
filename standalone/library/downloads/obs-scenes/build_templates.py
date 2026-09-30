from __future__ import annotations

import configparser
import hashlib
import json
from pathlib import Path
import uuid
import zipfile


ROOT = Path(__file__).resolve().parent
PACKAGE = ROOT / "templates"
DIST = ROOT
OBS_TAG = "32.2.2"
UUID_NAMESPACE = uuid.UUID("ba68e609-2a59-491f-a620-5c856029f75b")

PRESETS = [
    {
        "id": "01-camera-full",
        "archive": "presenter.zip",
        "name": "01 横屏人物主讲",
        "profile": "Lingan-01-Camera-Profile",
        "size": (1920, 1080),
        "description": "人物占满横屏画面，适合口播、讲课、访谈。",
        "screen": None,
        "camera": (0, 0, 1920, 1080),
    },
    {
        "id": "02-screen-camera",
        "archive": "screen-inset.zip",
        "name": "02 横屏屏幕讲解",
        "profile": "Lingan-02-Screen-Profile",
        "size": (1920, 1080),
        "description": "电脑内容铺满横屏，人物小窗放在左下角，适合网页演示、资料讲解。",
        "screen": (0, 0, 1920, 1080),
        "camera": (28, 772, 380, 280),
    },
    {
        "id": "03-portrait-split",
        "archive": "portrait.zip",
        "name": "03 竖屏屏幕加人物",
        "profile": "Lingan-03-Portrait-Profile",
        "size": (1080, 1920),
        "description": "9:16 竖屏：顶部留黑底，电脑画面在上，人物在下，适合抖音等手机端直播。",
        "screen": (0, 240, 1080, 608),
        "camera": (0, 848, 1080, 1072),
    },
]


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def write_json(path: Path, data: object) -> None:
    write_text(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def source(preset_id: str, name: str, source_id: str, settings: dict,
           *, volume: float = 1.0, muted: bool = False, mixers: int = 0,
           versioned_id: str | None = None) -> dict:
    return {
        "name": name,
        "uuid": str(uuid.uuid5(UUID_NAMESPACE, preset_id + "/" + name)),
        "id": source_id,
        "versioned_id": versioned_id or source_id,
        "settings": settings,
        "mixers": mixers,
        "volume": volume,
        "balance": 0.5,
        "sync": 0,
        "enabled": True,
        "muted": muted,
        "monitoring_type": 0,
        "hotkeys": {},
        "filters": [],
        "private_settings": {},
    }


def item(src: dict, item_id: int, rect: tuple[int, int, int, int],
         *, fill: bool = False, locked: bool = False) -> dict:
    x, y, width, height = rect
    return {
        "name": src["name"],
        "source_uuid": src["uuid"],
        "id": item_id,
        "visible": True,
        "locked": locked,
        "pos": {"x": float(x), "y": float(y)},
        "scale": {"x": 1.0, "y": 1.0},
        "rot": 0.0,
        "align": 5,
        "bounds_type": 3 if fill else 2,
        "bounds_align": 0,
        "bounds_crop": fill,
        "bounds": {"x": float(width), "y": float(height)},
        "crop_left": 0,
        "crop_top": 0,
        "crop_right": 0,
        "crop_bottom": 0,
        "scale_filter": "lanczos",
        "blend_method": "default",
        "blend_type": "normal",
        "private_settings": {},
    }


def make_collection(preset: dict) -> dict:
    preset_id = preset["id"]
    width, height = preset["size"]
    sources = []
    items = []
    bg = source(preset_id, "黑色背景", "color_source",
                {"color": 0xFF000000, "width": width, "height": height},
                versioned_id="color_source_v3")
    sources.append(bg)
    items.append(item(bg, 1, (0, 0, width, height), locked=True))

    if preset["screen"] is not None:
        screen = source(preset_id, "电脑屏幕（双击选择显示器）", "monitor_capture",
                        {"monitor_id": "DUMMY", "capture_cursor": True, "method": 0})
        sources.append(screen)
        items.append(item(screen, len(items) + 1, preset["screen"]))

    camera = source(preset_id, "人物摄像头（双击选择设备）", "dshow_input",
                    {"video_device_id": "", "active": True, "res_type": 0,
                     "use_custom_audio_device": False, "audio_device_id": "",
                     "deactivate_when_not_showing": True},
                    muted=True, mixers=0)
    sources.append(camera)
    items.append(item(camera, len(items) + 1, preset["camera"], fill=True))

    if preset_id == "03-portrait-split":
        divider = source(preset_id, "上下分隔线", "color_source",
                         {"color": 0xFF242424, "width": 1080, "height": 4},
                         versioned_id="color_source_v3")
        sources.append(divider)
        items.append(item(divider, len(items) + 1, (0, 846, 1080, 4), locked=True))

    scene_name = "灵感库 · " + preset["name"]
    scene = source(preset_id, scene_name, "scene",
                   {"id_counter": len(items), "custom_size": True,
                    "cx": width, "cy": height, "items": items}, mixers=1)
    sources.append(scene)

    return {
        "version": 1,
        "name": scene_name,
        "current_scene": scene_name,
        "current_program_scene": scene_name,
        "scene_order": [{"name": scene_name}],
        "sources": sources,
        "groups": [],
        "transitions": [],
        "quick_transitions": [],
        "current_transition": "Fade",
        "transition_duration": 300,
        "preview_locked": False,
        "DesktopAudioDevice1": source(
            preset_id, "系统声音（默认播放设备）", "wasapi_output_capture",
            {"device_id": "default", "use_device_timing": True}, volume=0.50, mixers=1),
        "AuxAudioDevice1": source(
            preset_id, "麦克风（默认输入设备）", "wasapi_input_capture",
            {"device_id": "default", "use_device_timing": False}, volume=1.0, mixers=1),
    }


def make_profile(preset: dict) -> str:
    width, height = preset["size"]
    return f"""[General]
Name=灵感库 · {preset['name']}

[Video]
BaseCX={width}
BaseCY={height}
OutputCX={width}
OutputCY={height}
FPSType=0
FPSCommon=30
ScaleType=lanczos
ColorFormat=NV12
ColorSpace=709
ColorRange=Partial
AutoRemux=true

[Audio]
SampleRate=48000
ChannelSetup=Stereo

[Output]
Mode=Simple
FilenameFormatting=%CCYY-%MM-%DD %hh-%mm-%ss

[SimpleOutput]
StreamEncoder=x264
StreamAudioEncoder=aac
VBitrate=6000
ABitrate=160
UseAdvanced=false
Preset=veryfast
RecEncoder=x264
RecAudioEncoder=aac
RecQuality=HQ
RecFormat2=mkv
RecTracks=1
RecRB=false
"""


def preset_readme(preset: dict) -> str:
    width, height = preset["size"]
    screen_step = "7. 双击「电脑屏幕（双击选择显示器）」选择要展示的显示器。首次导入的 DUMMY 是 OBS 官方未选择占位值。\n" if preset["screen"] else ""
    transform_step = 8 if preset["screen"] else 7
    window_help = ""
    if preset["screen"]:
        x, y, frame_w, frame_h = preset["screen"]
        window_help = f"""## 只分享一个窗口

如果只想分享浏览器或一个软件窗口，在「来源」点击「＋ → 窗口采集」（Windows 来源类型 window_capture），选择实际窗口。双击原来的「电脑屏幕」不会把显示器采集自动改成窗口采集，需要新增这个来源。

右键新窗口来源 →「变换 → 编辑变换」，将位置 X/Y 设为 **{x} / {y}**、位置对齐设为左上、旋转设为 0、边界框类型设为「缩放到内部边界」、边界框宽/高设为 **{frame_w} / {frame_h}**、边界框对齐设为居中；这样保持原模板的屏幕区域并完整显示窗口。点击原「电脑屏幕」旁的眼睛隐藏它，人物来源和分隔线保持在窗口采集上方。

"""
    return f"""# {preset['name']}

{preset['description']}

画布与输出：{width} × {height}，30 fps。人物画面按比例填满框，框外居中裁切；屏幕按比例完整放入框。

## 导入顺序

1. 从 https://obsproject.com/download 安装 Windows 版 OBS Studio。建议 OBS 32.0 及以后版本；本包依据官方 32.2.2 源码制作。
2. 解压整个 ZIP。
3. OBS 菜单「配置文件 → 导入配置文件」，选本目录的 **{preset['profile']} 文件夹**（里面是 basic.ini），不要选 JSON，也不要只选 .ini 文件。随后在「配置文件」菜单切换到「灵感库 · {preset['name']}」。
4. OBS 菜单「场景集合 → 导入场景集合」，选择本目录的 **collection.json**，勾选并完成导入后切换到同名场景集合。
5. 「设置 → 视频」确认基础画布和输出分辨率均为 **{width}x{height}**。横竖方向由 OBS 配置文件决定；只导入场景 JSON 不会设置录制输出方向。
6. 在「来源」里双击「人物摄像头（双击选择设备）」选择自己的摄像头。摄像头没有绑定到任何真实设备；首次导入黑屏是待选择状态。
{screen_step}{transform_step}. 如需改人物位置，右键人物来源 →「变换 → 编辑变换」；人物已设置等比外填充与边框裁切，可调整裁切或框内对齐。

{window_help}## 声音和本地回放

- 「音频混音器」里的系统声音、麦克风各有独立音量和静音按钮。两路默认启用，采集 Windows 默认播放设备与默认输入设备；系统声音初始为约 -6 dB，麦克风为 0 dB，可按自己的设备调整。
- 如默认设备不对，到「设置 → 音频」为桌面音频与麦克风/Aux 选择实际设备。戴耳机可减少扬声器声音再次进入麦克风产生回声。
- 摄像头的音频在模板中静音，且不送到录制音轨；使用单独的麦克风输入，避免同一声音收录两次。
- 「设置 → 输出」选择录制路径，再把灵感库直播助手的录制文件夹设为同一路径。模板使用 MKV、高质量录制、音轨 1，并开启录制结束后自动重封装为 MP4；系统声音与麦克风混合到这一轨。路径未写死，请务必在自己电脑上选择文件夹。
- 在 OBS 点「开始录制」，直播结束点「停止录制」，等待自动重封装结束。OBS 会在同一文件夹保留原 MKV 并生成同名 MP4；无需手工转换。助手按现有自动上传流程优先使用同名 MP4，把文件加入网站「待处理」与「我的直播回放历史」，可在网页播放。首次建议先录 10 秒，播放检查画面、两路声音和上传结果。

## 在平台直播

平台支持 OBS 推流时，在「设置 → 直播」按平台给出的服务器和推流密钥填写。本模板未保存账号、服务器或推流密钥。

使用抖音直播伴侣等平台软件时，可以在 OBS 点击「启动虚拟摄像机」，在平台软件的摄像头来源里选择 OBS Virtual Camera，并在平台软件里单独选择麦克风/系统音频。OBS 虚拟摄像机只传视频；平台是否提供该入口、是否允许 OBS 推流，按当前平台与账号权限操作。同时仍需在 OBS 点击「开始录制」，才能得到本地回放文件。

模板只排人物和屏幕布局。抖音观众端看到的评论、点赞、昵称等由平台叠加，通常不会自动写入 OBS 本地回放；若需要在回放中保留，应在开播前额外配置平台支持的评论来源或采集对应窗口。

说明：已按官方源码检查文件结构、来源类型、画布和几何尺寸；尚未在你的实际摄像头、显示器或直播账号上进行采集测试。
"""


def source_references() -> str:
    base = f"https://github.com/obsproject/obs-studio/blob/{OBS_TAG}/"
    return f"""# OBS 官方依据

本包在 2026-09-30 参照 OBS Studio {OBS_TAG} 官方源码创建；没有捆绑或修改 OBS 程序。

- 场景集合保存/载入、全局音频根键、legacy 绝对坐标：{base}frontend/widgets/OBSBasic_SceneCollections.cpp
- 场景 items 的 pos / scale / bounds / bounds_type / bounds_crop、平铺 crop 字段、custom_size / cx / cy：{base}libobs/obs-scene.c
- bounds_type 枚举（2 等比内适配、3 等比外填充）：{base}libobs/obs.h
- source 对象 id / versioned_id / uuid / volume / muted / mixers：{base}libobs/obs.c
- Windows 摄像头 dshow_input 与 video_device_id：{base}plugins/win-dshow/win-dshow.cpp
- Windows 显示器 monitor_capture 与 monitor_id='DUMMY'：{base}plugins/win-capture/duplicator-monitor-capture.c
- Windows 系统声与麦克风 wasapi_output_capture / wasapi_input_capture，device_id='default'：{base}plugins/win-wasapi/win-wasapi.cpp
- 颜色来源 color_source_v3：{base}plugins/image-source/color-source.c
- 配置文件导入要求所选目录包含 basic.ini，目录名必须唯一：{base}frontend/widgets/OBSBasic_Profiles.cpp
- Video BaseCX/BaseCY/OutputCX/OutputCY、SimpleOutput 参数及默认录制路径：{base}frontend/widgets/OBSBasic.cpp
- Video.AutoRemux、录制停止后自动将 MKV 重封装为同名 MP4：{base}frontend/widgets/OBSBasic_Recording.cpp
- 单窗口采集 Windows 来源 window_capture：{base}plugins/win-capture/window-capture.c

使用说明： https://obsproject.com/kb/quick-start-guide
虚拟摄像机说明： https://obsproject.com/kb/virtual-camera-guide
下载： https://obsproject.com/download

JSON 的 version=1 使用 legacy 绝对坐标；不加入根 resolution 以免导入时按另一画布进行旧版坐标迁移。每个 scene 的 custom_size 固定内部布局，实际录制/推流方向仍由对应 basic.ini 的 Video 字段决定。

验证范围为静态结构、引用、尺寸、音频路由与包内容；未启动 OBS、摄像头、麦克风或直播账号。
"""


def validate(preset: dict, collection_path: Path, profile_path: Path) -> dict:
    data = json.loads(collection_path.read_text(encoding="utf-8"))
    assert isinstance(data["name"], str) and data["name"]
    assert isinstance(data["sources"], list) and data["sources"]
    assert data["version"] == 1 and "resolution" not in data
    assert data["current_scene"] == data["current_program_scene"]
    assert data["scene_order"] == [{"name": data["current_scene"]}]
    by_uuid = {s["uuid"]: s for s in data["sources"]}
    by_name = {s["name"]: s for s in data["sources"]}
    assert len(by_uuid) == len(data["sources"]) == len(by_name)
    for src in data["sources"]:
        assert src["id"] in ("scene", "monitor_capture", "dshow_input", "color_source")
        assert isinstance(src["settings"], dict)
        assert str(uuid.UUID(src["uuid"])) == src["uuid"]
        assert type(src["enabled"]) is bool and type(src["muted"]) is bool
    scene = by_name[data["current_scene"]]
    width, height = preset["size"]
    assert scene["id"] == "scene"
    assert scene["settings"]["custom_size"] is True
    assert (scene["settings"]["cx"], scene["settings"]["cy"]) == (width, height)
    items = scene["settings"]["items"]
    assert len({v["id"] for v in items}) == len(items) == scene["settings"]["id_counter"]
    rects = {}
    for value in items:
        src = by_uuid[value["source_uuid"]]
        assert src["name"] == value["name"]
        assert value["align"] == 5 and value["bounds_align"] == 0
        assert value["bounds_type"] in (2, 3)
        assert value["bounds_crop"] == (value["bounds_type"] == 3)
        assert value["scale"] == {"x": 1.0, "y": 1.0} and value["rot"] == 0
        assert all(value["crop_" + side] == 0 for side in ("left", "top", "right", "bottom"))
        x, y = value["pos"]["x"], value["pos"]["y"]
        w, h = value["bounds"]["x"], value["bounds"]["y"]
        assert x >= 0 and y >= 0 and w > 0 and h > 0
        assert x + w <= width and y + h <= height
        if src["id"] in ("dshow_input", "monitor_capture"):
            rects[src["id"]] = [int(x), int(y), int(w), int(h)]
        if src["id"] == "dshow_input":
            assert src["settings"]["video_device_id"] == "" and src["muted"] is True
            assert src["mixers"] == 0 and value["bounds_type"] == 3
        elif src["id"] == "monitor_capture":
            assert src["settings"]["monitor_id"] == "DUMMY" and "monitor" not in src["settings"]
            assert value["bounds_type"] == 2
        elif src["id"] == "color_source":
            assert src["versioned_id"] == "color_source_v3"
    assert rects["dshow_input"] == list(preset["camera"])
    if preset["screen"]:
        assert rects["monitor_capture"] == list(preset["screen"])
    else:
        assert "monitor_capture" not in rects

    audio = {}
    for key, source_id, volume in (("DesktopAudioDevice1", "wasapi_output_capture", 0.5),
                                    ("AuxAudioDevice1", "wasapi_input_capture", 1.0)):
        src = data[key]
        assert src["id"] == source_id and src["settings"]["device_id"] == "default"
        assert src["enabled"] is True and src["muted"] is False
        assert src["mixers"] == 1 and src["volume"] == volume and src["monitoring_type"] == 0
        assert src["settings"]["use_device_timing"] == (source_id == "wasapi_output_capture")
        assert src["name"] not in by_name and src["uuid"] not in by_uuid
        audio[key] = {"id": src["id"], "device_id": "default", "volume": src["volume"],
                      "muted": src["muted"], "mixers": src["mixers"], "monitoring_type": 0}

    config = configparser.ConfigParser(interpolation=None)
    config.read(profile_path, encoding="utf-8")
    assert [config.getint("Video", x) for x in ("BaseCX", "BaseCY", "OutputCX", "OutputCY")] == [width, height, width, height]
    assert config.get("Output", "Mode") == "Simple"
    assert config.get("SimpleOutput", "RecFormat2") == "mkv"
    assert config.getboolean("Video", "AutoRemux") is True
    assert config.getint("SimpleOutput", "RecTracks") == 1
    assert not config.has_option("SimpleOutput", "FilePath")
    for name in ("service.json", "streamEncoder.json", "recordEncoder.json"):
        assert not (profile_path.parent / name).exists()
    return {"preset": preset["id"], "result": "passed",
            "canvas": [width, height], "rectangles": rects, "audio": audio,
            "runtime_import_tested": False, "capture_tested": False}


def zip_files(dest: Path, folder: Path, prefix: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                archive.write(path, prefix + "/" + path.relative_to(folder).as_posix())
    with zipfile.ZipFile(dest) as archive:
        assert archive.testzip() is None
        assert all(not Path(name).is_absolute() and ".." not in Path(name).parts for name in archive.namelist())


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    reports = []
    refs = source_references()
    write_text(PACKAGE / "OBS官方依据.md", refs)
    write_text(PACKAGE / "README-使用说明.md", """# 灵感库 · 三种直播画面模板

这三种模板对应人物主讲、电脑讲解加人物小窗、竖屏电脑加人物。每种都带 OBS 场景集合与配置文件，解压后按各目录的中文说明分别导入。

| 目录 | 画面 | 输出方向 |
| --- | --- | --- |
| 01-camera-full | 人物全屏 | 1920×1080 横屏 |
| 02-screen-camera | 电脑全屏 + 左下人物小窗 | 1920×1080 横屏 |
| 03-portrait-split | 顶部黑底 + 上方电脑 + 下方人物 | 1080×1920 竖屏 |

先导入并切换对应的配置文件，再导入并切换对应的场景集合。横竖方向由配置文件的 Video 字段设定；仅切换场景集合不会切换录制输出方向。

摄像头与显示器需要手动选择。音频使用 Windows 默认设备，系统声音与麦克风可独立调节或静音；摄像头音频不参与录制。首次开播前先录 10 秒，确认自己的画面和声音。

录制文件夹与灵感库直播助手保持一致。模板使用 MKV 录制并开启停止录制后自动重封装成同名 MP4；等待封装完成后，助手优先上传 MP4，进入网站待处理与回放历史并可在网页播放。OBS 会保留原 MKV。OBS 虚拟摄像机只向平台软件传视频，平台软件还需单独设置声音，OBS 也需单独点击开始录制。

如果只分享一个窗口，02 与 03 的说明提供「窗口采集」替换显示器采集的步骤与位置/边界框尺寸，人物位置保持原布局。

模板不含推流账号、推流密钥、真实设备 ID 或观众端平台叠层；按自己的平台权限配置直播入口。详细步骤和官方依据在各预设目录内。

文件结构与尺寸已按官方 OBS 32.2.2 源码静态验证；尚未在用户真实硬件上采集测试。
""")
    for preset in PRESETS:
        folder = PACKAGE / preset["id"]
        collection_path = folder / "collection.json"
        profile_path = folder / preset["profile"] / "basic.ini"
        write_json(collection_path, make_collection(preset))
        write_text(profile_path, make_profile(preset))
        write_text(folder / "README-使用说明.md", preset_readme(preset))
        write_text(folder / "OBS官方依据.md", refs)
        reports.append(validate(preset, collection_path, profile_path))
        zip_files(DIST / preset["archive"], folder, preset["id"])
    assert len({p["profile"] for p in PRESETS}) == len(PRESETS)
    zip_files(DIST / "all.zip", PACKAGE, "Lingan-OBS-Templates")
    manifest = {
        "version": "1.0.0",
        "official_obs_source_tag": OBS_TAG,
        "validation": {"type": "official-source-based static and semantic checks",
                       "runtime_import_tested": False, "capture_tested": False,
                       "presets": reports},
        "artifacts": [
            {"file": path.name, "bytes": path.stat().st_size,
             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in sorted(DIST.glob("*.zip"))
        ],
    }
    write_json(ROOT / "validation-report.json", manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
