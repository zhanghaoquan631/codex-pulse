# OBS 官方依据

本包在 2026-09-30 参照 OBS Studio 32.2.2 官方源码创建；没有捆绑或修改 OBS 程序。

- 场景集合保存/载入、全局音频根键、legacy 绝对坐标：https://github.com/obsproject/obs-studio/blob/32.2.2/frontend/widgets/OBSBasic_SceneCollections.cpp
- 场景 items 的 pos / scale / bounds / bounds_type / bounds_crop、平铺 crop 字段、custom_size / cx / cy：https://github.com/obsproject/obs-studio/blob/32.2.2/libobs/obs-scene.c
- bounds_type 枚举（2 等比内适配、3 等比外填充）：https://github.com/obsproject/obs-studio/blob/32.2.2/libobs/obs.h
- source 对象 id / versioned_id / uuid / volume / muted / mixers：https://github.com/obsproject/obs-studio/blob/32.2.2/libobs/obs.c
- Windows 摄像头 dshow_input 与 video_device_id：https://github.com/obsproject/obs-studio/blob/32.2.2/plugins/win-dshow/win-dshow.cpp
- Windows 显示器 monitor_capture 与 monitor_id='DUMMY'：https://github.com/obsproject/obs-studio/blob/32.2.2/plugins/win-capture/duplicator-monitor-capture.c
- Windows 系统声与麦克风 wasapi_output_capture / wasapi_input_capture，device_id='default'：https://github.com/obsproject/obs-studio/blob/32.2.2/plugins/win-wasapi/win-wasapi.cpp
- 颜色来源 color_source_v3：https://github.com/obsproject/obs-studio/blob/32.2.2/plugins/image-source/color-source.c
- 配置文件导入要求所选目录包含 basic.ini，目录名必须唯一：https://github.com/obsproject/obs-studio/blob/32.2.2/frontend/widgets/OBSBasic_Profiles.cpp
- Video BaseCX/BaseCY/OutputCX/OutputCY、SimpleOutput 参数及默认录制路径：https://github.com/obsproject/obs-studio/blob/32.2.2/frontend/widgets/OBSBasic.cpp
- Video.AutoRemux、录制停止后自动将 MKV 重封装为同名 MP4：https://github.com/obsproject/obs-studio/blob/32.2.2/frontend/widgets/OBSBasic_Recording.cpp
- 单窗口采集 Windows 来源 window_capture：https://github.com/obsproject/obs-studio/blob/32.2.2/plugins/win-capture/window-capture.c

使用说明： https://obsproject.com/kb/quick-start-guide
虚拟摄像机说明： https://obsproject.com/kb/virtual-camera-guide
下载： https://obsproject.com/download

JSON 的 version=1 使用 legacy 绝对坐标；不加入根 resolution 以免导入时按另一画布进行旧版坐标迁移。每个 scene 的 custom_size 固定内部布局，实际录制/推流方向仍由对应 basic.ini 的 Video 字段决定。

验证范围为静态结构、引用、尺寸、音频路由与包内容；未启动 OBS、摄像头、麦克风或直播账号。
