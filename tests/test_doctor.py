import json
from pathlib import Path
import subprocess

import pytest

from packages.contracts.validation import ContractError, load_config
from tools.doctor import diagnose, inspect_avatar, inspect_inventory, main, probe_version

ROOT = Path(__file__).resolve().parents[1]


def test_missing_optional_models_do_not_block_development(tmp_path):
    config = load_config(ROOT / "configs/v2.example.json")
    config["resources"]["legacyRoot"] = "."
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    report = diagnose(path, project_root=tmp_path, version_probe=lambda *_args, **_kwargs: (24, 0, 0),
                      find_executable=lambda _name: "node")
    assert report["developmentReady"]
    assert not report["speechInferenceVerified"]
    assert all(bundle["status"] == "missing" for bundle in report["resources"])
    assert report["avatar"]["status"] == "invalid"
    assert any(item["code"] == "tts-python" and item["status"] == "warning" for item in report["checks"])


def test_missing_node_blocks_desktop_development():
    report = diagnose(ROOT / "configs/v2.example.json", find_executable=lambda _name: None,
                      version_probe=lambda *_args, **_kwargs: None)
    assert not report["developmentReady"]
    assert any(item["code"] == "node" and item["status"] == "error" for item in report["checks"])


def test_old_node_22_minor_does_not_meet_electron_dependency_requirement(tmp_path):
    report = diagnose(ROOT / "configs/v2.example.json", project_root=tmp_path,
                      find_executable=lambda _name: "node", version_probe=lambda *_args, **_kwargs: (22, 1, 0))
    assert not report["developmentReady"]


def test_invalid_config_cli_returns_json_without_credentials(tmp_path, capsys):
    path = tmp_path / "bad.json"
    path.write_text('{"apiKey":"super-private-value"}', encoding="utf-8")
    assert main(["--config", str(path), "--json"]) == 2
    output = capsys.readouterr().out
    assert "super-private-value" not in output
    assert not json.loads(output)["developmentReady"]


def test_probe_handles_timeout_and_suppresses_raw_output(monkeypatch):
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("python", 5)
    monkeypatch.setattr(subprocess, "run", timeout)
    assert probe_version("missing", python=True) is None
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: subprocess.CompletedProcess(a, 0, b"secret", b""))
    assert probe_version("untrusted", python=True) is None


def test_inventory_is_presence_only_and_checks_nonempty_files(tmp_path):
    (tmp_path / "model.pt").write_bytes(b"fixture")
    inventory = {"schemaVersion": 1, "installable": False,
                 "bundles": [{"id": "fixture", "files": ["model.pt"]}]}
    result = inspect_inventory(tmp_path, inventory)
    assert result[0]["status"] == "present"
    assert not result[0]["integrityVerified"]
    (tmp_path / "model.pt").write_bytes(b"")
    assert inspect_inventory(tmp_path, inventory)[0]["missing"] == ["model.pt"]


def test_inventory_rejects_duplicate_and_traversal_entries(tmp_path):
    inventory = {"schemaVersion": 1, "installable": False,
                 "bundles": [{"id": "fixture", "files": ["../outside"]}]}
    with pytest.raises(ContractError):
        inspect_inventory(tmp_path, inventory)
    inventory["bundles"][0]["files"] = ["same", "same"]
    with pytest.raises(ContractError):
        inspect_inventory(tmp_path, inventory)


def test_avatar_supports_arbitrary_texture_counts_and_reports_missing(tmp_path):
    model = {"Version": 3, "FileReferences": {"Moc": "avatar.moc3", "Textures": ["a.png", "b.png", "c.png"]}}
    (tmp_path / "avatar.model3.json").write_text(json.dumps(model), encoding="utf-8")
    for name in ["avatar.moc3", "a.png", "b.png", "c.png"]:
        (tmp_path / name).write_bytes(b"fixture")
    result = inspect_avatar(tmp_path, "avatar.model3.json")
    assert result["status"] == "present"
    assert result["textureCount"] == 3
    assert not result["renderVerified"]
    model["FileReferences"]["Moc"] = "../outside"
    (tmp_path / "avatar.model3.json").write_text(json.dumps(model), encoding="utf-8")
    with pytest.raises(ContractError):
        inspect_avatar(tmp_path, "avatar.model3.json")


def test_worker_interpreters_resolve_relative_to_config(tmp_path):
    config = load_config(ROOT / "configs/v2.example.json")
    config["runtime"]["asrPython"] = "runtime/python.exe"
    config["runtime"]["ttsPython"] = "missing/python.exe"
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    calls = []
    def probe(executable, **kwargs):
        calls.append(Path(executable))
        return (3, 11, 9) if Path(executable).parent.name == "runtime" else None
    report = diagnose(path, project_root=tmp_path, version_probe=probe, find_executable=lambda _: None)
    assert (tmp_path / "runtime/python.exe").resolve() in calls
    statuses = {item["code"]: item["status"] for item in report["checks"]}
    assert statuses["asr-python"] == "ok"
    assert statuses["tts-python"] == "warning"


def test_asr_auto_detects_separate_python312_environment(tmp_path):
    import sys
    executable = tmp_path / ".venv-asr" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b"fixture")
    report = diagnose(ROOT / "configs/v2.example.json", project_root=tmp_path,
                      version_probe=lambda *args, **kwargs: (3, 12, 3), find_executable=lambda _: None)
    assert next(check for check in report["checks"] if check["code"] == "asr-python")["status"] == "ok"
