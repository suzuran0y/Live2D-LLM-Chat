"""Validate local contracts without importing model code or reading credentials."""
from functools import lru_cache
import json
import math
from pathlib import Path, PureWindowsPath
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator

CONTRACT_ROOT = Path(__file__).resolve().parent


class ContractError(ValueError):
    """Public errors deliberately omit invalid values (which may contain secrets)."""


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ContractError("Duplicate JSON property")
        result[key] = value
    return result


def _reject_constant(_value):
    raise ContractError("Non-finite JSON number")


def _finite_float(text):
    value = float(text)
    if not math.isfinite(value):
        raise ContractError("Non-finite JSON number")
    return value


def parse_json(text):
    try:
        return json.loads(text, object_pairs_hook=_unique_object, parse_constant=_reject_constant,
                          parse_float=_finite_float)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ContractError("Invalid JSON document") from error


@lru_cache(maxsize=3)
def validator(name):
    if name not in {"config", "worker", "resources"}:
        raise ContractError("Unknown contract")
    schema = parse_json((CONTRACT_ROOT / f"{name}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate(value, name):
    if next(validator(name).iter_errors(value), None) is not None:
        raise ContractError(f"Invalid {name} document")
    return value


def load_config(path):
    try:
        value = validate(parse_json(Path(path).read_text(encoding="utf-8")), "config")
    except (OSError, UnicodeError) as error:
        raise ContractError("Cannot read configuration") from error
    for entry in [*value["runtime"].values(), *value["resources"].values()]:
        if isinstance(entry, str) and any(ord(char) < 32 for char in entry):
            raise ContractError("Invalid path configuration")
    try:
        url = urlsplit(value["llm"]["baseUrl"])
        if (url.scheme not in {"http", "https"} or not url.hostname or url.username is not None
                or url.password is not None or url.query or url.fragment or url.port == 0
                or "\\" in value["llm"]["baseUrl"]
                or any(char.isspace() or ord(char) < 32 for char in value["llm"]["baseUrl"])):
            raise ValueError()
    except ValueError as error:
        raise ContractError("Model endpoint must be an HTTP(S) URL without credentials or query") from error
    return value


def resource_path(root, relative):
    """Reject traversal, Windows drives/ADS and symlinks escaping the resource root."""
    windows_path = PureWindowsPath(relative)
    if (windows_path.drive or windows_path.root or ":" in relative
            or any(ord(char) < 32 or char in '<>"|?*' for char in relative)
            or ".." in windows_path.parts or "\\" in relative):
        raise ContractError("Resource path must be a contained relative POSIX path")
    root = Path(root).resolve()
    result = (root / relative).resolve()
    if not result.is_relative_to(root) or result == root:
        raise ContractError("Resource path escapes its root")
    return result
