"""Verify and reference an existing CosyVoice3 package; never downloads or copies weights."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from packages.contracts.validation import load_config

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / "workers/tts/assets.lock.json").read_text(encoding="utf-8"))


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def git(directory, *args):
    return subprocess.check_output(["git", "-C", str(directory), *args], text=True,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).strip()


def verify(directory):
    directory = Path(directory).resolve()
    source = directory / "source"
    if git(source, "rev-parse", "HEAD") != LOCK["engine"]["revision"]:
        raise ValueError("Engine revision mismatch")
    if git(source, "diff", "HEAD", "--name-only"):
        raise ValueError("Engine has tracked modifications")
    if git(source / "third_party/Matcha-TTS", "rev-parse", "HEAD") != LOCK["engine"]["matchaRevision"]:
        raise ValueError("Matcha revision mismatch")
    python = directory / "venv/Scripts/python.exe"
    if not python.is_file():
        raise ValueError("Package interpreter missing")
    files = []
    for item in LOCK["model"]["files"]:
        file = directory / "model" / item["name"]
        if file.stat().st_size != item["bytes"] or digest(file) != item["sha256"]:
            raise ValueError("Model hash mismatch: " + item["name"])
        files.append({"name": item["name"], "bytes": item["bytes"], "mtimeNs": str(file.stat().st_mtime_ns)})
    if digest(source / LOCK["reference"]["file"]) != LOCK["reference"]["sha256"]:
        raise ValueError("Official reference hash mismatch")
    return {"schemaVersion": 1, "root": str(directory), "engineRevision": LOCK["engine"]["revision"],
            "modelRevision": LOCK["model"]["revision"], "verified": True, "files": files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--config", type=Path, default=ROOT / "configs/v2.local.json")
    args = parser.parse_args()
    report = verify(args.root)
    config = load_config(args.config if args.config.exists() else ROOT / "configs/v2.example.json")
    # Preserve resource path semantics if the caller selects a different config directory.
    if not args.config.exists() and args.config.resolve().parent != ROOT / "configs":
        config["resources"]["legacyRoot"] = str(ROOT)
    config["resources"]["cosyvoiceRoot"] = str(args.root.resolve())
    config["runtime"]["ttsPython"] = str(args.root.resolve() / "venv/Scripts/python.exe")
    args.config.parent.mkdir(parents=True, exist_ok=True)
    receipt = args.config.with_suffix(".cosyvoice-verified.json")
    for file, value in ((receipt, report), (args.config, config)):
        temporary = file.with_suffix(file.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(file)
    print(json.dumps({"verified": True, "modelBytes": sum(item["bytes"] for item in LOCK["model"]["files"]),
                      "copiedModelBytes": 0, "config": str(args.config.resolve())}))


if __name__ == "__main__":
    main()
