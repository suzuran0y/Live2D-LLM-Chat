$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$inputLine = [Console]::In.ReadLine()
try {
    if (-not $inputLine -or $inputLine.Length -gt 4096) { throw 'Invalid request' }
    $request = $inputLine | ConvertFrom-Json
    if ($request.action -notin @('voices', 'synthesize')) { throw 'Invalid action' }
    if ($request.action -eq 'synthesize' -and ($request.text -isnot [string] -or -not $request.text.Trim() -or $request.text.Length -gt 180)) { throw 'Invalid text' }
    try {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $voiceType = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
        $streamType = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
        $voices = @($voiceType::AllVoices | ForEach-Object { @{ name=$_.DisplayName; culture=$_.Language } })
        if ($request.action -eq 'voices') { $result = @{ voices=$voices; backend='winrt' } }
        else {
            $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
            try {
                $voice = @($voiceType::AllVoices | Where-Object { $_.Language -like 'zh-*' } | Select-Object -First 1)
                if ($voice.Count) { $synth.Voice = $voice[0] }
                $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
                $task = $method.MakeGenericMethod($streamType).Invoke($null, @($synth.SynthesizeTextToStreamAsync($request.text)))
                $speechStream = $task.GetAwaiter().GetResult()
                try {
                    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($speechStream.GetInputStreamAt(0))
                    $memory = New-Object IO.MemoryStream
                    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() }
                    finally { $memory.Dispose(); $stream.Dispose() }
                    if ($bytes.Length -gt 5000000) { throw 'Audio too large' }
                    $result = @{ audio=[Convert]::ToBase64String($bytes); voice=$synth.Voice.DisplayName; culture=$synth.Voice.Language; backend='winrt' }
                } finally { $speechStream.Dispose() }
            } finally { $synth.Dispose() }
        }
    } catch {
        Add-Type -AssemblyName System.Speech
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        try {
            if ($request.action -eq 'voices') {
                $result = @{ voices=@($synth.GetInstalledVoices() | ForEach-Object { @{name=$_.VoiceInfo.Name;culture=$_.VoiceInfo.Culture.Name} }); backend='system-speech' }
            } else {
                $chinese = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'zh-*' } | Select-Object -First 1
                if ($chinese) { $synth.SelectVoice($chinese.VoiceInfo.Name) }
                $memory = New-Object IO.MemoryStream
                try {
                    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
                    $synth.SetOutputToWaveStream($memory, $format); $synth.Speak($request.text)
                    $bytes = $memory.ToArray()
                    if ($bytes.Length -gt 5000000) { throw 'Audio too large' }
                    $result = @{audio=[Convert]::ToBase64String($bytes);voice=$synth.Voice.Name;culture=$synth.Voice.Culture.Name;backend='system-speech'}
                } finally { $memory.Dispose() }
            }
        } finally { $synth.Dispose() }
    }
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Depth 5 -Compress))
} catch { [Console]::Out.WriteLine('{"error":"SYNTHESIS_FAILED"}'); exit 1 }
