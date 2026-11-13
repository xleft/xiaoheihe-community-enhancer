"""Build a deterministic install ZIP from an explicit allowlist (Python 3)."""

from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"xiaoheihe-community-enhancer-{version}.zip"
    files = {
        "manifest.json": ROOT / "manifest.json",
        "LICENSE": ROOT / "LICENSE",
        "README.md": ROOT / "docs" / "INSTALL.md",
        "CHANGELOG.md": ROOT / "CHANGELOG.md",
    }
    for folder, suffixes in {
        "src": {".js"},
        "popup": {".html", ".css", ".js"},
        "icons": {".svg", ".png"},
    }.items():
        for file in sorted((ROOT / folder).iterdir()):
            if file.is_file() and file.suffix in suffixes:
                files[file.relative_to(ROOT).as_posix()] = file
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for name, file in sorted(files.items()):
            entry = zipfile.ZipInfo(name, date_time=(2026, 11, 13, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, file.read_bytes())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"{archive.name}: {len(files)} files, {archive.stat().st_size} bytes")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
