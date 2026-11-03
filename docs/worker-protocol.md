# Speech worker protocol v1

## Scope

The SenseVoice and CosyVoice3 Python workers exchange versioned NDJSON with the Electron host. The host owns single-request lifecycle, sequence validation, backpressure, stale-result filtering and confirmed shutdown.

Windows system speech uses a separate single-request PowerShell JSON bridge, not this Python protocol.

Definitions are in `packages/contracts/worker.schema.json` and `packages/contracts/protocol.py`. The TTS worker uses a standard-library adapter so it does not need developer-tool dependencies in its CUDA environment.

## Transport

- stdin/stdout use UTF-8 NDJSON, one newline-terminated frame per message. Logs go to stderr.
- The general encoded-frame limit is 3 MiB. Reads must be bounded; malformed or oversized frames end the session.
- TTS control requests are limited to 16 KiB; the host's received TTS frame limit is 360,000 bytes.
- Request IDs contain letters, digits, underscores or hyphens, with length 1–100.
- Every frame contains only `version`, `type`, `requestId` and `payload`. Unknown fields, versions, types or directions are rejected.
- `ready` and startup errors may use a null request ID. Other events identify their request.

```json
{"version":1,"type":"synthesize","requestId":"tts-1","payload":{"text":"Hello.","profileId":"official-demo","stream":true}}
```

## Messages

| Direction | Type | Payload and meaning |
| --- | --- | --- |
| Host to worker | `health` | Empty object; success returns `completed`. |
| Host to worker | `shutdown` | Empty object; clean up, return `completed` and exit. The host also confirms process exit. |
| Host to ASR | `transcribe` | Base64 PCM WAV `audio`; `language` is auto/zh/en/ja/ko/yue. |
| Host to TTS | `synthesize` | Nonblank `text`, 1–600 characters without control tags; `profileId`; boolean `stream`. |
| Host to TTS | `chunk-ack` | Original synthesis request ID and `index`; confirms admission to the bounded queue. No separate response. |
| Host to TTS | `prepare-profile` / `use-profile` | `profileId` is official-demo or a restricted UUID profile identifier. The official profile supports use only. |
| Worker to host | `ready` | `worker` is asr/tts; `capabilities` declares transcribe/synthesize/audioChunks/voiceProfiles. |
| ASR to host | `transcript` | `text` of at most 4000 characters; empty text is allowed. |
| TTS to host | `audio-chunk` | Sequential `index` from 0–127; `audio` is one independently valid Base64 PCM WAV. |
| TTS to host | `profile-ready` | Matching `profileId`, followed by `completed`. |
| Worker to host | `completed` | Empty object for ASR/control; synthesis may include restricted timing, duration, chunk-count and peak-CUDA metrics. Does not mean playback has finished. |
| Worker to host | `error` | Fixed `code` and boolean `retryable`; no raw exception, stack trace or credential data. |

Recognition emits `transcript` then `completed`. Synthesis emits ordered chunks then `completed`. An error terminates that request. Chunked delivery waits for host acknowledgment before sending the next chunk.

ASR startup/request/exit limits are 90 seconds, 120 seconds and 2.5 seconds. TTS limits are 180 seconds, 120 seconds and 5 seconds. Both support one active request and release after roughly 120 seconds idle.

## Audio bounds

ASR input is 16 kHz mono PCM16 WAV, 0.4–60 seconds, at most 1,920,044 bytes. The byte allowance assumes a standard 44-byte WAV header.

Each TTS chunk is at most 262,144 bytes, 8–96 kHz mono or stereo PCM16 WAV. Base64, RIFF lengths and PCM alignment are validated. Silence is valid; envelope normalization must handle it without division by zero.

The waiting playback queue holds at most two chunks, plus the current playing chunk and one in delivery. A complete narration is limited to 128 chunks and 5,000,000 bytes. Disabling streaming does not bypass these limits.

## Cancellation and errors

There is no inference-preempting `cancel` command in v1. The host invalidates the request, stops playback and clears the queue; when necessary it terminates the worker, confirms exit and starts a new one on demand. Late events cannot reenter playback.

Error codes are INVALID_REQUEST, RESOURCE_MISSING, ENGINE_LOAD, INFERENCE_FAILED, OUT_OF_MEMORY, TIMEOUT, CANCELLED and INTERNAL. `retryable` is advisory and must not create infinite retry loops.

Renderer code calls explicit preload methods rather than writing worker frames or supplying executable commands. IPC implementation is in `apps/desktop/lib/ipc.cjs`.
