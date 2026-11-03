# Configuration reference

This reference covers advanced JSON fields and resource manifests. Normal setup is available in the application's connection, resource and voice settings.

## Initial configuration and overrides

The desktop reads `LIVE2D_CONFIG` when set; otherwise it uses `configs/v2.local.json` if present, then `configs/v2.example.json`.

Per-user `model-settings.json` replaces the initial `llm` object. Per-user `resource-settings.json` replaces the initial `runtime` and `resources` objects and supplies the CosyVoice3 verification receipt. Change installed resources through resource management when these overrides exist.

JSON files are limited to 64 KiB. Duplicate keys, comments, trailing commas, non-finite numbers and unknown fields are rejected. The contract is defined in `packages/contracts/config.schema.json`.

## Configuration fields

| Field | Meaning and constraints |
| --- | --- |
| `schemaVersion` | Required; currently `1`. |
| `llm.baseUrl` | HTTP(S) Chat Completions base URL, at most 2048 characters. Hosts are restricted to localhost, 127.0.0.1 and ::1. Credentials, query strings and fragments are rejected. |
| `llm.model` | Model identifier, at most 200 characters. The example leaves it empty; select a model before sending messages. |
| `llm.apiKeyEnv` | Name of an environment variable containing an optional local-server credential; 1–100 uppercase letters, digits or underscores, starting with a letter or underscore. Never put the credential itself in JSON. |
| `llm.timeoutSeconds` | Integer, 1–300; default example: 60. |
| `llm.contextTokens` | Integer, 1024–1048576; default example: 8192. The host uses a reserved UTF-8 byte estimate, not a model-specific tokenizer, and retains recent complete turns. |
| `runtime.asrPython` | Python executable or null. Null uses the source checkout's `.venv-asr/Scripts/python.exe`. |
| `runtime.ttsPython` | Python executable or null. Null uses `venv/Scripts/python.exe` under the configured CosyVoice3 root. Windows system speech does not use this field. |
| `resources.legacyRoot` | Required resource root. Relative paths resolve from the initial configuration file's directory. |
| `resources.avatarRoot` | Optional independent avatar root; null or omitted uses `legacyRoot`. Relative paths resolve from the initial configuration directory. |
| `resources.avatarModel` | Required model3 entry relative to the selected avatar root. Its moc3, PNG and optional physics references must stay within the model directory. |
| `resources.asrModel` | Optional SenseVoice directory, absolute or relative to `legacyRoot`. Omitted uses `ASR_env/SenseVoice/models/SenseVoiceSmall`. Resource installation saves an absolute directory. |
| `resources.cosyvoiceRoot` | Optional root containing `source/model/venv`, or null. Relative paths resolve from the initial configuration directory. |
| `audio.maxRecordingSeconds` | Integer, 1–60. Recordings shorter than 0.4 seconds are rejected. |
| `audio.volume` | Number, 0–1. The desktop saves subsequent user changes separately. |

Interpreter and resource path strings must be nonempty when supplied and cannot contain control characters. Paths have a maximum length of 4096 characters.

## User data

Windows defaults to `%APPDATA%/Live2D-LLM-Chat`.

| File or directory | Purpose |
| --- | --- |
| `conversations.sqlite` | Conversations, messages, completion state and imported archives. |
| `model-settings.json` | Saved model endpoint, identifier, timeout, context budget and credential variable name. |
| `resource-settings.json` | Saved runtime/resource objects and receipt path. |
| `resources/<kind>/<uuid>/` | Verified installed avatar/ASR files. |
| `speech-settings.json` | Narration toggle and volume. |
| `voice-settings.json` | Backend, selected profile and chunking preference. |
| `voice-profiles/voice-<UUID>/` | Reference WAV, profile metadata and cached `prompt.pt`. |
| `backups/` | SQLite snapshots created before legacy history import. |

Source configuration is not rewritten when UI settings change. A CosyVoice3 receipt saved by resource management takes precedence over the CLI's adjacent `*.cosyvoice-verified.json` receipt.

## Resource manifest

A local installable directory must contain `resource.json` with exactly these fields:

| Field | Accepted value |
| --- | --- |
| `schemaVersion` | `1` |
| `kind` | `avatar` or `asr` |
| `id` | 1–64 lowercase letters, digits or hyphens |
| `label` | String of at most 80 characters |
| `redistribution` | `review-required` or `upstream-license`; this label does not grant rights |
| `entry` | Listed model3 path for avatars; `model` for ASR |
| `files` | 1–128 records, each containing only `path`, positive integer `bytes` and lowercase SHA-256 `sha256` |

Paths use forward slashes and restricted ASCII filenames. Absolute paths, parent traversal, symlinks, reserved Windows names and case-insensitive duplicates are rejected. Total listed content is limited to 64 MiB for avatars or 1536 MiB for ASR.

Avatar packs must list all required model references. The current renderer supports model3, moc3, PNG and optional physics; motion, expression and pose libraries are not loaded. ASR packs must exactly match the names, lengths and hashes in `packages/contracts/asr-assets.lock.json`.

Generate a pack from existing files:

```powershell
pnpm pack:avatar
node tools/build-resource-pack.cjs avatar <new-output-directory> <model3-json-path>
pnpm pack:asr
```

The output directory must not already exist. Packing copies model files; it is not needed on every launch.

## CosyVoice3 environment contract

`workers/tts/assets.lock.json` defines the exact engine, Matcha and model revisions, allowed model files and hashes. Dependency inputs are in `requirements/tts-win-cu121.txt`, with the recorded dependency set in `requirements/tts-win-cu121.lock.txt`. These files do not install CUDA drivers or download model weights.

For source configuration, validate an existing environment with the independent tools interpreter:

```powershell
./.venv-v2/Scripts/python.exe -m tools.prepare_cosyvoice --root C:/Models/voice-cosyvoice3 --config configs/v2.local.json
```

The command checks source revisions and model hashes, then saves configuration and a verification receipt. It does not download missing files. The desktop can perform the same connection through its native folder picker and stores its receipt under user data.

## Diagnostics and development commands

```powershell
./.venv-v2/Scripts/python.exe -m tools.doctor --config configs/v2.local.json --json
./.venv-v2/Scripts/python.exe -m pytest -q
pnpm test:desktop
pnpm build:release
```

The read-only doctor inspects the supplied initial configuration, not saved desktop overrides. Its avatar check still follows `legacyRoot/avatarModel`, so it can differ from an installed avatar using `avatarRoot`. File presence does not prove full integrity, rendering or successful inference.
