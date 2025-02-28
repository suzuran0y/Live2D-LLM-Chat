
import time
import glfw
import OpenGL.GL as gl
import pyautogui
import pygame
import ctypes
from pydub import AudioSegment
from live2d.v3 import LAppModel, init, dispose, glewInit, clearBuffer
from config import Config

# Live2D 窗口设置
GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
WS_EX_TRANSPARENT = 0x00000020

# 眨眼状态
BLINK_STATE_NONE = 0
BLINK_STATE_CLOSING = 1
BLINK_STATE_CLOSED = 2
BLINK_STATE_OPENING = 3

class Live2DAnimationManager:
    def __init__(self, model_path, frame_rate=60):

        # 初始化 Live2D 动画管理器
        # param model_path: Live2D 模型文件路径（.model3.json）
        # param frame_rate: 渲染帧率

        self.model_path = model_path
        self.frame_rate = frame_rate
        self.mouth_value = 0
        self.window = None
        self.model = None
        self.running = True

        # 鼠标跟随相关参数
        self.last_mouse_x, self.last_mouse_y = pyautogui.position()
        self.last_move_time = time.time()
        self.IDLE_THRESHOLD = 3.0

        self.X_MIN, self.X_MAX = 200, 480
        self.Y_MIN, self.Y_MAX = 300, 360
        self.center_x_mapped = (self.X_MIN + self.X_MAX) / 2
        self.center_y_mapped = (self.Y_MIN + self.Y_MAX) / 2
        self.gaze_x = 0.0
        self.gaze_y = 0.0
        self.GAZE_EASING = 0.02

    def configure_window(self, window, width, height):

        # 配置 GLFW 窗口，使其透明且可穿透鼠标

        hwnd = glfw.get_win32_window(window)
        get_window_long = ctypes.windll.user32.GetWindowLongW
        set_window_long = ctypes.windll.user32.SetWindowLongW
        ex_style = get_window_long(hwnd, GWL_EXSTYLE)
        ex_style |= (WS_EX_LAYERED | WS_EX_TRANSPARENT)
        set_window_long(hwnd, GWL_EXSTYLE, ex_style)

        glfw.make_context_current(window)
        screen_width, screen_height = pyautogui.size()
        glfw.set_window_pos(window, 0, screen_height - height)

    def load_live2d_model(self, width, height):

        # 加载 Live2D 模型

        model = LAppModel()
        model.LoadModelJson(self.model_path)
        model.Resize(width, height)
        return model

    def play_live2d_once(self):

        # 创建 Live2D 窗口，并让角色进行渲染（保持运行）

        init()
        if not glfw.init():
            print("GLFW 初始化失败！")
            return

        glfw.window_hint(glfw.TRANSPARENT_FRAMEBUFFER, glfw.TRUE)
        glfw.window_hint(glfw.DECORATED, glfw.FALSE)
        glfw.window_hint(glfw.FLOATING, glfw.TRUE)

        window_width, window_height = 800, 600
        self.window = glfw.create_window(window_width, window_height, "Live2D Window", None, None)
        if not self.window:
            print("GLFW 窗口创建失败！")
            glfw.terminate()
            return

        self.configure_window(self.window, window_width, window_height)
        glewInit()

        self.model = self.load_live2d_model(window_width, window_height)

        last_time = time.time()
        gl.glClearColor(0.0, 0.0, 0.0, 0.0)

        while self.running and not glfw.window_should_close(self.window):
            gl.glClear(gl.GL_COLOR_BUFFER_BIT)
            now = time.time()
            dt = now - last_time
            last_time = now

            width, height = glfw.get_framebuffer_size(self.window)
            gl.glViewport(0, 0, width, height)
            clearBuffer(0, 0, 0, 0)

            self.model.Update()
            self.model.SetParameterValue("ParamMouthOpenY", self.mouth_value, 1)

            self.update_gaze_tracking(width, height)

            self.model.Draw()
            glfw.swap_buffers(self.window)
            glfw.poll_events()

        pygame.mixer.music.stop()
        pygame.mixer.quit()
        dispose()
        glfw.terminate()

    def update_gaze_tracking(self, width, height):

        # 计算鼠标跟随逻辑，让 Live2D 角色的眼睛和头部跟随鼠标

        screen_x, screen_y = pyautogui.position()
        win_x, win_y = glfw.get_window_pos(self.window)
        local_mouse_x = screen_x - win_x
        local_mouse_y = screen_y - win_y

        if (screen_x != self.last_mouse_x) or (screen_y != self.last_mouse_y):
            self.last_move_time = time.time()
            self.last_mouse_x, self.last_mouse_y = screen_x, screen_y

        if (time.time() - self.last_move_time) < self.IDLE_THRESHOLD:
            mapped_x = self.X_MIN + (local_mouse_x / width) * (self.X_MAX - self.X_MIN)
            mapped_y = self.Y_MIN + (local_mouse_y / height) * (self.Y_MAX - self.Y_MIN)
            target_x = mapped_x
            target_y = mapped_y
        else:
            target_x = self.center_x_mapped
            target_y = self.center_y_mapped
            self.GAZE_EASING = 0.0004

        self.gaze_x += self.GAZE_EASING * (target_x - self.gaze_x)
        self.gaze_y += self.GAZE_EASING * (target_y - self.gaze_y)
        self.model.Drag(self.gaze_x, self.gaze_y)

    def extract_volume_array(self, audio_file):

        # 提取音频的音量信息，并归一化用于嘴型同步

        seg = AudioSegment.from_file(audio_file, format="wav")
        frame_duration_ms = 1000 / self.frame_rate
        num_frames = int(seg.duration_seconds * self.frame_rate)

        volumes = []
        for i in range(num_frames):
            start_ms = i * frame_duration_ms
            frame_seg = seg[start_ms: start_ms + frame_duration_ms]
            rms = frame_seg.rms
            volumes.append(rms)

        max_rms = max(volumes) if volumes else 1
        volumes = [v / max_rms for v in volumes]  # 归一化
        return volumes, seg.duration_seconds

    def play_audio_and_print_mouth(self, audio_file):

        # 播放音频并同步嘴型动作

        volume_array, audio_duration = self.extract_volume_array(audio_file)
        total_frames = len(volume_array)

        pygame.mixer.init()
        pygame.mixer.music.load(audio_file)
        pygame.mixer.music.play()

        start_time = time.time()
        while True:
            current_time = time.time() - start_time
            if current_time >= audio_duration:
                break

            frame_index = int(current_time * self.frame_rate)
            if frame_index >= total_frames:
                frame_index = total_frames - 1

            self.mouth_value = volume_array[frame_index]

        pygame.mixer.music.stop()


