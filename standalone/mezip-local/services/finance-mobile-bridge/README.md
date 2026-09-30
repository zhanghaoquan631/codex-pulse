# 财务手机桥与本机 OCR

从 workspace 根目录运行：

```powershell
node services/finance-mobile-bridge/src/finance-mobile-bridge.mjs
```

当前 OCR 代码针对 Windows，在本服务目录执行：

```powershell
python -m venv runtime/ocr-venv
./runtime/ocr-venv/Scripts/python.exe -m pip install -r requirements.txt
```

`src/local-ocr.mjs` 调用该 Python 与 `src/rapidocr-runner.py`。运行环境和识别数据不应提交。未安装 OCR 时会返回错误，可先手工核对票据；本次源码发布未代替新设备上的 OCR 安装验证。
