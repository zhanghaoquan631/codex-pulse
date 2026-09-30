# Attribution and source

QDuo Windows is an independent Windows implementation inspired by XueshiQiao/qduo:
https://github.com/XueshiQiao/qduo

Reference source reviewed: 14814b574538075651203be05db9a295dfcdb97a.
The original project is a macOS selection text tool. This Windows edition adds an authenticated local diagnostics bridge, recoverable cache cleanup, Windows Defender controls, a local file provenance catalog, and a browser module. It is not an official upstream release.

The Windows source and the QDuo browser module in this package are distributed under GNU GPL version 3 or later. The full license is in LICENSE. The source ZIP includes all C# sources, the fixed OCR and Defender helpers, the build script, and browser modules. The executable uses Windows system libraries and does not bundle the upstream macOS application.
