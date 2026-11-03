/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { CubismRenderTarget_WebGL } from './cubismrendertarget_webgl.js';
import { CubismWebGLOffscreenManager } from './cubismoffscreenmanager.js';
import { CubismLogError } from '../utils/cubismdebug.js';
/**
 * WebGL用オフスクリーンサーフェス
 * マスクの描画及びオフスクリーン機能に必要なフレームバッファなどを管理する。
 */
export class CubismOffscreenRenderTarget_WebGL extends CubismRenderTarget_WebGL {
    /**
     * リソースコンテナマネージャを初期化する。
     *
     * @param displayBufferWidth レンダーターゲットの幅
     * @param displayBufferHeight レンダーターゲットの高さ
     */
    initializeOffscreenManager(gl, displayBufferWidth, displayBufferHeight) {
        this._gl = gl;
        this._webGLOffscreenManager = CubismWebGLOffscreenManager.getInstance();
        if (this._webGLOffscreenManager.getContainerSize(gl) === 0) {
            this._webGLOffscreenManager.initialize(gl, displayBufferWidth, displayBufferHeight);
        }
    }
    /**
     * オフスクリーン描画用レンダーターゲットをセットする。
     *
     * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
     *          NOTE: Cubism 5.3以降のモデルが使用される場合はWebGL2RenderingContextを使用すること。
     * @param displayBufferWidth レンダーターゲットの幅
     * @param displayBufferHeight レンダーターゲットの高さ
     * @param previousFramebuffer 前のフレームバッファ
     */
    setOffscreenRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
        // マネージャがなければ初期化
        if (this._webGLOffscreenManager == null) {
            this.initializeOffscreenManager(gl, displayBufferWidth, displayBufferHeight);
        }
        // 使用可能なリソースコンテナを取得する
        const offscreenRenderTargetContainer = this._webGLOffscreenManager.getOffscreenRenderTargetContainers(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer);
        if (offscreenRenderTargetContainer == null) {
            CubismLogError('Failed to acquire offscreen render texture container.');
            return;
        }
        this._colorBuffer = offscreenRenderTargetContainer.getColorBuffer();
        this._renderTexture = offscreenRenderTargetContainer.getRenderTexture();
        this._bufferWidth = displayBufferWidth;
        this._bufferHeight = displayBufferHeight;
        this._gl = gl;
        if (this._renderTexture == null) {
            this._renderTexture = previousFramebuffer;
            CubismLogError('Failed to create offscreen render texture.');
        }
        return;
    }
    /**
     * リソースコンテナの使用状態を取得
     *
     * @return 使用中はtrue、未使用の場合はfalse
     */
    getUsingRenderTextureState() {
        if (this._webGLOffscreenManager == null || this._gl == null) {
            return true;
        }
        return this._webGLOffscreenManager.getUsingRenderTextureState(this._gl, this._renderTexture);
    }
    /**
     * リソースコンテナの使用を開始する。
     */
    startUsingRenderTexture() {
        if (this._webGLOffscreenManager == null || this._gl == null) {
            return;
        }
        this._webGLOffscreenManager.startUsingRenderTexture(this._gl, this._renderTexture);
    }
    /**
     * リソースコンテナの使用を終了する。
     */
    stopUsingRenderTexture() {
        if (this._webGLOffscreenManager == null || this._gl == null) {
            return;
        }
        this._webGLOffscreenManager.stopUsingRenderTexture(this._gl, this._renderTexture);
    }
    /**
     * オフスクリーンのインデックスを設定する。
     *
     * @param offscreenIndex オフスクリーンのインデックス
     */
    setOffscreenIndex(offscreenIndex) {
        this._offscreenIndex = offscreenIndex;
    }
    /**
     * オフスクリーンのインデックスを取得する。
     *
     * @return オフスクリーンのインデックス
     */
    getOffscreenIndex() {
        return this._offscreenIndex;
    }
    /**
     * 以前のオフスクリーン描画用レンダーターゲットを設定する。
     *
     * @param oldOffscreen 以前のオフスクリーン描画用レンダーターゲット
     */
    setOldOffscreen(oldOffscreen) {
        this._oldOffscreen = oldOffscreen;
    }
    /**
     * 以前のオフスクリーン描画用レンダーターゲットを取得する。
     *
     * @return 以前のオフスクリーン描画用レンダーターゲット
     */
    getOldOffscreen() {
        return this._oldOffscreen;
    }
    /**
     * 親のオフスクリーン描画用レンダーターゲットを設定する。
     *
     * @param parentOffscreenRenderTarget 親のオフスクリーン描画用レンダーターゲット
     */
    setParentPartOffscreen(parentOffscreenRenderTarget) {
        this._parentOffscreenRenderTarget = parentOffscreenRenderTarget;
    }
    /**
     * 親のオフスクリーン描画用レンダーターゲットを取得する。
     *
     * @return 親のオフスクリーン描画用レンダーターゲット
     */
    getParentPartOffscreen() {
        return this._parentOffscreenRenderTarget;
    }
    /**
     * コンストラクタ
     */
    constructor() {
        super();
        this._offscreenIndex = -1;
        this._parentOffscreenRenderTarget = null;
        this._oldOffscreen = null;
        this._webGLOffscreenManager = null;
    }
    release() {
        if (this._webGLOffscreenManager != null &&
            this._gl != null &&
            this._renderTexture != null) {
            this._webGLOffscreenManager.stopUsingRenderTexture(this._gl, this._renderTexture);
        }
        if (this._colorBuffer && this._gl) {
            this._gl.deleteTexture(this._colorBuffer);
            this._colorBuffer = null;
        }
        if (this._renderTexture && this._gl) {
            this._gl.deleteFramebuffer(this._renderTexture);
            this._renderTexture = null;
        }
        if (this._webGLOffscreenManager != null) {
            this._webGLOffscreenManager = null;
        }
        this._oldOffscreen = null;
        this._parentOffscreenRenderTarget = null;
    }
}
