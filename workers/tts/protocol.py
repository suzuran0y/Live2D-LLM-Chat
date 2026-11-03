"""Small stdlib adapter for contract v1; does not change a borrowed model environment."""
import json
import re

ID = re.compile(r"[A-Za-z0-9_-]{1,100}\Z")
PROFILE = re.compile(r"(?:official-demo|voice-[a-f0-9-]{36})\Z")


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate property")
        result[key] = value
    return result


def read(source):
    line = source.readline(16385)
    if not line:
        return None
    if len(line) > 16384 or not line.endswith(b"\n"):
        raise ValueError("invalid frame")
    value = json.loads(line, object_pairs_hook=unique, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    if (not isinstance(value, dict) or set(value) != {"version", "type", "requestId", "payload"}
            or type(value["version"]) is not int or value["version"] != 1
            or not isinstance(value["requestId"], str) or not ID.fullmatch(value["requestId"])
            or not isinstance(value["payload"], dict)):
        raise ValueError("invalid frame")
    payload, kind = value["payload"], value["type"]
    if not isinstance(kind, str):
        raise ValueError("invalid frame type")
    if kind in {"health", "shutdown"}:
        valid = not payload
    elif kind in {"prepare-profile", "use-profile"}:
        valid = set(payload) == {"profileId"} and isinstance(payload["profileId"], str) and PROFILE.fullmatch(payload["profileId"])
        valid = valid and (kind != "prepare-profile" or payload["profileId"] != "official-demo")
    elif kind == "chunk-ack":
        valid = set(payload) == {"index"} and type(payload["index"]) is int and 0 <= payload["index"] <= 127
    elif kind == "synthesize":
        valid = (set(payload) == {"text", "profileId", "stream"} and isinstance(payload["text"], str)
                 and 0 < len(payload["text"]) <= 600 and payload["text"].strip() and "<|" not in payload["text"]
                 and isinstance(payload["profileId"], str) and PROFILE.fullmatch(payload["profileId"])
                 and type(payload["stream"]) is bool)
    else:
        valid = False
    if not valid:
        raise ValueError("invalid payload")
    return value


def emit(output, kind, payload, request_id=None):
    output.write((json.dumps({"version": 1, "type": kind, "requestId": request_id, "payload": payload},
                            ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8"))
    output.flush()
