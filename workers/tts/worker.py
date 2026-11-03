"""Offline CosyVoice3 adapter, based on Cute-Partner; see UPSTREAM.md and its MIT license."""
import argparse
import base64
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import wave

from .protocol import emit, read

LOCK = json.loads(Path(__file__).with_name("assets.lock.json").read_text(encoding="utf-8"))
PROMPT_KEYS = {"prompt_text", "prompt_text_len", "llm_prompt_speech_token", "llm_prompt_speech_token_len",
               "flow_prompt_speech_token", "flow_prompt_speech_token_len", "prompt_speech_feat",
               "prompt_speech_feat_len", "llm_embedding", "flow_embedding"}


def offline():
    def deny(*_args, **_kwargs):
        raise OSError("TTS worker is offline")
    socket.create_connection = deny
    socket.socket.connect = deny
    socket.socket.connect_ex = deny
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", MODELSCOPE_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1", PYTHONDONTWRITEBYTECODE="1")


def read_small(file):
    if file.stat().st_size > 16384:
        raise ValueError("metadata too large")
    return json.loads(file.read_text(encoding="utf-8"))


def load_engine(root, receipt):
    verified = read_small(receipt)
    if (verified.get("verified") is not True or Path(verified["root"]).resolve() != root
            or verified.get("engineRevision") != LOCK["engine"]["revision"]
            or verified.get("modelRevision") != LOCK["model"]["revision"]):
        raise ValueError("unverified resources")
    for item, checked in zip(LOCK["model"]["files"], verified["files"], strict=True):
        stat = (root / "model" / item["name"]).stat()
        if checked["name"] != item["name"] or stat.st_size != item["bytes"] or str(stat.st_mtime_ns) != checked["mtimeNs"]:
            raise ValueError("resources changed; verify again")
    source = root / "source"
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    def revision(directory):
        return subprocess.check_output(["git", "-C", str(directory), "rev-parse", "HEAD"],
                                       text=True, creationflags=flags).strip()
    if revision(source) != LOCK["engine"]["revision"] or revision(source / "third_party/Matcha-TTS") != LOCK["engine"]["matchaRevision"]:
        raise ValueError("engine changed; verify again")
    subprocess.run(["git", "-C", str(source), "diff", "--quiet", "--ignore-submodules=none", "HEAD"], check=True, creationflags=flags)
    sys.path[:0] = [str(root / "source"), str(root / "source/third_party/Matcha-TTS")]
    import torch
    import onnxruntime
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required for this build")
    torch.set_num_threads(4)
    onnxruntime.disable_telemetry_events()
    torch.cuda.reset_peak_memory_stats()
    from cosyvoice.cli.cosyvoice import AutoModel
    engine = AutoModel(model_dir=str(root / "model"), fp16=True, load_trt=False)
    engine.initial_hop = engine.model.token_hop_len
    engine.add_zero_shot_spk("You are a helpful assistant.<|endofprompt|>" + LOCK["reference"]["text"],
                             str(root / "source" / LOCK["reference"]["file"]), "official-demo")
    return engine


def profile_key(metadata):
    values = [metadata[key] for key in ("audioSha256", "text", "engineRevision", "modelRevision")]
    return hashlib.sha256(json.dumps(values, ensure_ascii=False).encode("utf-8")).hexdigest()


def use_profile(engine, profile_id, profiles, prepare=False):
    import torch
    if profile_id == "official-demo":
        return
    directory = profiles / profile_id
    metadata = read_small(directory / "profile.json")
    if (metadata["id"] != profile_id or metadata["engineRevision"] != LOCK["engine"]["revision"]
            or metadata["modelRevision"] != LOCK["model"]["revision"]):
        raise ValueError("incompatible profile")
    reference = directory / "reference.wav"
    if reference.stat().st_size > 5000000 or hashlib.sha256(reference.read_bytes()).hexdigest() != metadata["audioSha256"]:
        raise ValueError("reference changed")
    key = profile_key(metadata)
    if prepare:
        import soundfile as sf
        import numpy as np
        audio, rate = sf.read(reference, dtype="float32", always_2d=True)
        if not 3 <= len(audio) / rate <= 30 or rate < 16000 or not np.isfinite(audio).all() or float(np.sqrt(np.mean(audio.mean(axis=1) ** 2))) < 0.001:
            raise ValueError("invalid or silent reference")
        text = metadata["text"]
        if not isinstance(text, str) or not text.strip() or len(text) > 500 or "<" in text or ">" in text:
            raise ValueError("invalid transcript")
        engine.add_zero_shot_spk("You are a helpful assistant.<|endofprompt|>" + text, str(reference), profile_id)
        features = {name: value.detach().cpu() for name, value in engine.frontend.spk2info[profile_id].items()}
        torch.save(features, directory / "prompt.pt.tmp")
        (directory / "prompt.pt.tmp").replace(directory / "prompt.pt")
        metadata.update(status="ready", cacheKey=key)
        temporary = directory / "profile.json.tmp"
        temporary.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
        temporary.replace(directory / "profile.json")
    else:
        file = directory / "prompt.pt"
        if metadata.get("status") != "ready" or metadata.get("cacheKey") != key or file.stat().st_size > 20000000:
            raise ValueError("profile cache is incompatible")
        features = torch.load(file, map_location="cpu", weights_only=True)
        if (not isinstance(features, dict) or set(features) != PROMPT_KEYS
                or not all(isinstance(value, torch.Tensor) and value.numel() <= 2000000 and torch.isfinite(value).all() for value in features.values())):
            raise ValueError("invalid feature cache")
        engine.frontend.spk2info[profile_id] = {name: value.to(engine.frontend.device) for name, value in features.items()}


def pcm_parts(samples, rate, max_samples=120000):
    """Each independent PCM WAV stays below contract's 262144-byte chunk limit."""
    for start in range(0, len(samples), max_samples):
        output = io.BytesIO()
        with wave.open(output, "wb") as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(rate)
            writer.writeframes(samples[start:start + max_samples].tobytes())
        yield output.getvalue()


def synthesize(engine, request, source, output):
    import torch
    value, request_id = request["payload"], request["requestId"]
    engine.model.token_hop_len = engine.initial_hop
    started = time.perf_counter()
    first, count, total, samples = None, 0, 0, 0
    torch.cuda.reset_peak_memory_stats()
    for part in engine.inference_zero_shot(value["text"], "", "", zero_shot_spk_id=value["profileId"], stream=value["stream"]):
        first = first or time.perf_counter()
        tensor = part["tts_speech"].detach().float().cpu()
        if tensor.ndim != 2 or tensor.shape[0] != 1 or not tensor.shape[-1] or not torch.isfinite(tensor).all():
            raise ValueError("invalid engine audio")
        samples += tensor.shape[-1]
        if samples * 2 > 5000000:
            raise ValueError("audio too large")
        pcm = (tensor.squeeze(0).clamp(-1, 1).numpy() * 32767).astype("<i2")
        for data in pcm_parts(pcm, engine.sample_rate):
            total += len(data)
            if total > 5000000 or count >= 128:
                raise ValueError("too much audio")
            emit(output, "audio-chunk", {"index": count, "audio": base64.b64encode(data).decode("ascii")}, request_id)
            ack = read(source)
            if ack != {"version": 1, "type": "chunk-ack", "requestId": request_id, "payload": {"index": count}}:
                raise ValueError("invalid chunk acknowledgement")
            count += 1
    if not count:
        raise ValueError("empty audio")
    return {"metrics": {"firstChunkMs": round((first - started) * 1000), "totalMs": round((time.perf_counter() - started) * 1000),
                        "audioSeconds": round(samples / engine.sample_rate, 3), "chunks": count,
                        "peakCudaMiB": round(torch.cuda.max_memory_allocated() / 1048576, 1)}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--profiles", required=True, type=Path)
    args = parser.parse_args()
    offline()
    output, source = sys.stdout.buffer, sys.stdin.buffer
    try:
        with contextlib.redirect_stdout(sys.stderr):
            engine = load_engine(args.root.resolve(), args.receipt)
        emit(output, "ready", {"worker": "tts", "capabilities": ["synthesize", "audioChunks", "voiceProfiles"]})
    except Exception as error:
        print("TTS load: " + type(error).__name__, file=sys.stderr)
        if os.environ.get("LIVE2D_TTS_DIAGNOSTICS") == "1":
            import traceback
            traceback.print_exc(file=sys.stderr)
        emit(output, "error", {"code": "ENGINE_LOAD", "retryable": False})
        return 1
    while True:
        request_id = None
        try:
            request = read(source)
            if request is None:
                return 0
            request_id, kind = request["requestId"], request["type"]
            if kind in {"health", "shutdown"}:
                emit(output, "completed", {}, request_id)
                if kind == "shutdown":
                    return 0
                continue
            with contextlib.redirect_stdout(sys.stderr):
                profile_id = request["payload"]["profileId"]
                use_profile(engine, profile_id, args.profiles, kind == "prepare-profile")
                if kind in {"prepare-profile", "use-profile"}:
                    emit(output, "profile-ready", {"profileId": profile_id}, request_id)
                    result = {}
                else:
                    result = synthesize(engine, request, source, output)
            emit(output, "completed", result, request_id)
        except ValueError:
            if request_id is None:
                return 1
            emit(output, "error", {"code": "INFERENCE_FAILED", "retryable": False}, request_id)
        except Exception as error:
            print("TTS request: " + type(error).__name__, file=sys.stderr)
            if os.environ.get("LIVE2D_TTS_DIAGNOSTICS") == "1":
                import traceback
                traceback.print_exc(file=sys.stderr)
            emit(output, "error", {"code": "OUT_OF_MEMORY" if "out of memory" in str(error).lower() else "INFERENCE_FAILED", "retryable": True}, request_id)


if __name__ == "__main__":
    raise SystemExit(main())
