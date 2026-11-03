/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { CubismLogError } from '../utils/cubismdebug.js';
/**
 * WebGL用オフスクリーンサーフェス
 * マスクの描画に必要なフレームバッファなどを管理する。
 */
export class CubismRenderTarget_WebGL {
    /**
     * WebGL2RenderingContext.blitFramebuffer() でバッファのコピーを行う。
     *
     * @param src コピー元のオフスクリーンサーフェス
     * @param dst コピー先のオフスクリーンサーフェス
     */
    static copyBuffer(gl, src, dst) {
        if (src == null || dst == null) {
            return;
        }
        if (!(gl instanceof WebGL2RenderingContext)) {
            throw new Error('WebGL2RenderingContext is required for buffer copy.');
        }
        const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        // 各オフスクリーンサーフェスのレンダーテクスチャをバインド
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.getRenderTexture());
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.getRenderTexture());
        // バッファのコピーを実行
        gl.blitFramebuffer(0, 0, src.getBufferWidth(), src.getBufferHeight(), 0, 0, dst.getBufferWidth(), dst.getBufferHeight(), gl.COLOR_BUFFER_BIT, gl.NEAREST);
        // コピー後、元のフレームバッファを復元
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    /**
     * 描画を開始する。
     *
     * @param restoreFbo EndDraw時に復元するFBOを指定する。nullを指定すると、beginDraw時に現在のFBOを記憶しておく。
     */
    beginDraw(restoreFbo = null) {
        if (this._renderTexture == null) {
            console.error('_renderTexture is null');
            return;
        }
        // バックバッファのサーフェイスを記憶しておく。
        if (restoreFbo == null) {
            this._oldFbo = this._gl.getParameter(this._gl.FRAMEBUFFER_BINDING);
        }
        else {
            this._oldFbo = restoreFbo;
        }
        // RenderTextureをactiveにセット
        this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._renderTexture);
    }
    /**
     * 描画を終了し、バックバッファのサーフェイスを復元する。
     */
    endDraw() {
        // バックバッファのサーフェイスを復元
        this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._oldFbo);
    }
    /**
     * バインドされているカラーバッファのクリアを行う。
     *
     * @param r 赤の成分 (0.0 - 1.0)
     * @param g 緑の成分 (0.0 - 1.0)
     * @param b 青の成分 (0.0 - 1.0)
     * @param a アルファの成分 (0.0 - 1.0)
     */
    clear(r, g, b, a) {
        // クリア処理
        this._gl.clearColor(r, g, b, a);
        this._gl.clear(this._gl.COLOR_BUFFER_BIT);
    }
    /**
     * オフスクリーンサーフェスを作成する。
     *
     * @param gl WebGLRenderingContextまたはWebGL2RenderingContext
     *          NOTE: Cubism 5.3以降のモデルが使用される場合はWebGL2RenderingContextを使用すること。
     * @param displayBufferWidth オフスクリーンサーフェスの幅
     * @param displayBufferHeight オフスクリーンサーフェスの高さ
     * @param previousFramebuffer 前のフレームバッファ
     *
     * @return 成功した場合はtrue、失敗した場合はfalse
     */
    createRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
        this.destroyRenderTarget();
        this._colorBuffer = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._colorBuffer);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, displayBufferWidth, displayBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, null);
        // フレームバッファを作成
        const ret = gl.createFramebuffer();
        if (ret == null) {
            CubismLogError('Failed to create framebuffer');
            return false;
        }
        // 作成したフレームバッファをバインド
        gl.bindFramebuffer(gl.FRAMEBUFFER, ret);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._colorBuffer, 0);
        // 状態をチェック
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        // フレームバッファが完全でない場合はエラーを出力して以前のフレームバッファを復元
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            CubismLogError('Framebuffer is not complete');
            gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
            gl.deleteFramebuffer(ret);
            this.destroyRenderTarget();
            return false;
        }
        this._renderTexture = ret;
        this._bufferWidth = displayBufferWidth;
        this._bufferHeight = displayBufferHeight;
        this._gl = gl;
        return true;
    }
    /**
     * レンダーターゲットを破棄する。
     */
    destroyRenderTarget() {
        if (this._colorBuffer) {
            this._gl.bindTexture(this._gl.TEXTURE_2D, null);
            this._gl.deleteTexture(this._colorBuffer);
            this._colorBuffer = null;
        }
        if (this._renderTexture) {
            this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
            this._gl.deleteFramebuffer(this._renderTexture);
            this._renderTexture = null;
        }
    }
    /**
     * WebGLのコンテキストを取得する。
     *
     * @return WebGLRenderingContextまたはWebGL2RenderingContext
     */
    getGL() {
        return this._gl;
    }
    /**
     * レンダーテクスチャを取得する。
     *
     * @return WebGLFramebuffer
     */
    getRenderTexture() {
        return this._renderTexture;
    }
    /**
     * カラーバッファを取得する。
     *
     * @return WebGLTexture
     */
    getColorBuffer() {
        return this._colorBuffer;
    }
    /**
     * カラーバッファの幅を取得する。
     *
     * @return カラーバッファの幅
     */
    getBufferWidth() {
        return this._bufferWidth;
    }
    /**
     * カラーバッファの高さを取得する。
     *
     * @return カラーバッファの高さ
     */
    getBufferHeight() {
        return this._bufferHeight;
    }
    /**
     * オフスクリーンサーフェスが有効かどうかを確認する。
     *
     * @return 有効な場合はtrue、無効な場合はfalse
     */
    isValid() {
        return this._renderTexture != null;
    }
    /**
     * 以前のフレームバッファを取得する。
     *
     * @return 以前のフレームバッファ
     */
    getOldFBO() {
        return this._oldFbo;
    }
    /**
     * コンストラクタ
     */
    constructor() {
        this._gl = null;
        this._colorBuffer = null;
        this._renderTexture = null;
        this._bufferWidth = 0;
        this._bufferHeight = 0;
        this._oldFbo = null;
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismrendertarget_webgl.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismOffscreenSurface_WebGL = $.CubismRenderTarget_WebGL;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
