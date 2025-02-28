
import threading
import datetime
from TTS_api import TTSAPIManager
from ASR import ASRManager
from TTS import TTSManager
from LLM import LLMManager
from Live2d_animation import Live2DAnimationManager
from config import Config

class MainManager:
    def __init__(self):

        # 初始化主管理器，整合 TTS_API, TTS, ASR, LLM, Live2D

        # 启动 TTS API 并确保 API 可用
        self.tts_api_manager = TTSAPIManager(Config.SHOW_WINDOW)
        api_ready = self.tts_api_manager.start_tts_api()
        if not api_ready:
            print("TTS API 启动失败，程序终止！")
            return

        # 初始化其他模块
        self.asr_manager = ASRManager()
        self.tts_manager = TTSManager()
        self.llm_manager = LLMManager()
        self.live2d_manager = Live2DAnimationManager(
            model_path=Config.LIVE2D_MODEL_PATH
        )

        self.history_file = Config.LLM_CONVERSATION_HISTORY

        # 启动 Live2D 窗口（确保一直运行）
        live2d_thread = threading.Thread(target=self.live2d_manager.play_live2d_once)
        live2d_thread.start()

    def run(self):
        while True:
            user_wav = Config.ASR_AUDIO_INPUT
            self.asr_manager.record_audio(user_wav)
            user_input = self.asr_manager.recognize_speech(user_wav)
            print(f">>> {user_input}")

            if user_input.lower() in ("exit。", "quit。", "q。", "结束。", "再见。"):
                print("已退出对话。")
                break

            reply = self.llm_manager.chat_once(user_input)
            output_wav = self.tts_manager.synthesize(reply)

            self.live2d_manager.play_audio_and_print_mouth(output_wav)

            with open(self.history_file, 'a', encoding='utf-8') as f:
                timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                f.write(f"Time：{timestamp}\n")
                f.write(f"User：{user_input}\nNeko：{reply}\n---\n")
if __name__ == "__main__":
    main_manager = MainManager()
    main_manager.run()
