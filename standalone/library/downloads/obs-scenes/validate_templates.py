"""Validate on-disk OBS templates without launching OBS or accessing devices.

Usage: python validate_templates.py [package-directory] [zip-directory]
Defaults to sibling templates and ZIPs in this directory.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import zipfile

from build_templates import DIST, PACKAGE, PRESETS, validate


def main() -> None:
    package = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else PACKAGE
    dist = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DIST
    results = []
    for preset in PRESETS:
        folder = package / preset["id"]
        results.append(validate(preset, folder / "collection.json",
                                folder / preset["profile"] / "basic.ini"))
        assert (folder / "README-使用说明.md").is_file()
        with zipfile.ZipFile(dist / preset["archive"]) as archive:
            assert archive.testzip() is None
            for path in folder.rglob("*"):
                if path.is_file():
                    entry = preset["id"] + "/" + path.relative_to(folder).as_posix()
                    assert archive.read(entry) == path.read_bytes(), entry
    with zipfile.ZipFile(dist / "all.zip") as archive:
        assert archive.testzip() is None
        for path in package.rglob("*"):
            if path.is_file():
                entry = "Lingan-OBS-Templates/" + path.relative_to(package).as_posix()
                assert archive.read(entry) == path.read_bytes(), entry
    print(json.dumps({
        "result": "passed",
        "runtime_import_tested": False,
        "capture_tested": False,
        "presets": results,
        "artifacts": [{"file": name, "sha256": hashlib.sha256((dist / name).read_bytes()).hexdigest()}
                      for name in ["all.zip"] + [p["archive"] for p in PRESETS]],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
