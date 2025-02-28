# Live2D-LLM-Chat
[CN 中文](README_CN.md) | [US English](README_EN.md)

![Live2D](https://img.shields.io/badge/Live2D-live2d.v3-blue.svg)
![ASR](https://img.shields.io/badge/ASR-SenseVoice-green.svg)
![LLM](https://img.shields.io/badge/LLM-GPT%2FDeepSeek-red.svg)
![TTS](https://img.shields.io/badge/TTS-CosyVoice-orange.svg)

> **Live2D + ASR + LLM + TTS** → 实时语音互动 | 本地部署 / 云端推理

---
## ✨ 1. 项目简介

**Live2D-LLM-Chat** 是一个集成了**Live2D 虚拟形象**、**语音识别（ASR）**、**大语言模型（LLM）**和**文本转语音（TTS）** 的实时 AI 交互项目。它能够让**虚拟角色**通过语音识别用户的输入，并使用 AI 生成智能回复，同时通过 TTS 播放语音，并驱动 Live2D 动画实现嘴型同步，达到自然的互动体验。

---
### 📌 1.1. 主要功能
- 🎙 **语音识别（ASR）**：使用 FunASR 进行语音转文本 (STT) 处理。
- 🧠 **大语言模型（LLM）**：基于 OpenAI GPT / DeepSeek 提供理性沟通能力。
- 🔊 **文本转语音（TTS）**：使用 CosyVoice 实现高质量的合成语音
- 🏆 **Live2D 虚拟形象交互**：使用 Live2D SDK 渲染角色，并实现模型的实时反馈。

---
### 📌 1.2. 优化功能
- **LLM模块**接口可支持本地与云端部署，本地部署基于**LM Studio**接口，基本涵盖所有已开源模型，但个人设备性能难以运行大体量模型；云端部署接口现已支持**OpenAI**平台接口与**DeepSeek**平台接口。
- 储存模型对话时的前文数据，形成**历史记忆**。每5次对话会进行总结，避免多次对话后文本累计过量的情况。
- 对历次模型对话的时间与内容进行**存档**，便于查找过往对话内容。可存档内容包括模型的**历史语音输出**。该功能可在配置文件中关闭，关闭后再次进行对话时将清除历史对话的语音数据，**减清内存压力**。
- 重构Live2d模型角色的**眼神跟随**与**眨眼逻辑**，即使live2d模型没有内置眨眼逻辑，也可自然眨眼。编写**嘴型变化**逻辑，读取TTS模块输出的音频文件，将实时音频大小转化至live2d模型的嘴型变化。
- 修改CosyVoice模型的API接口程序，改变生成语音文件打开方式，允许**直接保存**生成文件；对于长文本下分段生成的语音文件，**合并**为单一文件。
![Live2D 运行展示](Live2d_env/running_photo.jpg)

#### 🎬 运行效果

| 语音输入 | AI 处理 | Live2D 输出 |
|----------|---------|------------|
| 🎤 你：你好呀 | 🤖 AI：你好！ | 🧑‍🎤 "你好！" (嘴型同步) |
| 🎤 你：天气怎么样？ | 🤖 AI：今天是大晴天呢！ | 🧑‍🎤 "今天是大晴天呢！" (语气变化) |

---
### 📌 1.3. 技术栈
| 组件  | 技术  |
|-------|-------|
| ASR（自动语音识别） | SenseVoice |
| LLM（大语言模型） | OpenAI GPT / DeepSeek |
| TTS（文本转语音） | CosyVoice |
| Live2D 动画 | live2d-py + OpenGL |
| 配置管理 | Python Config |

---
## 🛠 2. 安装与配置

---

### 📌 2.1. 环境要求

本项目基于 **Python 3.11** 开发，运行前请确保满足以下环境要求：

✅ **操作系统**：
   - 🖥 **Windows 10/11** 或 **Linux**
  
✅ **Python 版本**：
   - 📌 建议使用 **Python 3.8 及以上**
  
⚠️ **注意**：  
本项目的 **TTS 模块** 基于 **conda 环境** 运行，需要 **预先安装 Miniconda**。  
🔗 你可以从 [Miniconda 官网](https://docs.conda.io/en/latest/miniconda.html) 下载。

---

### 📌 2.2. 依赖的开源项目 

本项目使用了以下优秀的开源库和模型：  

🎙 **语音识别（ASR）**：  
- **SenseVoice** —— 高精度 **多语言语音识别** 及 **语音情感分析**  
- 🔗 **GitHub**：[SenseVoice Repository](https://github.com/FunAudioLLM/SenseVoice)  

🔊 **文本转语音（TTS）**：  
- **CosyVoice** —— 强大的 **生成式语音合成系统**，支持 **零样本语音克隆**  
- 🔗 **GitHub**：[CosyVoice Repository](https://github.com/FunAudioLLM/CosyVoice)  

📽 **Live2D 动画**：  
- **live2d-py** —— **Python 直接加载和操作 Live2D 模型** 的工具  
- 🔗 **GitHub**：[live2d-py Repository](https://github.com/Arkueid/live2d-py)  

---
## 📁 3. 安装步骤

---

### 📌 3.1. 克隆项目代码

```bash
git clone https://github.com/suzuran0y/Live2D-LLM-Chat.git
cd Live2D-LLM-Chat
```

### 📌 3.2. 创建虚拟环境（可选）
```bash
python -m venv venv
source venv/bin/activate # Linux/macOS 激活虚拟环境
venv\Scripts\activate # Windows 激活虚拟环境
```

### 📌 3.3. 安装依赖

```bash
pip install -r requirements.txt
```

---
### 📌 3.4. 安装 ASR & TTS 模型
🎙 **语音识别 (ASR) - SenseVoice**
本项目使用 SenseVoice 作为 ASR 模型，支持**高精度多语言语音识别**、**语音情感识别**和**声学事件检测**。

#### 1️⃣ 安装 SenseVoice 依赖
使用 pip 安装 SenseVoice 相关依赖：
```bash
pip install funasr
```

如果需要 ONNX 或 TorchScript 推理，请安装对应的版本：

```bash
pip install funasr-onnx  # ONNX 版本
pip install funasr-torch  # TorchScript 版本
```
#### 2️⃣ 下载 SenseVoice 预训练模型
SenseVoice 官方提供多个**预训练模型**，可通过 ModelScope 进行下载：

```bash
from modelscope import snapshot_download

# 下载 SenseVoice-Small 版本
snapshot_download('iic/SenseVoiceSmall', local_dir='pretrained_models/SenseVoiceSmall')
# 下载 SenseVoice-Large 版本（如果需要更高精度）
snapshot_download('iic/SenseVoiceLarge', local_dir='pretrained_models/SenseVoiceLarge')
```
更详细的配置和参数说明，请参考：

🔗SenseVoice GitHub：[SenseVoice GitHub](https://github.com/FunAudioLLM/SenseVoice)
🔗ModelScope：[预训练模型](https://www.modelscope.cn/models/iic/SenseVoiceSmall)

🔊 **文本转语音 (TTS) - CosyVoice**
本项目使用 CosyVoice 作为 TTS 模型，支持**多语言**、**语音克隆**、**跨语言复刻**等功能。

#### 1️⃣ 安装 CosyVoice 依赖
克隆 CosyVoice 仓库：
```bash
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
git submodule update --init --recursive
```

#### 2️⃣ 创建 Conda 环境并安装依赖
```bash
# 创建 Conda 虚拟环境
conda create -n cosyvoice -y python=3.10
conda activate cosyvoice

# 安装必要依赖
conda install -y -c conda-forge pynini==2.1.5
pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com
```

安装 SoX（如果需要）：

```bash
# Ubuntu
sudo apt-get install sox libsox-dev
# CentOS
sudo yum install sox sox-devel
```

#### 3️⃣ 下载 CosyVoice 预训练模型
建议下载以下 CosyVoice 预训练模型：

```bash
from modelscope import snapshot_download

snapshot_download('iic/CosyVoice2-0.5B', local_dir='pretrained_models/CosyVoice2-0.5B')
snapshot_download('iic/CosyVoice-300M', local_dir='pretrained_models/CosyVoice-300M')
snapshot_download('iic/CosyVoice-300M-SFT', local_dir='pretrained_models/CosyVoice-300M-SFT')
snapshot_download('iic/CosyVoice-300M-Instruct', local_dir='pretrained_models/CosyVoice-300M-Instruct')
snapshot_download('iic/CosyVoice-ttsfrd', local_dir='pretrained_models/CosyVoice-ttsfrd')
```
更详细的配置和参数说明，请参考：

🔗CosyVoice GitHub：[CosyVoice GitHub](https://github.com/FunAudioLLM/CosyVoice)
🔗ModelScope：[预训练模型](https://www.modelscope.cn/iic/CosyVoice2-0.5B)

---
## ⚙️ 4. 本地化配置（重要！！）

---

### 📌 4.1. 配置 ASR & TTS 模型

在完成 **ASR** 和 **TTS** 模型的安装后，按照以下步骤进行本地化配置：  

✅ **替换 SenseVoice 目录**  
- 将下载好的 **SenseVoice** 文件夹 **放入** `Live2D-LLM-Chat/ASR_env/` 文件夹内，**替换原有的同名空文件夹**。  

✅ **替换 CosyVoice 目录**  
- 将下载好的 **CosyVoice** 文件夹 **放入** `Live2D-LLM-Chat/TTS_env/` 文件夹内，**替换原有的同名空文件夹**。  

✅ **替换 `webui.py` 文件**  
- 将 `TTS_env` 文件夹内的 **`webui.py`** **放入** `CosyVoice` 文件夹内，**替换原有的 `webui.py` 文件**。

---

### 📌 4.2. 配置 `config.py` 以适配本地环境
所有 **本地路径和参数** 均可在 **`config.py`** 文件中进行修改：  
请根据 **你的文件路径** 进行相应修改，示例如下：
```python
class Config:
    # 🏠 项目根目录
    PROJECT_ROOT = "E:/PyCharm/project/project1"

    # 🎙 ASR（自动语音识别）配置
    ASR_MODEL_DIR = os.path.join(PROJECT_ROOT, "ASR_env/SenseVoice/models/SenseVoiceSmall")
    ASR_AUDIO_INPUT = os.path.join(PROJECT_ROOT, "ASR_env/input_voice/voice.wav")

    # 🔊 TTS（文本转语音）配置
    TTS_API_URL = "http://localhost:8000/"
    TTS_OUTPUT_DIR = os.path.join(PROJECT_ROOT, "TTS_env/output_voice/")

    ......
    
    # 📢 更多配置信息请参考 `config.py`
```
❗ 请确保所有路径正确，否则模型无法正常运行！

---
### 📌 4.3. 配置 LLM 模型
本地化部署**LLM 模型**依赖于**LM Studio，请按照以下步骤进行：

#### 1️⃣ 安装 LM Studio
可从[GitHub 官方仓库](https://github.com/lmstudio-ai) 或 [LM Studio 官网](https://lmstudio.ai/) 下载安装。

#### 2️⃣ 进入程序，下载当前设备可运行的 LLM 模型。
启用 LM Studio，获取 本地接口 URL。
确定模型路径 & 端口号，在 config.py 中进行相应配置。
#### 3️⃣ 运行本地 LLM，并在项目中调用。
⚠️ **注意**：本地 LLM 部署性能受限于设备配置，可能无法与云端大模型相比。如需更高性能，可考虑使用 OpenAI GPT-4 或 DeepSeek API。

---
## 👀 5. 使用方法

---

## 📌 5.1. 启动 TTS API

在运行主程序前，**需要先启动 TTS API**：  

```bash
python TTS_api.py # 现在 TTS API 调用**已集成到主程序中**，通常无需单独运行，但调试（debug）时可单独运行检查。
```


🎯 TTS API 模块将在 **conda 环境** 中运行 webui.py。启动成功后，可在浏览器访问 WebUI 进行语音合成管理：🌍 默认访问地址：http://localhost:8000

❗ 确保 TTS API **启动成功**，否则程序无法合成语音。

---
## 📌 5.2. 运行主程序
启动 TTS API 后，运行后续程序：

```bash
python main.py
```
🎙 交互方式：

#### 1️⃣ 按住 Ctrl 键 开始录音，按 Alt 键 结束录音，语音将自动转换为文本。
#### 2️⃣ 语音文本 被输入 LLM 模块 进行回答，并生成答复文本。
#### 3️⃣ 答复文本 被输入 TTS 模块 合成为语音，并在 Live2D 窗口中做出口型同步。

## 📌 5.3. 架构示意图

| **步骤** | **模块** | **输入** | **处理** | **输出** |
|----------|---------|---------|---------|---------|
| 🎤 **用户语音** | **用户** | 语音输入 | 用户说话 | 音频信号 |
| 🎙 **语音识别** | **ASR（SenseVoice）** | 音频信号 | 语音转文本（STT） | 识别文本 |
| 🤖 **文本理解 & 生成** | **LLM（GPT-4 / DeepSeek）** | 识别文本 | 语义分析 & 生成 AI 回复 | AI 生成文本 |
| 🔊 **语音合成** | **TTS（CosyVoice）** | AI 生成文本 | 文本转语音（TTS） | 语音数据 |
| 🎭 **Live2D 动画** | **Live2D** | 语音数据 | 动作生成 | 角色动画 |
| 🗣 **AI 语音反馈** | **用户** | 角色语音 & 动作 | 用户听到 AI 反馈 | 语音 & 视觉互动 |


---
# 📂 6. 项目结构
---

本项目采用模块化设计，包含 **ASR（语音识别）、TTS（文本转语音）、LLM（大语言模型）、Live2D 动画渲染** 等核心功能，以下是 **完整的项目结构**：

```bash
Live2D-LLM-Chat/
│── main.py                # 🚀 主程序入口
│── ASR.py                 # 🎙 语音识别 (ASR) 模块
│── TTS.py                 # 🔊 语音合成 (TTS) 模块
│── TTS_api.py             # 🌐 TTS API 模块
│── LLM.py                 # 🤖 大语言模型 (LLM) 模块
│── Live2d_animation.py    # 🎭 Live2D 动画管理模块
│── webui.py               # 🖥 WebUI 语音合成界面
│── config.py              # ⚙️ 项目配置文件
│── requirements.txt       # 📦 依赖列表
└── README.md              # 📄 项目文档
```
---
## 🚀 7. 项目发展  
---

### 📌 7.1. 过往内容

#### 🏁 **2025.01.28 - 项目构思**
- 🎯 **确定核心目标**：基于 **Live2D + LLM** 实现实时互动系统  
- 🔍 **研究技术**：语音识别（ASR）、文本转语音（TTS）及 Live2D 方案  
- ✅ **选定核心组件**：
  - **SenseVoice** 作为 ASR  
  - **CosyVoice** 作为 TTS  
  - **live2d-py** 作为动画渲染引擎  

#### 📅 **2025.02.28 - 发布第一版**
- 🎙 **实现语音输入 & 识别（ASR）**  
- 🤖 **集成 LLM 进行文本生成**  
- 🔊 **通过 TTS 生成语音并同步 Live2D 模型部分动作**  

---

### 📌 7.2. 未来计划 ~~(画饼)~~  

🔹 **LLM 模块优化**：
   - 由于 **个人设备性能** 限制了本地部署模型的输出质量，计划 **改进 LLM 模块的输出逻辑**，提升稳定性。  

🔹 **信息输出精炼**：
   - 优化 **模型运行时的日志和输出信息**，仅保留重点内容，提高可读性和观感。  

🔹 **Live2D 交互增强**：
   - **提升 Live2D 角色的动作丰富度**，增强互动体验，使 Live2D 角色更具表现力。  

🔹 **后续优化**：
   - 🛠 持续优化 TTS & ASR 模块的运行效率  
   - 🌍 增强多语言支持，扩展至更多语种  
   - 🔗 进一步支持云端推理，提高性能  

---

## 🤝 8. 贡献与鸣谢

本项目部分代码基于 [SenseVoice](https://github.com/FunAudioLLM/SenseVoice)、[CosyVoice](https://github.com/FunAudioLLM/CosyVoice) 和 [live2d-py](https://github.com/Arkueid/live2d-py) 进行修改，并根据项目需求进行了优化和扩展。  
🎉 **特此感谢原项目作者的贡献！**  

💡 **欢迎贡献代码和建议！**  
📢 如有问题或改进建议，请提交 **PR（Pull Request）** 或 **Issue** 进行反馈。  

---


## 📄 许可证
本项目采用 [Apache-2.0 许可证](LICENSE)。

