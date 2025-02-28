
# 本文件基于 Alibaba Inc 的原始代码(webui)修改
# 原作者: Xiang Lyu, Liu Yue
# 修改者: suzuran0y
# 主要修改内容:
# 1. 添加生成语音历史存档功能
# 2. 增加语音数据清除方式：自定义文件清除或归档
# 3. 修改生成语音文件打开方式，允许直接保存生成文件
# 4. 对于长文本下分段生成的语音文件，合并为单一文件

import os
import sys
import argparse
import gradio as gr
import numpy as np
import torch
import torchaudio
import random
import librosa
import soundfile as sf
import shutil
import datetime
from pydub import AudioSegment  # 用于合并音频
from config import Config

# 配置文件清理方式（delete: 删除 | move: 归档）
CLEANUP_MODE = Config.CLEANUP_MODE  # "delete" 或 "move"

# 设定保存目录和历史归档目录
SAVE_DIR = Config.WEBUI_SAVE_DIR
HISTORY_DIR = Config.WEBUI_HISTORY_DIR
MODEL_DIR = Config.WEBUI_MODEL_DIR
# 确保目录存在
os.makedirs(SAVE_DIR, exist_ok=True)
os.makedirs(HISTORY_DIR, exist_ok=True)

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append('{}/third_party/Matcha-TTS'.format(ROOT_DIR))
from cosyvoice.cli.cosyvoice import CosyVoice, CosyVoice2
from cosyvoice.utils.file_utils import load_wav, logging
from cosyvoice.utils.common import set_all_random_seed
inference_mode_list = ['预训练音色', '3s极速复刻', '跨语种复刻', '自然语言控制']
instruct_dict = {'预训练音色': '1. 选择预训练音色\n2. 点击生成音频按钮',
                 '3s极速复刻': '1. 选择prompt音频文件，或录入prompt音频，注意不超过30s，若同时提供，优先选择prompt音频文件\n2. 输入prompt文本\n3. 点击生成音频按钮',
                 '跨语种复刻': '1. 选择prompt音频文件，或录入prompt音频，注意不超过30s，若同时提供，优先选择prompt音频文件\n2. 点击生成音频按钮',
                 '自然语言控制': '1. 选择预训练音色\n2. 输入instruct文本\n3. 点击生成音频按钮'}
stream_mode_list = [('否', False), ('是', True)]
max_val = 0.8


# 在新任务开始时，清理或归档旧音频
def cleanup_old_audio():
    files = os.listdir(SAVE_DIR)
    if not files:
        return

    if CLEANUP_MODE == "delete":
        for file in files:
            file_path = os.path.join(SAVE_DIR, file)
            try:
                os.remove(file_path)
#                print(f"已删除旧音频: {file}")
            except Exception as e:
                print(f"无法删除 {file}: {e}")

    elif CLEANUP_MODE == "move":
        for file in files:
            old_path = os.path.join(SAVE_DIR, file)
            new_path = os.path.join(HISTORY_DIR, file)
            try:
                shutil.move(old_path, new_path)
#                print(f"已归档旧音频: {file} -> {HISTORY_DIR}")
            except Exception as e:
                print(f"无法归档 {file}: {e}")

def generate_seed():
    seed = random.randint(1, 100000000)
    return {
        "__type__": "update",
        "value": seed
    }


def postprocess(speech, top_db=60, hop_length=220, win_length=440):
    speech, _ = librosa.effects.trim(
        speech, top_db=top_db,
        frame_length=win_length,
        hop_length=hop_length
    )
    if speech.abs().max() > max_val:
        speech = speech / speech.abs().max() * max_val
    speech = torch.concat([speech, torch.zeros(1, int(cosyvoice.sample_rate * 0.2))], dim=1)
    return speech


def change_instruction(mode_checkbox_group):
    return instruct_dict[mode_checkbox_group]

# 将多个音频片段合并为一个完整音频文件
def merge_audio_files(file_list, output_path):
    if len(file_list) == 1:
#        print("只有一个音频文件，无需合并")
        shutil.move(file_list[0], output_path)  # 直接重命名并移动到最终目录
        return output_path

#    print(f"需要合并 {len(file_list)} 个音频文件...")

    combined = AudioSegment.empty()

    for file in sorted(file_list):
        audio_segment = AudioSegment.from_wav(file)
        combined += audio_segment

    combined.export(output_path, format="wav")
#    print(f"所有音频片段已合并，最终音频文件: {output_path}")

    # 删除分段音频文件
    for file in file_list:
        os.remove(file)
#        print(f"已删除分段音频文件: {file}")

    return output_path


def generate_audio(tts_text, mode_checkbox_group, sft_dropdown, prompt_text, prompt_wav_upload, prompt_wav_record, instruct_text,
                   seed, stream, speed):
    # 在新任务开始时，清理或归档旧文件
    cleanup_old_audio()
    # 获取当前时间戳，用作文件名
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    final_output_path = os.path.join(SAVE_DIR, f"{timestamp}.wav")
    # 存储所有生成的音频片段
    generated_files = []

    set_all_random_seed(seed)

    def save_audio(audio_data):
        """ 保存音频（临时存储，不复制到自定义目录） """
        temp_filename = f"temp_{len(generated_files) + 1}.wav"  # 统一使用 `temp_x.wav` 避免混淆
        temp_output_path = os.path.join(SAVE_DIR, temp_filename)

        with sf.SoundFile(temp_output_path, 'w', samplerate=cosyvoice.sample_rate, channels=1) as f:
            f.write(audio_data)

        generated_files.append(temp_output_path)  # 记录生成的音频文件
#        print(f"生成的音频文件: {temp_output_path}")

    if prompt_wav_upload is not None:
        prompt_wav = prompt_wav_upload
    elif prompt_wav_record is not None:
        prompt_wav = prompt_wav_record
    else:
        prompt_wav = None
    # if instruct mode, please make sure that model is iic/CosyVoice-300M-Instruct and not cross_lingual mode
    if mode_checkbox_group in ['自然语言控制']:
        if cosyvoice.instruct is False:
            gr.Warning('您正在使用自然语言控制模式, {}模型不支持此模式, 请使用iic/CosyVoice-300M-Instruct模型'.format(args.model_dir))
            yield (cosyvoice.sample_rate, default_data)
        if instruct_text == '':
            gr.Warning('您正在使用自然语言控制模式, 请输入instruct文本')
            yield (cosyvoice.sample_rate, default_data)
        if prompt_wav is not None or prompt_text != '':
            gr.Info('您正在使用自然语言控制模式, prompt音频/prompt文本会被忽略')
    # if cross_lingual mode, please make sure that model is iic/CosyVoice-300M and tts_text prompt_text are different language
    if mode_checkbox_group in ['跨语种复刻']:
        if cosyvoice.instruct is True:
            gr.Warning('您正在使用跨语种复刻模式, {}模型不支持此模式, 请使用iic/CosyVoice-300M模型'.format(args.model_dir))
            yield (cosyvoice.sample_rate, default_data)
        if instruct_text != '':
            gr.Info('您正在使用跨语种复刻模式, instruct文本会被忽略')
        if prompt_wav is None:
            gr.Warning('您正在使用跨语种复刻模式, 请提供prompt音频')
            yield (cosyvoice.sample_rate, default_data)
        gr.Info('您正在使用跨语种复刻模式, 请确保合成文本和prompt文本为不同语言')
    # if in zero_shot cross_lingual, please make sure that prompt_text and prompt_wav meets requirements
    if mode_checkbox_group in ['3s极速复刻', '跨语种复刻']:
        if prompt_wav is None:
            gr.Warning('prompt音频为空，您是否忘记输入prompt音频？')
            yield (cosyvoice.sample_rate, default_data)
        if torchaudio.info(prompt_wav).sample_rate < prompt_sr:
            gr.Warning('prompt音频采样率{}低于{}'.format(torchaudio.info(prompt_wav).sample_rate, prompt_sr))
            yield (cosyvoice.sample_rate, default_data)
    # sft mode only use sft_dropdown
    if mode_checkbox_group in ['预训练音色']:
        if instruct_text != '' or prompt_wav is not None or prompt_text != '':
            gr.Info('您正在使用预训练音色模式，prompt文本/prompt音频/instruct文本会被忽略！')
        if sft_dropdown == '':
            gr.Warning('没有可用的预训练音色！')
            yield (cosyvoice.sample_rate, default_data)
    # zero_shot mode only use prompt_wav prompt text
    if mode_checkbox_group in ['3s极速复刻']:
        if prompt_text == '':
            gr.Warning('prompt文本为空，您是否忘记输入prompt文本？')
            yield (cosyvoice.sample_rate, default_data)
        if instruct_text != '':
            gr.Info('您正在使用3s极速复刻模式，预训练音色/instruct文本会被忽略！')

    if mode_checkbox_group == '预训练音色':
        logging.info('get sft inference request')
        for i in cosyvoice.inference_sft(tts_text, sft_dropdown, stream=stream, speed=speed):
            audio_data = i['tts_speech'].numpy().flatten()
            yield cosyvoice.sample_rate, audio_data
            save_audio(audio_data)

    elif mode_checkbox_group == '3s极速复刻':
        logging.info('get zero_shot inference request')
        prompt_speech_16k = postprocess(load_wav(prompt_wav, prompt_sr))
        for i in cosyvoice.inference_zero_shot(tts_text, prompt_text, prompt_speech_16k, stream=stream, speed=speed):
            audio_data = i['tts_speech'].numpy().flatten()
            yield cosyvoice.sample_rate, audio_data
            save_audio(audio_data)

    elif mode_checkbox_group == '跨语种复刻':
        logging.info('get cross_lingual inference request')
        prompt_speech_16k = postprocess(load_wav(prompt_wav, prompt_sr))
        for i in cosyvoice.inference_cross_lingual(tts_text, prompt_speech_16k, stream=stream, speed=speed):
            audio_data = i['tts_speech'].numpy().flatten()
            yield (cosyvoice.sample_rate, audio_data)
            save_audio(audio_data)

    else:
        logging.info('get instruct inference request')
        for i in cosyvoice.inference_instruct(tts_text, sft_dropdown, instruct_text, stream=stream, speed=speed):
            audio_data = i['tts_speech'].numpy().flatten()
            yield (cosyvoice.sample_rate, audio_data)
            save_audio(audio_data)

        # 合并多个音频文件（如果有多个,否则无变化）
    final_output = merge_audio_files(generated_files, final_output_path)
#    print(f"最终合成的完整音频文件: {final_output}")

def main():
    with gr.Blocks() as demo:
        gr.Markdown("### 代码库 [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) \
                    预训练模型 [CosyVoice-300M](https://www.modelscope.cn/models/iic/CosyVoice-300M) \
                    [CosyVoice-300M-Instruct](https://www.modelscope.cn/models/iic/CosyVoice-300M-Instruct) \
                    [CosyVoice-300M-SFT](https://www.modelscope.cn/models/iic/CosyVoice-300M-SFT)")
        gr.Markdown("#### 请输入需要合成的文本，选择推理模式，并按照提示步骤进行操作")

        tts_text = gr.Textbox(label="输入合成文本", lines=1, value="我是通义实验室语音团队全新推出的生成式语音大模型，提供舒适自然的语音合成能力。")
        with gr.Row():
            mode_checkbox_group = gr.Radio(choices=inference_mode_list, label='选择推理模式', value=inference_mode_list[0])
            instruction_text = gr.Text(label="操作步骤", value=instruct_dict[inference_mode_list[0]], scale=0.5)
            sft_dropdown = gr.Dropdown(choices=sft_spk, label='选择预训练音色', value=sft_spk[0], scale=0.25)
            stream = gr.Radio(choices=stream_mode_list, label='是否流式推理', value=stream_mode_list[0][1])
            speed = gr.Number(value=1, label="速度调节(仅支持非流式推理)", minimum=0.5, maximum=2.0, step=0.1)
            with gr.Column(scale=0.25):
                seed_button = gr.Button(value="\U0001F3B2")
                seed = gr.Number(value=0, label="随机推理种子")

        with gr.Row():
            prompt_wav_upload = gr.Audio(sources='upload', type='filepath', label='选择prompt音频文件，注意采样率不低于16khz')
            prompt_wav_record = gr.Audio(sources='microphone', type='filepath', label='录制prompt音频文件')
        prompt_text = gr.Textbox(label="输入prompt文本", lines=1, placeholder="请输入prompt文本，需与prompt音频内容一致，暂时不支持自动识别...", value='')
        instruct_text = gr.Textbox(label="输入instruct文本", lines=1, placeholder="请输入instruct文本.", value='')

        generate_button = gr.Button("生成音频")

#        audio_output = gr.Audio(label="合成音频", autoplay=True, streaming=True)
        audio_output = gr.Audio(label="合成音频", streaming=False) # streaming=False 能够下载音频

        seed_button.click(generate_seed, inputs=[], outputs=seed)
        generate_button.click(generate_audio,
                              inputs=[tts_text, mode_checkbox_group, sft_dropdown, prompt_text, prompt_wav_upload, prompt_wav_record, instruct_text,
                                      seed, stream, speed],
                              outputs=[audio_output])
        mode_checkbox_group.change(fn=change_instruction, inputs=[mode_checkbox_group], outputs=[instruction_text])
    demo.queue(max_size=4, default_concurrency_limit=2)
    demo.launch(server_name='0.0.0.0', server_port=args.port)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',
                        type=int,
                        default=8000)
    parser.add_argument('--model_dir',
                        type=str,
                        default=MODEL_DIR,
                        help='local path or modelscope repo id')
    args = parser.parse_args()
    try:
        cosyvoice = CosyVoice(args.model_dir)
    except Exception:
        try:
            cosyvoice = CosyVoice2(args.model_dir)
        except Exception:
            raise TypeError('no valid model_type!')

    sft_spk = cosyvoice.list_available_spks()
    if len(sft_spk) == 0:
        sft_spk = ['']
    prompt_sr = 16000
    default_data = np.zeros(cosyvoice.sample_rate)
    main()
