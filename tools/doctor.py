"""Read-only preflight: no model imports, downloads, API calls or device capture."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

from packages.contracts.validation import (
    CONTRACT_ROOT, ContractError, load_config, parse_json, resource_path, validate,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def probe_version(executable, *, python=False):
    """Return only parsed versions; never expose subprocess output in diagnostics."""
    try:
        result = subprocess.run(
            [str(executable), "--version"], stdin=subprocess.DEVNULL,
            capture_output=True, timeout=5, check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        output = (result.stdout + result.stderr).decode("utf-8", errors="replace")
        pattern = r"Python (\d+)\.(\d+)\.(\d+)" if python else r"v(\d+)\.(\d+)\.(\d+)"
        match = re.fullmatch(pattern, output.strip())
        return tuple(map(int, match.groups())) if result.returncode == 0 and match else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def inspect_inventory(root, inventory):
    validate(inventory, "resources")
    ids = set()
    result = []
    for bundle in inventory["bundles"]:
        if bundle["id"] in ids or len(set(bundle["files"])) != len(bundle["files"]):
            raise ContractError("Duplicate inventory entry")
        ids.add(bundle["id"])
        missing = []
        for relative in bundle["files"]:
            candidate = resource_path(root, relative)
            try:
                present = candidate.is_file() and candidate.stat().st_size > 0
            except OSError:
                present = False
            if not present:
                missing.append(relative)
        result.append({"id": bundle["id"], "status": "missing" if missing else "present",
                       "missing": missing, "integrityVerified": False})
    return result


def inspect_avatar(root, relative):
    """Check actual referenced assets; do not assume a particular texture count."""
    model_path = resource_path(root, relative)
    if model_path.stat().st_size > 1024 * 1024:
        raise ContractError("Avatar definition is too large")
    value = parse_json(model_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("Version") != 3:
        raise ContractError("Invalid avatar definition")
    references = value.get("FileReferences")
    if not isinstance(references, dict):
        raise ContractError("Missing avatar references")
    moc, textures = references.get("Moc"), references.get("Textures")
    if (not isinstance(moc, str) or not isinstance(textures, list) or not 1 <= len(textures) <= 64
            or not all(isinstance(item, str) and item for item in textures)):
        raise ContractError("Invalid avatar references")
    files = [moc, *textures]
    physics = references.get("Physics")
    if physics is not None:
        if not isinstance(physics, str):
            raise ContractError("Invalid avatar physics reference")
        files.append(physics)
    missing = []
    for relative_file in files:
        candidate = resource_path(model_path.parent, relative_file)
        if not candidate.is_file() or candidate.stat().st_size == 0:
            missing.append(relative_file)
    return {"status": "missing" if missing else "present", "missing": missing,
            "textureCount": len(textures), "renderVerified": False}


def diagnose(config_path, *, project_root=PROJECT_ROOT, version_probe=probe_version,
             find_executable=shutil.which):
    config_path = Path(config_path).resolve()
    config = load_config(config_path)
    checks = []

    def add(code, status, message):
        checks.append({"code": code, "status": status, "message": message})

    supported_python = (3, 11) <= sys.version_info[:2] < (3, 14)
    add("python", "ok" if supported_python else "error",
        f"Developer Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}; supported: 3.11-3.13")
    node = find_executable("node")
    node_version = version_probe(node) if node else None
    add("node", "ok" if node_version and node_version >= (22, 12, 0) else "error",
        "Node >=22.12 available" if node_version and node_version >= (22, 12, 0) else "Node >=22.12 not available")
    add("config", "ok", "Configuration validated; credentials are not read")
    add("model", "ok" if config["llm"]["model"].strip() else "warning",
        "Model name configured; endpoint not contacted" if config["llm"]["model"].strip()
        else "Model name not configured; set it before M1 chat")

    for worker, key in (("asr", "asrPython"), ("tts", "ttsPython")):
        configured = config["runtime"][key]
        if configured is None and worker == "asr":
            candidate = Path(project_root) / ".venv-asr" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
            if candidate.is_file():
                configured = str(candidate)
        if configured is None:
            add(f"{worker}-python", "warning", "Optional worker interpreter not configured")
            continue
        executable = Path(configured)
        if not executable.is_absolute():
            executable = config_path.parent / executable
        version = version_probe(executable.resolve(), python=True)
        supported = ((3, 11), (3, 12)) if worker == "asr" else ((3, 11),)
        requirement = "3.11-3.12" if worker == "asr" else "3.11"
        status = "ok" if version and version[:2] in supported else "warning"
        add(f"{worker}-python", status,
            f"Python {requirement} interpreter available; engine not tested" if status == "ok"
            else f"Optional worker Python {requirement} unavailable; speech remains unverified")

    legacy_python = Path(project_root) / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if legacy_python.exists():
        legacy_version = version_probe(legacy_python, python=True)
        add("legacy-python", "ok" if legacy_version else "warning",
            "Legacy interpreter starts; dependencies not tested" if legacy_version
            else "Legacy .venv cannot start; v2 environment is separate")

    root = (config_path.parent / config["resources"]["legacyRoot"]).resolve()
    inventory = parse_json((CONTRACT_ROOT / "legacy-resources.json").read_text(encoding="utf-8"))
    resources = inspect_inventory(root, inventory)
    for bundle in resources:
        add(bundle["id"], "ok" if bundle["status"] == "present" else "warning",
            "Legacy files present; hashes and inference not verified" if bundle["status"] == "present"
            else "Optional legacy resource files missing")
    try:
        avatar = inspect_avatar(root, config["resources"]["avatarModel"])
    except (OSError, ContractError):
        avatar = {"status": "invalid", "renderVerified": False}
    add("avatar", "ok" if avatar["status"] == "present" else "warning",
        "Avatar references present; rendering not verified" if avatar["status"] == "present"
        else "Avatar files missing or invalid")
    desktop_present = (Path(project_root) / "apps/desktop/package.json").is_file()
    add("desktop", "ok" if desktop_present else "warning",
        "Desktop package definition present; launch not tested" if desktop_present
        else "Electron desktop will be added in M1")
    if desktop_present:
        binary = Path(project_root) / "apps/desktop/node_modules/electron/dist" / ("electron.exe" if sys.platform == "win32" else "electron")
        add("desktop-runtime", "ok" if binary.is_file() else "warning",
            "Electron executable present; launch not tested" if binary.is_file()
            else "Electron runtime missing; run pnpm setup:desktop")
    return {"schemaVersion": 1, "milestone": "M0", "checks": checks,
            "resources": resources, "avatar": avatar,
            "developmentReady": not any(item["status"] == "error" for item in checks),
            "speechInferenceVerified": False, "deviceChecks": "not-performed"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=PROJECT_ROOT / "configs/v2.example.json")
    parser.add_argument("--json", action="store_true", help="Print a machine-readable report")
    args = parser.parse_args(argv)
    try:
        report = diagnose(args.config)
    except (ContractError, OSError):
        report = {"schemaVersion": 1, "milestone": "M0", "developmentReady": False,
                  "checks": [{"code": "configuration", "status": "error",
                              "message": "Cannot read or validate configuration/contracts"}]}
        exit_code = 2
    else:
        exit_code = 0 if report["developmentReady"] else 1
    if args.json:
        print(json.dumps(report, ensure_ascii=True, indent=2))
    else:
        for check in report["checks"]:
            print(f"[{check['status'].upper()}] {check['code']}: {check['message']}")
        print("No model inference, network request or microphone/GPU check was performed.")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
