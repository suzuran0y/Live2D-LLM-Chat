
import subprocess
import time
import requests
from config import Config
import os

class TTSAPIManager:
    def __init__(self, show_window=Config.SHOW_WINDOW):
        # 初始化 TTS API 管理器:param show_window: 是否显示 TTS API 窗口
        self.webui_python = Config.WEBUI_PYTHON
        self.webui_script = Config.WEBUI_SCRIPT
        self.api_url = Config.TTS_API_URL
        self.timeout = 300  # 最大等待时间（秒）
        self.show_window = show_window
        self.env = self._configure_env()

    def _configure_env(self):
        # 配置 Conda 环境变量
        env = os.environ.copy()
        env["CONDA_PREFIX"] = Config.MINICONDA_PATH
        env["PATH"] = f"{Config.MINICONDA_PATH}/Scripts;{Config.MINICONDA_PATH}/Library/bin;{env['PATH']}"
        env["PYTHONPATH"] = env.get("PYTHONPATH", "") + f";{Config.PROJECT_ROOT}/TTS_env/CosyVoice/third_party/Matcha-TTS"
        env["PATH"] += f";{Config.PROJECT_ROOT}/TTS_env/CosyVoice/third_party/Matcha-TTS"
        return env

    def start_tts_api(self):
        # 启动 TTS API 并等待其加载
        print("启动 webui.py，并确保 Conda 变量和 `pretrained_models` 目录正确...")

        try:
            if self.show_window:
                # 创建新窗口运行 WebUI
                self.webui_process = subprocess.Popen(
                    [self.webui_python, self.webui_script],
                    env=self.env,
                    stdout=None,
                    stderr=None,
                    creationflags=subprocess.CREATE_NEW_CONSOLE  # 在新窗口中运行
                )
            else:
                # 隐藏窗口运行 WebUI
                self.webui_process = subprocess.Popen(
                    [self.webui_python, self.webui_script],
                    env=self.env,
                    stdout=None,
                    stderr=None,
                    creationflags=subprocess.CREATE_NO_WINDOW  # 隐藏窗口
                )

            print("webui.py 已启动，等待 API 加载...")

            start_time = time.time()
            while time.time() - start_time < self.timeout:
                if self.is_api_available():
                    print("API 启动成功！继续运行主程序...")
                    return True
                time.sleep(5)

            print("API 启动超时，可能无法正常工作。")
            return False

        except Exception as e:
            print(f"启动失败，错误信息: {e}")
            return False

    def is_api_available(self):
        # 检查 TTS API 是否可用
        try:
            response = requests.get(self.api_url, timeout=5)
            return response.status_code == 200
        except requests.exceptions.ConnectionError:
            return False
        except requests.exceptions.Timeout:
            return False

