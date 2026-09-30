"""Build the reviewable ZIP without running the GUI or including private files."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
EXE = ROOT / "dist" / "LinganLive.exe"
ZIP = ROOT / "dist" / "LinganLive-Windows.zip"
if not EXE.exists():
    raise SystemExit("Build LinganLive.exe first.")
with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(EXE, "LinganLive.exe")
    archive.write(ROOT / "使用说明.txt", "使用说明.txt")
    for path in sorted((ROOT / "obs-scenes" / "templates").rglob("*")):
        if path.is_file():
            archive.write(path, "OBS场景/" + path.relative_to(ROOT / "obs-scenes" / "templates").as_posix())
    archive.write(ROOT / "obs-scenes" / "使用说明.txt", "OBS场景/使用说明.txt")
with zipfile.ZipFile(ZIP) as archive:
    assert archive.namelist()[:2] == ["LinganLive.exe", "使用说明.txt"]
    assert len([x for x in archive.namelist() if x.endswith("basic.ini")]) == 3
    assert len([x for x in archive.namelist() if x.endswith(".json")]) == 3
    assert archive.testzip() is None
manifest = {"version": "1.1", "files": []}
for path in (EXE, ZIP):
    manifest["files"].append({"name": path.name, "size": path.stat().st_size,
                              "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(ROOT / "dist" / "release-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps(manifest, indent=2))
