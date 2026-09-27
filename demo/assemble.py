"""Assemble the static GitHub Pages demo: the unchanged chat app plus the in-browser knowledge base.

    python demo/assemble.py [out_dir]        (default: _site)

Uses only the standard library, so the GitHub Actions workflow needs nothing installed. The knowledge
snapshot (demo/kb/) comes from `python cli.py export-demo`.
"""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
DEMO = ROOT / "demo"
# Staff-only pages are not part of the demo.
EXCLUDE = {"index.html", "admin.html", "admin-login.html", "sw.js", "manifest.webmanifest",
           "css/admin.css", "js/admin.js", "js/admin-login.js"}
APP_SCRIPT = '<script src="static/js/render.js"></script>'


def assemble(out: Path) -> None:
    kb = DEMO / "kb" / "kb.json"
    if not kb.exists():
        sys.exit("demo/kb/kb.json is missing - run `python cli.py export-demo` first")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    for path in STATIC.rglob("*"):
        rel = path.relative_to(STATIC).as_posix()
        if path.is_file() and rel not in EXCLUDE:
            target = out / "static" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    shutil.copy2(STATIC / "sw.js", out / "sw.js")
    shutil.copy2(STATIC / "manifest.webmanifest", out / "manifest.webmanifest")

    index = (STATIC / "index.html").read_text(encoding="utf-8")
    if APP_SCRIPT not in index:
        sys.exit(f"static/index.html no longer contains {APP_SCRIPT!r}; update demo/assemble.py")
    # The demo adapter must run before app.js so it can answer the app's /api calls in the browser.
    index = index.replace(APP_SCRIPT, f'<script src="demo/demo-api.js"></script>\n{APP_SCRIPT}', 1)
    (out / "index.html").write_text(index, encoding="utf-8")

    (out / "demo").mkdir()
    for name in ("engine.js", "demo-api.js"):
        shutil.copy2(DEMO / name, out / "demo" / name)
    shutil.copytree(DEMO / "kb", out / "demo" / "kb")
    (out / ".nojekyll").write_text("", encoding="utf-8")

    files = sum(1 for p in out.rglob("*") if p.is_file())
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"Assembled demo site in {out} ({files} files, {size / 1_048_576:.1f} MB)")


if __name__ == "__main__":
    assemble(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "_site")
