# Live2D-LLM-Chat source preview

Electron + Python character chat with SQLite conversations, Live2D rendering, SenseVoice recognition, Windows speech and optional CosyVoice3.

## Start from source

Use Node 22.12+ and pnpm 11.25.0:

```powershell
pnpm install --frozen-lockfile
pnpm setup:desktop
```

For avatar rendering, prepare the pinned SDK using PowerShell 7:

```powershell
pwsh -NoProfile -File ./tools/prepare-avatar-sdk.ps1
```

The source ZIP omits proprietary Cubism Core. Avatar assets, speech weights and Python environments are prepared separately. Text chat and Windows speech can run without avatar resources.

```powershell
pnpm start
```

Load a model in a local compatible service such as LM Studio. Save its base URL and model identifier in connection settings. Only loopback endpoints are accepted.

## Optional speech and resources

Use resource management to install an extracted avatar/ASR pack containing `resource.json`. Select an ASR interpreter with the recognition dependencies, or connect an existing CosyVoice3 root containing `source/model/venv`.

ASR uses a separate CPU Python environment. CosyVoice3 uses Python 3.11 and matching CUDA dependencies; it does not share the ASR environment. Windows speech requires neither.

Use voice settings to select a backend and preview it. Enable narration for future successful replies. F8 starts/finishes recording within the application; stop response cancels active work and playback.

Detailed JSON fields and resource-manifest parameters are in the [configuration reference](configuration.md).

## Packaging

```powershell
pnpm build:release
```

The release tool separates the desktop runtime from model assets and excludes local notes, weights, environments, private data and local configuration. Existing ZIPs are snapshots; editing source documentation does not alter them.

Original licenses and provenance remain with each component. The preview does not grant redistribution rights for character assets or speech models.
