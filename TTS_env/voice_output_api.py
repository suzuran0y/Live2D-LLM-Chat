
# 单独调用CosyVoice模型的api接口 需要预先运行 webui.py 启动模型

from gradio_client import Client, handle_file

training_sample_dir = "" # 替换为需要训练音色的音频文本所在地址
output_text_dir = "" # 替换为想要训练后的音色进行输出的音频文本所在地址
training_voice_dir = "" # 替换为需要训练音色的音频文件所在地址

# 载入需要训练音色的音频文本
with open(training_sample_dir, "r", encoding='utf-8') as file:
	content_2 = file.read()
# 载入想要训练后的音色进行输出的音频文本
with open(output_text_dir, "r", encoding='utf-8') as file:
	content_1 = file.read()
# 调用模型
client = Client("http://localhost:8000/") # 该地址为cosyvoice模型自动分配地址，无出错时不改动
result = client.predict(
		tts_text=content_1,
		mode_checkbox_group="3s极速复刻",
		sft_dropdown="",
		prompt_text=content_2,
		prompt_wav_upload=handle_file(training_voice_dir),
		prompt_wav_record=handle_file(training_voice_dir),
		instruct_text="",
		seed=0,
		stream=False,
		speed=1,
		api_name="/generate_audio"
)