
import time
import wave
import keyboard
import pyaudio
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
from config import Config

class ASRManager:
    def __init__(self, model_dir=Config.ASR_MODEL_DIR, device="cuda:0"):

        # 初始化 ASR 语音识别管理器
        # param model_dir: 语音识别模型路径
        # param device: 使用的计算设备（默认为 GPU）

        self.model = AutoModel(
            model=model_dir,
            trust_remote_code=False,
            device=device,
            disable_update=True
        )
        self.sample_rate = 44100
        self.channels = 1
        self.chunk = 1024
        self.format = pyaudio.paInt16

    def record_audio(self, output_wav_file):

        # 录音功能，按住 `CTRL` 说话，按 `ALT` 结束录音。
        # param output_wav_file: 录制的音频文件路径

        p = pyaudio.PyAudio()
        stream = p.open(
            format=self.format,
            channels=self.channels,
            rate=self.sample_rate,
            input=True,
            frames_per_buffer=self.chunk
        )

        print("[CTRL键] 开口...")
        keyboard.wait('ctrl')
        print("讲话中... [ALT键] 结束...")

        frames = []
        while True:
            data = stream.read(self.chunk)
            frames.append(data)
            if keyboard.is_pressed('alt'):
                print("录音结束，正在处理...")
                break
            time.sleep(0.01)

        stream.stop_stream()
        stream.close()
        p.terminate()

        # 保存音频到文件
        with wave.open(output_wav_file, 'wb') as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(p.get_sample_size(self.format))
            wf.setframerate(self.sample_rate)
            wf.writeframes(b''.join(frames))

    def recognize_speech(self, wav_path):
        start_time = time.time()

        # 进行语音识别，将音频转换为文本。
        # param wav_path: 音频文件路径
        # return: 识别出的文本

        res = self.model.generate(
            input=wav_path,
            language="auto",
            use_itn=True,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )
        print(f"ASR 识别耗时: {time.time() - start_time:.2f} 秒")
        return rich_transcription_postprocess(res[0]["text"])


if __name__ == "__main__":
    asr_manager = ASRManager()
    audio_file = Config.ASR_AUDIO_INPUT

    # 录音
    asr_manager.record_audio(audio_file)

    # 识别语音
    recognized_text = asr_manager.recognize_speech(audio_file)
    print(f"识别结果: {recognized_text}")
