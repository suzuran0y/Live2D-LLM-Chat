
import os
import time
import shutil
from gradio_client import Client, handle_file
import pygame
from config import Config


class TTSManager:
    def __init__(self, api_url=Config.TTS_API_URL):
        # 初始化 TTS 管理器:param api_url: TTS 服务器 API 地址
        self.api_url = api_url
        self.client = Client(api_url)
        self.output_dir = Config.TTS_OUTPUT_DIR
        self.history_dir = Config.TTS_HISTORY_DIR
        self.prompt_text_path = Config.TTS_PROMPT_TEXT
        self.prompt_wav_path = Config.TTS_PROMPT_WAV

        # 确保目录存在
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.history_dir, exist_ok=True)

    def clear_output_directory(self):
        # 在每次生成 TTS 音频之前，先检查 output_voice 目录是否有旧文件，如果有，则移动到 voice_history 目录，确保目录下只有最新的音频。
        pygame.mixer.init()
        pygame.mixer.music.stop()
        pygame.mixer.quit()
        audio_files = [f for f in os.listdir(self.output_dir) if f.endswith(".wav")]

        if not audio_files:
            return  # 没有文件需要移动

        for file in audio_files:
            old_path = os.path.join(self.output_dir, file)
            new_path = os.path.join(self.history_dir, file)

            try:
                shutil.move(old_path, new_path)
                # print(f"旧音频文件已归档: {file} -> {self.history_dir}")
            except Exception as e:
                print(f"无法移动 {file} 到历史目录: {e}")

    def synthesize(self, text, mode="3s极速复刻"):
        # 调用 TTS 生成语音，并确保 output_voice 目录是空的
        # param text: 要转换为语音的文本
        # param mode: TTS 模式（默认 3s 极速复刻）
        # return: 生成的音频文件路径

        # 清理 output_voice 目录
        self.clear_output_directory()

        # 读取语音克隆样本文本
        with open(self.prompt_text_path, "r", encoding="utf-8") as file:
            prompt_text = file.read()

        start_time = time.time()
        self.client.predict(
            tts_text=text,
            mode_checkbox_group=mode,
            sft_dropdown="",
            prompt_text=prompt_text,
            prompt_wav_upload=handle_file(self.prompt_wav_path),
            prompt_wav_record=handle_file(self.prompt_wav_path),
            instruct_text="",
            seed=0,
            stream=False,
            speed=1,
            api_name="/generate_audio"
        )
        print(f"TTS 处理耗时: {time.time() - start_time:.2f} 秒")

        # 获取最新的音频文件
        return self.get_latest_audio()

    def get_latest_audio(self):
        # 获取 output_voice 目录下最新生成的音频文件
        # return: 最新音频文件路径或 None
        audio_files = [f for f in os.listdir(self.output_dir) if f.endswith(".wav")]

        if not audio_files:
            print("没有找到音频文件！")
            return None

        # 按修改时间排序，取最新的
        audio_files.sort(key=lambda x: os.path.getmtime(os.path.join(self.output_dir, x)), reverse=True)
        latest_audio = os.path.join(self.output_dir, audio_files[0])

        # print(f"最新音频文件: {latest_audio}")
        return latest_audio
