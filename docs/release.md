# Live2D-LLM-Chat Windows preview

The Windows x64 package includes the Electron runtime. Text chat and Windows speech do not require Node, pnpm or Python. Replies need a separately running local model service such as LM Studio. This preview is unsigned.

## Install and start

Extract the ZIP and open `Live2D-LLM-Chat.exe`, or run the per-user installer from the extracted directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./Install-Live2D.ps1
```

The installer verifies file hashes, copies the application into `%LOCALAPPDATA%/Programs/Live2D-LLM-Chat/<build-id>/` and creates a Start menu shortcut. Administrator privileges are not required. Older version directories are retained. User data is stored separately in `%APPDATA%/Live2D-LLM-Chat`.

Load a model in LM Studio and start its local service. In connection settings, save the base URL, such as `http://127.0.0.1:1234/v1`, then select or enter its model identifier.

Enter sends a message; Shift+Enter inserts a newline. Enable narration to speak subsequent replies. Voice settings offer preview, backend and voice selection. The main window controls volume.

## Optional resources

Avatar assets, recognition/synthesis weights and Python environments are separate from the base package. Text chat and Windows speech remain available without an avatar.

- Select an extracted resource directory containing `resource.json`, preview it and confirm installation. The application checks paths, lengths and SHA-256 before copying files into user data.
- Avatar packs contain model3, moc3, PNG and optional physics files. Obtain permission before redistributing character assets.
- SenseVoiceSmall packs must match the application's locked asset list. Select a Python 3.11/3.12 interpreter with the ASR dependencies installed.
- Connect an existing CosyVoice3 directory containing `source/model/venv`. This references weights in place. Git, Python 3.11 and matching CUDA dependencies are required. The application does not install a fresh speech environment.

For a custom voice, provide its name, transcript and a 3–30 second PCM16 WAV reference, 16–96 kHz, mono or stereo, at most 5 MB. Natural speech can take time to load and may pause between chunks. Windows speech is the lightweight alternative.

## Recording and playback

F8 or the recording button starts/finishes a recording; F8 works within the application. Windows must permit microphone access. Recognition happens after recording, then the transcript is sent as a message.

Stop response cancels recording, recognition, model generation and playback. Normal recording and synthesis audio stays in memory. Recognized text is saved with conversations; custom voice references are retained under user data.

## Legacy history

Select a UTF-8 history text file of at most 5 MiB, review the preview and confirm. The application backs up SQLite before import and deduplicates the original file by SHA-256. The original stays in place.

Recognized legacy speaker formats are displayed as turns. Ambiguous content is retained as a raw archive. Imported archives are excluded from model context. Previews expire after ten minutes.

## Data and licensing

Keep the user data directory if you want to retain conversations, installed resources, settings and custom voices when replacing application files.

The package includes third-party notices. Application licensing does not replace Cubism, character, model or dependency licenses.
