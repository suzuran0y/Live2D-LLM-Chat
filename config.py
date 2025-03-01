import os

# 将自己对应的文件路径替换掉下面的配置文件路径中
class Config:
    # 项目根目录
    PROJECT_ROOT = "E:/PyCharm/project/project1"

    # ASR（自动语音识别）配置
    ASR_MODEL_DIR = os.path.join(PROJECT_ROOT, "ASR_env/SenseVoice/models/SenseVoiceSmall")
    ASR_AUDIO_INPUT = os.path.join(PROJECT_ROOT, "ASR_env/input_voice/voice.wav")

    # TTS（文本转语音）配置
    TTS_API_URL = "http://localhost:8000/" # 该地址为cosyvoice模型自动分配地址，无出错时不改动
    TTS_OUTPUT_DIR = os.path.join(PROJECT_ROOT, "TTS_env/output_voice/")
    TTS_HISTORY_DIR = os.path.join(PROJECT_ROOT, "TTS_env/voice_history/")
    TTS_PROMPT_TEXT = os.path.join(PROJECT_ROOT, "TTS_env/voice_training_sample/text_taiyuan.txt")
    TTS_PROMPT_WAV = os.path.join(PROJECT_ROOT, "TTS_env/voice_training_sample/taiyuan.mp3")

    # TTS API 相关
    MINICONDA_PATH = "E:/miniconda3"
    WEBUI_PYTHON = os.path.join(MINICONDA_PATH, "python.exe")
    WEBUI_SCRIPT = os.path.join(PROJECT_ROOT, "TTS_env/CosyVoice/webui.py")
    CLEANUP_MODE = "move"  # "delete" or "move"; 配置文件清理方式（delete: 删除 | move: 归档）
    SHOW_WINDOW = True

    # LLM（大模型）配置
    # 根据需要调用的模型填入key
    LLM_TMP_DIR = os.path.join(PROJECT_ROOT, "TTS_env/tmp")
    LLM_CONVERSATION_HISTORY = os.path.join(PROJECT_ROOT, "LLM_env/conversation_history.txt")
    openai_key = ""
    deepseek_key = ""
    grop_key = ""
    online_model = "offline" # "online" or "offline" ; 使用本地部署或在线LLM模型（online: 在线模型 | offline: 本地部署模型）
    model_choice = "OpenAI" # "OpenAI" or "deepseek" ; 选择LLM模型（OpenAI | deepseek）
    # 当使用LM Studio进行本地部署LLM时，先下载好需要加载的模型，然后加载完成
    # 查看LM Studio右侧的API Usage页面，找到自己的 API identifier（model name） 例如：deepseek-r1-distill-qwen-14b
    # 接下来查看自己的local server，例如：http://127.0.0.1:1234
    # 修改下面的两个变量
    model_name = "" # "deepseek-r1-distill-qwen-14b"
    api_url = "http://127.0.0.1:1234/v1/chat/completions" # 只需要修改前面的网址部分


    # Live2D 配置
    LIVE2D_MODEL_PATH = os.path.join(PROJECT_ROOT, "Live2d_env/pachirisu anime girl - top half.model3.json")

    # WebUI 相关配置
    WEBUI_SAVE_DIR = os.path.join(PROJECT_ROOT, "TTS_env/output_voice/")
    WEBUI_HISTORY_DIR = os.path.join(PROJECT_ROOT, "TTS_env/voice_history/")
    WEBUI_MODEL_DIR = os.path.join(PROJECT_ROOT, "TTS_env/CosyVoice/pretrained_models/CosyVoice2-0.5B")

# 可用于打印检查配置
if __name__ == "__main__":
    for attr in dir(Config):
        if not attr.startswith("__"):
            print(f"{attr} = {getattr(Config, attr)}")
