from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

model_dir = "E:/PyCharm/project/project1/ASR_env/SenseVoice/models/SenseVoiceSmall" # 替换为AST模型所在地址
voice_dir = "E:/PyCharm/project/project1/ASR_env/input_voice/voice.wav" # 替换为音频文件所在地址

model = AutoModel(
    model=model_dir,
    trust_remote_code=False,
#    remote_code="./model.py",
#    vad_model="fsmn-vad",
#    vad_kwargs={"max_single_segment_time": 30000},
    device="cuda:0",
    disable_update=True
)

# en
res = model.generate(
    input=voice_dir,#f"{model.model_path}/example/zh.mp3",
    cache={},
    language="auto",  # "zh", "en", "yue", "ja", "ko", "nospeech"
    use_itn=True,
    batch_size_s=60,
    merge_vad=True,
    merge_length_s=15,
)
text = rich_transcription_postprocess(res[0]["text"])
print(text)