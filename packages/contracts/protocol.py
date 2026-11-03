"""Bounded NDJSON frames shared by future speech workers and protocol tests."""
import base64
import binascii
import io
import json
import struct
import wave

from .validation import ContractError, parse_json, validate

MAX_FRAME_BYTES = 3 * 1024 * 1024
REQUEST_TYPES = frozenset({"health", "shutdown", "transcribe", "synthesize", "chunk-ack", "prepare-profile", "use-profile"})
EVENT_TYPES = frozenset({"ready", "transcript", "audio-chunk", "completed", "error", "profile-ready"})


def _audio_bytes(encoded, limit, recording=False):
    try:
        audio = base64.b64decode(encoded, validate=True)
        if not 44 <= len(audio) <= limit:
            raise ValueError()
        if audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
            raise ValueError()
        if struct.unpack_from("<I", audio, 4)[0] != len(audio) - 8:
            raise ValueError()
        with wave.open(io.BytesIO(audio), "rb") as reader:
            rate, channels, width = reader.getframerate(), reader.getnchannels(), reader.getsampwidth()
            frames = reader.getnframes()
            if (reader.getcomptype() != "NONE" or width != 2 or channels not in {1, 2}
                    or not 8000 <= rate <= 96000 or frames == 0
                    or len(reader.readframes(frames)) != frames * width * channels):
                raise ValueError()
            if recording and (rate != 16000 or channels != 1 or not 0.4 <= frames / rate <= 60):
                raise ValueError()
    except (ValueError, TypeError, binascii.Error, wave.Error, EOFError, struct.error) as error:
        raise ContractError("Invalid PCM WAV audio") from error


def validate_frame(frame, direction=None):
    validate(frame, "worker")
    if direction not in {None, "request", "event"}:
        raise ContractError("Invalid frame direction")
    allowed = REQUEST_TYPES if direction == "request" else EVENT_TYPES
    if direction and frame["type"] not in allowed:
        raise ContractError("Unexpected frame direction")
    payload = frame["payload"]
    if frame["type"] == "synthesize" and (not payload["text"].strip() or "<|" in payload["text"]):
        raise ContractError("Invalid spoken text")
    if frame["type"] == "transcribe":
        _audio_bytes(payload["audio"], 1920044, recording=True)
    elif frame["type"] == "audio-chunk":
        _audio_bytes(payload["audio"], 262144)
    return frame


def decode_frame(line, direction=None):
    if not isinstance(line, bytes) or len(line) > MAX_FRAME_BYTES or not line.endswith(b"\n"):
        raise ContractError("Invalid or oversized worker frame")
    content = line[:-1].removesuffix(b"\r")
    if b"\n" in content or b"\r" in content:
        raise ContractError("Expected one NDJSON frame")
    return validate_frame(parse_json(content), direction)


def encode_frame(frame, direction=None):
    validate_frame(frame, direction)
    try:
        line = (json.dumps(frame, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8")
    except (ValueError, UnicodeError) as error:
        raise ContractError("Cannot encode worker frame") from error
    if len(line) > MAX_FRAME_BYTES:
        raise ContractError("Worker frame exceeds transport limit")
    return line


def read_frame(stream, direction=None):
    """Read at most one bounded frame; None means clean EOF between frames."""
    line = stream.readline(MAX_FRAME_BYTES + 1)
    return decode_frame(line, direction) if line else None
