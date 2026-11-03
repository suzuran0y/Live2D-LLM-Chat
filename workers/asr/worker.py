"""Offline SenseVoice worker; protocol on stdout, engine logs on stderr."""
import argparse
import base64
import contextlib
import io
import os
from pathlib import Path
import re
import socket
import sys
import wave

from packages.contracts.protocol import encode_frame, read_frame
from packages.contracts.validation import ContractError


def frame(kind, payload, request_id=None):
    return {"version": 1, "type": kind, "requestId": request_id, "payload": payload}


def emit(kind, payload, request_id=None):
    sys.stdout.buffer.write(encode_frame(frame(kind, payload, request_id), "event"))
    sys.stdout.buffer.flush()


def offline():
    def deny(*_args, **_kwargs):
        raise OSError("ASR worker is offline")
    socket.create_connection = deny
    socket.socket.connect = deny
    socket.socket.connect_ex = deny
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", MODELSCOPE_OFFLINE="1")


def clean_text(text):
    return re.sub(r"<\|[^|]*\|>", "", text).strip()


def transcribe(engine, audio, language):
    import numpy as np
    with wave.open(io.BytesIO(audio), "rb") as reader:
        samples = np.frombuffer(reader.readframes(reader.getnframes()), dtype="<i2").astype("float32") / 32768
    # Fixed bounded windows avoid loading a second VAD model or an unbounded encoder input.
    parts = []
    for start in range(0, len(samples), 25 * 16000):
        output = engine.generate(input=samples[start:start + 25 * 16000], fs=16000,
                                 language=language, use_itn=True, cache={}, batch_size_s=30,
                                 disable_pbar=True)
        if output:
            parts.append(clean_text(output[0].get("text", "")))
    return " ".join(part for part in parts if part)[:4000]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    args = parser.parse_args()
    offline()
    try:
        if not (args.model / "model.pt").is_file():
            emit("error", {"code": "RESOURCE_MISSING", "retryable": False})
            return 1
        with contextlib.redirect_stdout(sys.stderr):
            import torch
            from funasr import AutoModel
            torch.set_num_threads(4)
            engine = AutoModel(model=str(args.model.resolve()), trust_remote_code=False,
                               device="cpu", disable_update=True, disable_pbar=True)
        emit("ready", {"worker": "asr", "capabilities": ["transcribe"]})
    except Exception:
        emit("error", {"code": "ENGINE_LOAD", "retryable": False})
        return 1
    while True:
        request_id = None
        try:
            request = read_frame(sys.stdin.buffer, "request")
            if request is None:
                return 0
            request_id = request["requestId"]
            if request["type"] in {"health", "shutdown"}:
                emit("completed", {}, request_id)
                if request["type"] == "shutdown":
                    return 0
            elif request["type"] == "transcribe":
                with contextlib.redirect_stdout(sys.stderr):
                    text = transcribe(engine, base64.b64decode(request["payload"]["audio"]), request["payload"]["language"])
                emit("transcript", {"text": text}, request_id)
                emit("completed", {}, request_id)
            else:
                emit("error", {"code": "INVALID_REQUEST", "retryable": False}, request_id)
        except ContractError:
            # Invalid frames may be partial: end the session instead of attempting resynchronization.
            return 1
        except Exception:
            emit("error", {"code": "INFERENCE_FAILED", "retryable": True}, request_id)


if __name__ == "__main__":
    raise SystemExit(main())
