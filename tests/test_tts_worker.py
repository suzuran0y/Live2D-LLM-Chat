import array
import io
import json
import wave

import pytest

from packages.contracts.protocol import decode_frame
from workers.tts.protocol import emit, read
from workers.tts.worker import pcm_parts, profile_key


def test_tts_adapter_uses_shared_contract_without_loading_model_dependencies():
    output = io.BytesIO()
    emit(output, "ready", {"worker": "tts", "capabilities": ["synthesize", "audioChunks", "voiceProfiles"]})
    assert decode_frame(output.getvalue(), "event")["type"] == "ready"
    for kind in ("prepare-profile", "use-profile"):
        payload = {"profileId": "voice-" + "a" * 36}
        line = json.dumps({"version": 1, "type": kind, "requestId": "r-1", "payload": payload}).encode() + b"\n"
        assert read(io.BytesIO(line)) == decode_frame(line, "request")


@pytest.mark.parametrize("line", [b'{}\n', b'{"version":1,"version":1}\n', b'x' * 16385,
                                b'{"version":1,"type":"chunk-ack","requestId":"r","payload":{"index":true}}\n',
                                b'{"version":1,"type":"use-profile","requestId":"r","payload":{"profileId":"../escape"}}\n'])
def test_tts_rejects_invalid_control_frames(line):
    with pytest.raises(ValueError):
        read(io.BytesIO(line))


def test_large_engine_audio_is_split_into_bounded_independent_pcm_waves():
    samples = array.array("h", [1000] * 250000)
    parts = list(pcm_parts(samples, 24000))
    assert len(parts) == 3
    frames = []
    for index, part in enumerate(parts):
        assert len(part) <= 262144
        with wave.open(io.BytesIO(part)) as reader:
            assert reader.getframerate() == 24000
            frames.append(reader.readframes(reader.getnframes()))
        output = io.BytesIO()
        import base64
        emit(output, "audio-chunk", {"index": index, "audio": base64.b64encode(part).decode()}, "synth-1")
        assert decode_frame(output.getvalue(), "event")["type"] == "audio-chunk"
    assert b"".join(frames) == samples.tobytes()


def test_voice_cache_key_tracks_audio_transcript_engine_and_model():
    metadata = {"audioSha256": "audio", "text": "你好", "engineRevision": "engine", "modelRevision": "model"}
    original = profile_key(metadata)
    for key in metadata:
        assert profile_key({**metadata, key: metadata[key] + "changed"}) != original
