import base64
import io
import json
from pathlib import Path
import struct
import wave

import pytest

from packages.contracts.protocol import (
    MAX_FRAME_BYTES, decode_frame, encode_frame, read_frame,
)
from packages.contracts.validation import ContractError, load_config, parse_json, resource_path, validator

ROOT = Path(__file__).resolve().parents[1]


def frame(kind, payload=None, request_id="request-1"):
    return {"version": 1, "type": kind, "requestId": request_id, "payload": payload or {}}


def wav_data(seconds=0.4, rate=16000, channels=1):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(2)
        writer.setframerate(rate)
        writer.writeframes(b"\0\0" * int(seconds * rate) * channels)
    return buffer.getvalue()


def audio_payload(audio):
    return {"audio": base64.b64encode(audio).decode("ascii"), "language": "auto"}


@pytest.mark.parametrize("name", ["config", "worker", "resources"])
def test_schemas_are_valid(name):
    validator(name).check_schema(validator(name).schema)


@pytest.mark.parametrize("url", [
    "https://user:secret@example.com/v1", "https://example.com/v1?api_key=secret",
    "file:///tmp/endpoint", "http://localhost:99999/v1", "http://localhost:0/v1",
    "http://example.com\\other/v1", "https://example.com/v1#secret", "http://host name/v1",
])
def test_invalid_endpoints_do_not_leak_values(tmp_path, url):
    config = load_config(ROOT / "configs/v2.example.json")
    config["llm"]["baseUrl"] = url
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    with pytest.raises(ContractError) as error:
        load_config(path)
    assert url not in str(error.value)
    assert "secret" not in str(error.value)


def test_plaintext_key_is_not_a_setting(tmp_path):
    config = load_config(ROOT / "configs/v2.example.json")
    config["llm"]["apiKey"] = "private-value"
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    with pytest.raises(ContractError, match="Invalid config document"):
        load_config(path)


@pytest.mark.parametrize("text", ['{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}'])
def test_json_rejects_ambiguous_or_nonfinite_input(text):
    with pytest.raises(ContractError):
        parse_json(text)


@pytest.mark.parametrize("relative", ["../secret", "/secret", "C:/secret", "C:secret", "asset:stream", "a\\b", ".", "bad\x00name"])
def test_resource_path_rejects_escape(tmp_path, relative):
    with pytest.raises(ContractError):
        resource_path(tmp_path, relative)


def test_worker_requests_round_trip_and_enforce_direction():
    request = frame("synthesize", {"text": "你好。", "profileId": "voice-1", "stream": True})
    line = encode_frame(request, "request")
    assert decode_frame(line, "request") == request
    with pytest.raises(ContractError, match="direction"):
        decode_frame(line, "event")


def test_ready_has_no_request_id():
    ready = frame("ready", {"worker": "asr", "capabilities": ["transcribe"]}, None)
    assert decode_frame(encode_frame(ready, "event"), "event") == ready
    ready["requestId"] = "not-a-response"
    with pytest.raises(ContractError):
        encode_frame(ready)


def test_startup_failure_can_be_reported_without_request_id():
    event = frame("error", {"code": "ENGINE_LOAD", "retryable": False}, None)
    assert decode_frame(encode_frame(event, "event"), "event") == event


def test_invalid_utf8_configuration_is_a_contract_error(tmp_path):
    path = tmp_path / "settings.json"
    path.write_bytes(b"\xff")
    with pytest.raises(ContractError):
        load_config(path)


def test_control_characters_in_config_paths_are_rejected(tmp_path):
    config = load_config(ROOT / "configs/v2.example.json")
    config["resources"]["legacyRoot"] = "bad\x00path"
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    with pytest.raises(ContractError, match="path configuration"):
        load_config(path)


@pytest.mark.parametrize("mutation", [
    {"version": 2}, {"type": "execute-shell"}, {"requestId": None},
    {"requestId": "../path"}, {"unexpected": "value"}, {"payload": {"token": "private"}},
])
def test_malformed_control_frames_rejected(mutation):
    request = frame("health")
    request.update(mutation)
    with pytest.raises(ContractError):
        encode_frame(request)


@pytest.mark.parametrize("text", [" ", "<|endofprompt|>你好", "x" * 601])
def test_spoken_text_limits(text):
    with pytest.raises(ContractError):
        encode_frame(frame("synthesize", {"text": text, "profileId": "voice", "stream": False}))


def test_valid_silent_recording_is_accepted_without_division():
    request = frame("transcribe", audio_payload(wav_data()))
    assert decode_frame(encode_frame(request)) == request


@pytest.mark.parametrize("audio", [
    wav_data(seconds=0.39), wav_data(seconds=60.01), wav_data(rate=44100),
    wav_data(channels=2), wav_data()[:-1], b"not a WAV file" * 10,
], ids=["too-short", "too-long", "wrong-rate", "stereo", "truncated", "not-wave"])
def test_invalid_recordings_rejected(audio):
    with pytest.raises(ContractError):
        encode_frame(frame("transcribe", audio_payload(audio)))


def test_truncated_pcm_is_rejected_even_if_riff_length_matches():
    audio = bytearray(wav_data()[:-2])
    struct.pack_into("<I", audio, 4, len(audio) - 8)
    with pytest.raises(ContractError):
        encode_frame(frame("transcribe", audio_payload(audio)))


def test_invalid_base64_is_rejected():
    with pytest.raises(ContractError):
        encode_frame(frame("transcribe", {"audio": "????", "language": "auto"}))


def test_chunks_allow_tts_sample_rate_but_limit_size():
    payload = {"index": 0, "audio": base64.b64encode(wav_data(rate=24000)).decode("ascii")}
    event = frame("audio-chunk", payload)
    assert decode_frame(encode_frame(event, "event")) == event
    payload["audio"] = base64.b64encode(wav_data(seconds=6, rate=24000)).decode("ascii")
    with pytest.raises(ContractError):
        encode_frame(event)


@pytest.mark.parametrize("line", [b"{}", b"{}\n{}\n", b"\xff\n", b"{\n}\n"])
def test_bad_transport_frames(line):
    with pytest.raises(ContractError):
        decode_frame(line)


def test_bounded_reader_does_not_read_entire_oversized_stream():
    stream = io.BytesIO(b"x" * (MAX_FRAME_BYTES + 100))
    with pytest.raises(ContractError):
        read_frame(stream)
    assert stream.tell() == MAX_FRAME_BYTES + 1
    assert read_frame(io.BytesIO()) is None


def test_frames_keep_separate_request_ids():
    events = [frame("completed", request_id="old"), frame("completed", request_id="new")]
    stream = io.BytesIO(b"".join(encode_frame(event) for event in events))
    assert [read_frame(stream)["requestId"] for _ in events] == ["old", "new"]
    # Filtering stale IDs is the future host's job; the codec must not discard IDs.
