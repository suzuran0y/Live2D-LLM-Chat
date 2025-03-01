
import os
import shutil
import time
import requests
from openai import OpenAI
from config import Config

class LLMManager:
    def __init__(self):

        # 确定 online_model 为线上还是本地
        if Config.online_model == "online":
            online_model = 1
        elif Config.online_model == "offline":
            online_model = 0
        else:
            raise ValueError(f"配置错误: online_model 必须是 'online' 或 'offline'，但你提供了 {Config.online_model}")

        # 确定 model_choice
        if Config.model_choice == "OpenAI":
            model_choice = 1
        elif Config.model_choice == "deepseek":
            model_choice = 2
        else:
            raise ValueError(f"配置错误: model_choice 只能是 'OpenAI' 或 'deepseek'，但你提供了 {Config.model_choice}")

        # 初始化 LLM 对话管理器
        # param online_model: 是否使用在线模型（0 = 本地，1 = 在线）
        # param model_choice: 选择在线 LLM（1 = OpenAI GPT-4, 2 = DeepSeek）

        self.online_model = online_model
        self.model_choice = model_choice
        self.conversation = [
            {"role": "system",
             "content": "你是一位知识渊博的猫娘，致力于帮助我学习知识。你也可以与我闲聊，但请尽量简洁，像真正的老师一样回答问题。"},
            {"role": "assistant", "content": "不用输出分隔符，如'#'、'*'、'-'。"}
        ]
        self.conversation_summary = ""
        self.user_message_count = 0
        self.tmp_path = "E:/PyCharm/project/project1/TTS_env/tmp"
        os.makedirs(self.tmp_path, exist_ok=True)

        if online_model == 0:
            self.model_name = Config.model_name # 确定本地模型
            self.api_url = Config.api_url
        elif online_model == 1:
            if model_choice == 1:
                self.client = OpenAI(api_key=Config.openai_key)
                self.model_name = "gpt-4o-2024-11-20"
            elif model_choice == 2:
                self.client = OpenAI(api_key=Config.deepseek_key, base_url="https://api.deepseek.com")
                self.model_name = "deepseek-chat"

    def model_chat_completion(self, messages):

        # 调用 LLM 进行对话
        # param messages: 对话列表
        # return: 生成的回复文本
        if Config.online_model == "online":
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=False
            )
            return response.choices[0].message.content.strip()
        elif Config.online_model == "offline":
            data = {
            "model": self.model_name,
            "messages": self.conversation}
            # 请求头（确保 `User-Agent` 避免 Python 请求被拦截）
            headers = {"Content-Type": "application/json","User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"} # 伪装浏览器请求
            # 使用 `json=data`（避免 `json.dumps()` 出现错误）
            response = requests.post(self.api_url, headers=headers, json=data)
            # 解析返回结果
            if response.status_code == 200:
                result = response.json()
                # print("回复:", result["choices"][0]["message"]["content"])
                return result["choices"][0]["message"]["content"]
            else:
                print(f"请求失败，状态码: {response.status_code}")
                print("错误信息:", response.text)




    def summarize_conversation(self):

        # 使用 LLM 对对话进行摘要
        # return: 摘要文本

        summary_prompt = [
            {"role": "system", "content": "你是一只专业的对话摘要工具。请用简洁的语言总结以下对话的主要内容。"},
            *self.conversation
        ]
        return self.model_chat_completion(summary_prompt)

    def chat_once(self, user_input):

        # 进行一次对话（用户输入 → LLM 生成回复）
        # param user_input: 用户输入的文本
        # return: 生成的回复文本

        start_time = time.time()
        self.conversation.append({"role": "user", "content": user_input})
        self.user_message_count += 1

        if self.user_message_count % 5 == 0:
            new_summary = self.summarize_conversation()
            if self.conversation_summary:
                self.conversation_summary += "\n" + new_summary
            else:
                self.conversation_summary = new_summary

            # 清理临时目录
            shutil.rmtree(self.tmp_path)
            os.makedirs(self.tmp_path, exist_ok=True)

            self.conversation = [
                {"role": "system",
                 "content": "你是一位知识渊博的猫娘，致力于帮助我学习知识。你也可以与我闲聊，但请尽量简洁。"},
                {"role": "system", "content": f"这是之前对话的摘要：\n{self.conversation_summary}\n请继续与我对话。"},
                {"role": "assistant", "content": "不用输出分隔符，如'#'、'*'、'-'。"},
                {"role": "user", "content": user_input}
            ]

        reply = self.model_chat_completion(self.conversation)
        self.conversation.append({"role": "assistant", "content": reply})
        print(f"LLM 思考耗时: {time.time() - start_time:.2f} 秒")
        return reply


if __name__ == "__main__":
    llm_manager = LLMManager()

    while True:
        user_input = input("你: ")
        if user_input.lower() in ("exit。", "quit。", "q。", "结束。", "再见。"):
            print("已退出对话。")
            break

        reply = llm_manager.chat_once(user_input)
        print(f"猫娘: {reply}")
