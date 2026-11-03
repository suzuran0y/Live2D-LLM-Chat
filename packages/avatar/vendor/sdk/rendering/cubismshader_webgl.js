/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { CubismMatrix44 } from '../math/cubismmatrix44.js';
import { CubismColorBlend, CubismAlphaBlend } from '../model/cubismmodel.js';
import { CubismLogError, CubismLogWarning } from '../utils/cubismdebug.js';
import { CubismRenderTarget_WebGL } from './cubismrendertarget_webgl.js';
import { CubismBlendMode, CubismTextureColor } from './cubismrenderer.js';
// Shader
const VertShaderSrcPath = 'vertshadersrc.vert';
const VertShaderSrcMaskedPath = 'vertshadersrcmasked.vert';
const VertShaderSrcSetupMaskPath = 'vertshadersrcsetupmask.vert';
const FragShaderSrcSetupMaskPath = 'fragshadersrcsetupmask.frag';
const FragShaderSrcPremultipliedAlphaPath = 'fragshadersrcpremultipliedalpha.frag';
const FragShaderSrcMaskPremultipliedAlphaPath = 'fragshadersrcmaskpremultipliedalpha.frag';
const FragShaderSrcMaskInvertedPremultipliedAlphaPath = 'fragshadersrcmaskinvertedpremultipliedalpha.frag';
// Copy & Blend Shader
const VertShaderSrcCopyPath = 'vertshadersrccopy.vert';
const FragShaderSrcCopyPath = 'fragshadersrccopy.frag';
const FragShaderSrcColorBlendPath = 'fragshadersrccolorblend.frag';
const FragShaderSrcAlphaBlendPath = 'fragshadersrcalphablend.frag';
const VertShaderSrcBlendPath = 'vertshadersrcblend.vert';
const FragShaderSrcBlendPath = 'fragshadersrcpremultipliedalphablend.frag';
// Blend mode Prefix
const ColorBlendPrefix = 'ColorBlend_';
const AlphaBlendPrefix = 'AlphaBlend_';
let s_instance; // インスタンス（シングルトン）
const s_renderTargetVertexArray = new Float32Array([
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0
]);
const s_renderTargetUvArray = new Float32Array([
    0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0
]);
const s_renderTargetReverseUvArray = new Float32Array([
    0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0
]);
/**
 * WebGL用のシェーダープログラムを生成・破棄するクラス
 */
export class CubismShader_WebGL {
    /**
     * 非同期でシェーダーをパスから読み込む
     *
     * @param url シェーダーのURL
     *
     * @return シェーダーのソースコード
     */
    loadShader(url) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(url);
            return yield response.text();
        });
    }
    /**
     * ブレンドモード用のシェーダーを読み込む
     */
    loadShaders() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // _shaderPathがnullまたはundefinedの場合はデフォルトパスを使用
            const shaderDir = (_a = this._shaderPath) !== null && _a !== void 0 ? _a : this._defaultShaderPath;
            // シェーダーファイルのパスとプロパティの対応
            // NOTE: prop は CubismShader_WebGL に設定された変数名
            const shaderFiles = [
                { path: shaderDir + VertShaderSrcPath, prop: '_vertShaderSrc' },
                {
                    path: shaderDir + VertShaderSrcMaskedPath,
                    prop: '_vertShaderSrcMasked'
                },
                {
                    path: shaderDir + VertShaderSrcSetupMaskPath,
                    prop: '_vertShaderSrcSetupMask'
                },
                {
                    path: shaderDir + FragShaderSrcSetupMaskPath,
                    prop: '_fragShaderSrcSetupMask'
                },
                {
                    path: shaderDir + FragShaderSrcPremultipliedAlphaPath,
                    prop: '_fragShaderSrcPremultipliedAlpha'
                },
                {
                    path: shaderDir + FragShaderSrcMaskPremultipliedAlphaPath,
                    prop: '_fragShaderSrcMaskPremultipliedAlpha'
                },
                {
                    path: shaderDir + FragShaderSrcMaskInvertedPremultipliedAlphaPath,
                    prop: '_fragShaderSrcMaskInvertedPremultipliedAlpha'
                },
                { path: shaderDir + VertShaderSrcCopyPath, prop: '_vertShaderSrcCopy' },
                { path: shaderDir + FragShaderSrcCopyPath, prop: '_fragShaderSrcCopy' },
                {
                    path: shaderDir + FragShaderSrcColorBlendPath,
                    prop: '_fragShaderSrcColorBlend'
                },
                {
                    path: shaderDir + FragShaderSrcAlphaBlendPath,
                    prop: '_fragShaderSrcAlphaBlend'
                },
                { path: shaderDir + VertShaderSrcBlendPath, prop: '_vertShaderSrcBlend' },
                { path: shaderDir + FragShaderSrcBlendPath, prop: '_fragShaderSrcBlend' }
            ];
            // シェーダーファイルを非同期で読み込み、結果をプロパティに設定
            const results = yield Promise.all(shaderFiles.map(file => this.loadShader(file.path)
                .then(data => ({ prop: file.prop, data }))
                .catch(error => {
                console.error(`Error loading ${file.path} shader:`, error);
                return { prop: file.prop, data: '' };
            })));
            // 変数に内容を登録
            results.forEach(result => {
                this[result.prop] = result.data;
            });
        });
    }
    /**
     * コンストラクタ
     */
    constructor() {
        this._shaderSets = new Array();
        this._isShaderLoading = false;
        this._isShaderLoaded = false;
        // カラーブレンド用のマップ
        this._colorBlendMap = new Map();
        this._colorBlendValues = new Array();
        const colorBlendKeys = Object.keys(CubismColorBlend);
        // Object.values() のポリフィル
        const colorBlendRawValues = Object.keys(CubismColorBlend).map(k => CubismColorBlend[k]);
        for (let i = 0; i < colorBlendKeys.length; i++) {
            const colorBlendKey = colorBlendKeys[i];
            if (colorBlendKey.includes(ColorBlendPrefix)) {
                const blendModeName = colorBlendKey.slice(ColorBlendPrefix.length);
                const colorBlendNumber = parseInt(colorBlendRawValues[i].toString());
                this._colorBlendMap.set(colorBlendNumber, blendModeName);
                this._colorBlendValues.push(colorBlendNumber);
            }
        }
        // アルファブレンド用のマップ
        this._alphaBlendMap = new Map();
        this._alphaBlendValues = new Array();
        const alphaBlendKeys = Object.keys(CubismAlphaBlend);
        // Object.values() のポリフィル
        const alphaBlendRawValues = Object.keys(CubismAlphaBlend).map(k => CubismAlphaBlend[k]);
        for (let i = 0; i < alphaBlendKeys.length; i++) {
            const alphaBlendKey = alphaBlendKeys[i];
            if (alphaBlendKey.includes(AlphaBlendPrefix)) {
                const blendModeName = alphaBlendKey.slice(AlphaBlendPrefix.length);
                const alphaBlendNumber = parseInt(alphaBlendRawValues[i].toString());
                this._alphaBlendMap.set(alphaBlendNumber, blendModeName);
                this._alphaBlendValues.push(alphaBlendNumber);
            }
        }
        this._blendShaderSetMap = new Map();
        this._shaderCount =
            ShaderNames.ShaderNames_ShaderCount +
                1 +
                (this._colorBlendValues.length - 3) *
                    (this._alphaBlendValues.length - 1) *
                    3;
        // シェーダーの数 =
        // (マスク生成用 + (通常用 + 加算 + 乗算) * (マスク無の乗算済アルファ対応版 + マスク有の乗算済アルファ対応版 + マスク有反転の乗算済アルファ対応版))
        // + 1（コピー用のシェーダー）
        // + カラーブレンドの数（後方互換とNone除く） * アルファブレンドの数（None除く） * （通常 + マスク + 反転マスク）
        this._defaultShaderPath = '../../Framework/Shaders/WebGL/';
        this._shaderPath = this._defaultShaderPath;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
        this.releaseShaderProgram();
    }
    /**
     * 描画用のシェーダプログラムの一連のセットアップを実行する
     *
     * @param renderer レンダラー
     * @param model 描画対象のモデル
     * @param index 描画対象のメッシュのインデックス
     */
    setupShaderProgramForDrawable(renderer, model, index) {
        if (!renderer.isPremultipliedAlpha()) {
            CubismLogError('NoPremultipliedAlpha is not allowed');
        }
        if (this._shaderSets.length == 0) {
            this.generateShaders();
        }
        if (this._isShaderLoaded == false) {
            CubismLogWarning('Shader program is not initialized.');
            return;
        }
        // Blending
        let srcColor;
        let dstColor;
        let srcAlpha;
        let dstAlpha;
        // _shaderSets用のオフセット計算
        const masked = renderer.getClippingContextBufferForDrawable() != null; // この描画オブジェクトはマスク対象か
        const invertedMask = model.getDrawableInvertedMaskBit(index);
        const offset = masked ? (invertedMask ? 2 : 1) : 0;
        let shaderSet;
        // Cubism 5.2以前のシェーダを使用する場合はtrue
        let isUsingCompatible = true;
        if (model.isBlendModeEnabled()) {
            const colorBlendMode = model.getDrawableColorBlend(index);
            const alphaBlendMode = model.getDrawableAlphaBlend(index);
            if (colorBlendMode == CubismColorBlend.ColorBlend_None ||
                alphaBlendMode == CubismAlphaBlend.AlphaBlend_None ||
                (colorBlendMode == CubismColorBlend.ColorBlend_Normal &&
                    alphaBlendMode == CubismAlphaBlend.AlphaBlend_Over)) {
                // Cubism 5.2以前のシェーダを使用する。
                shaderSet =
                    this._shaderSets[ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset];
                srcColor = this.gl.ONE;
                dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                srcAlpha = this.gl.ONE;
                dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
            }
            else {
                switch (colorBlendMode) {
                    // Cubism 5.2以前のシェーダを使用する。
                    case CubismColorBlend.ColorBlend_AddCompatible:
                        shaderSet =
                            this._shaderSets[ShaderNames.ShaderNames_AddPremultipliedAlpha + offset];
                        srcColor = this.gl.ONE;
                        dstColor = this.gl.ONE;
                        srcAlpha = this.gl.ZERO;
                        dstAlpha = this.gl.ONE;
                        break;
                    // Cubism 5.2以前のシェーダを使用する。
                    case CubismColorBlend.ColorBlend_MultiplyCompatible:
                        shaderSet =
                            this._shaderSets[ShaderNames.ShaderNames_MultPremultipliedAlpha + offset];
                        srcColor = this.gl.DST_COLOR;
                        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                        srcAlpha = this.gl.ZERO;
                        dstAlpha = this.gl.ONE;
                        break;
                    // ブレンドモードの組み合わせでシェーダーを決定
                    default:
                        {
                            const srcBuffer = renderer._currentOffscreen != null
                                ? renderer._currentOffscreen
                                : renderer.getModelRenderTarget(0);
                            // 先にコピーを行う
                            CubismRenderTarget_WebGL.copyBuffer(this.gl, srcBuffer, renderer.getModelRenderTarget(1));
                            const baseShaderSetIndex = this._blendShaderSetMap.get(this._colorBlendMap.get(colorBlendMode) +
                                this._alphaBlendMap.get(alphaBlendMode));
                            shaderSet = this._shaderSets[baseShaderSetIndex + offset];
                            srcColor = this.gl.ONE;
                            dstColor = this.gl.ZERO;
                            srcAlpha = this.gl.ONE;
                            dstAlpha = this.gl.ZERO;
                            isUsingCompatible = false;
                        }
                        break;
                }
            }
        }
        else {
            // Cubism 5.2以前のシェーダを使用する。
            switch (model.getDrawableBlendMode(index)) {
                case CubismBlendMode.CubismBlendMode_Normal:
                default:
                    shaderSet =
                        this._shaderSets[ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset];
                    srcColor = this.gl.ONE;
                    dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                    srcAlpha = this.gl.ONE;
                    dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
                    break;
                case CubismBlendMode.CubismBlendMode_Additive:
                    shaderSet =
                        this._shaderSets[ShaderNames.ShaderNames_AddPremultipliedAlpha + offset];
                    srcColor = this.gl.ONE;
                    dstColor = this.gl.ONE;
                    srcAlpha = this.gl.ZERO;
                    dstAlpha = this.gl.ONE;
                    break;
                case CubismBlendMode.CubismBlendMode_Multiplicative:
                    shaderSet =
                        this._shaderSets[ShaderNames.ShaderNames_MultPremultipliedAlpha + offset];
                    srcColor = this.gl.DST_COLOR;
                    dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                    srcAlpha = this.gl.ZERO;
                    dstAlpha = this.gl.ONE;
                    break;
            }
        }
        this.gl.useProgram(shaderSet.shaderProgram);
        // 頂点配列の設定
        if (renderer._bufferData.vertex == null) {
            renderer._bufferData.vertex = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
        // 頂点配列の設定
        const vertexArray = model.getDrawableVertices(index);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
        this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, 0, 0);
        // テクスチャ頂点の設定
        if (renderer._bufferData.uv == null) {
            renderer._bufferData.uv = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
        const uvArray = model.getDrawableVertexUvs(index);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
        this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
        if (masked) {
            this.gl.activeTexture(this.gl.TEXTURE1);
            // frameBufferに書かれたテクスチャ
            const tex = renderer
                .getDrawableMaskBuffer(renderer.getClippingContextBufferForDrawable()._bufferIndex)
                .getColorBuffer();
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
            this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
            // view座標をClippingContextの座標に変換するための行列を設定
            this.gl.uniformMatrix4fv(shaderSet.uniformClipMatrixLocation, false, renderer.getClippingContextBufferForDrawable()._matrixForDraw.getArray());
            // 使用するカラーチャンネルを設定
            const channelIndex = renderer.getClippingContextBufferForDrawable()._layoutChannelIndex;
            const colorChannel = renderer
                .getClippingContextBufferForDrawable()
                .getClippingManager()
                .getChannelFlagAsColor(channelIndex);
            this.gl.uniform4f(shaderSet.uniformChannelFlagLocation, colorChannel.r, colorChannel.g, colorChannel.b, colorChannel.a);
            if (model.isBlendModeEnabled()) {
                this.gl.uniform1f(shaderSet.uniformInvertMaskFlagLocation, invertedMask ? 1.0 : 0.0);
            }
        }
        // テクスチャ設定
        const textureNo = model.getDrawableTextureIndex(index);
        const textureId = renderer.getBindedTextures().get(textureNo);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
        this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
        //座標変換
        const matrix4x4 = renderer.getMvpMatrix();
        this.gl.uniformMatrix4fv(shaderSet.uniformMatrixLocation, false, matrix4x4.getArray());
        //ベース色の取得
        let baseColor = null;
        if (model.isBlendModeEnabled()) {
            // ブレンドモードではモデルカラーは最後に処理するため不透明度のみ対応させる
            const drawableOpacity = model.getDrawableOpacity(index);
            baseColor = new CubismTextureColor(drawableOpacity, drawableOpacity, drawableOpacity, drawableOpacity);
        }
        else {
            baseColor = renderer.getModelColorWithOpacity(model.getDrawableOpacity(index));
        }
        const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
        const multiplyColor = multiplyAndScreenColor.getDrawableMultiplyColor(index);
        const screenColor = multiplyAndScreenColor.getDrawableScreenColor(index);
        this.gl.uniform4f(shaderSet.uniformBaseColorLocation, baseColor.r, baseColor.g, baseColor.b, baseColor.a);
        this.gl.uniform4f(shaderSet.uniformMultiplyColorLocation, multiplyColor.r, multiplyColor.g, multiplyColor.b, multiplyColor.a);
        this.gl.uniform4f(shaderSet.uniformScreenColorLocation, screenColor.r, screenColor.g, screenColor.b, screenColor.a);
        // Cubism 5.3以降のシェーダを使用する場合
        if (model.isBlendModeEnabled()) {
            this.gl.activeTexture(this.gl.TEXTURE2);
            // Cubism 5.2以前のシェーダを使用する場合は不要なのでこの処理をスキップ
            if (!isUsingCompatible) {
                const tex = renderer
                    .getModelRenderTarget(1)
                    .getColorBuffer();
                this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
                this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
            }
        }
        // IBOを作成し、データを転送
        if (renderer._bufferData.index == null) {
            renderer._bufferData.index = this.gl.createBuffer();
        }
        const indexArray = model.getDrawableVertexIndices(index);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, renderer._bufferData.index);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indexArray, this.gl.DYNAMIC_DRAW);
        this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
    }
    /**
     * オフスクリーン用のシェーダプログラムの一連のセットアップを実行する
     *
     * @param renderer レンダラー
     * @param model 描画対象のモデル
     * @param offscreen 描画対象のオフスクリーン
     */
    setupShaderProgramForOffscreen(renderer, model, offscreen) {
        if (!renderer.isPremultipliedAlpha()) {
            CubismLogError('NoPremultipliedAlpha is not allowed');
        }
        if (this._shaderSets.length == 0) {
            this.generateShaders();
        }
        if (this._isShaderLoaded == false) {
            CubismLogWarning('Shader program is not initialized.');
            return;
        }
        // Blending
        let srcColor;
        let dstColor;
        let srcAlpha;
        let dstAlpha;
        const offscreenIndex = offscreen.getOffscreenIndex();
        // _shaderSets用のオフセット計算
        const masked = renderer.getClippingContextBufferForOffscreen() != null; // この描画オブジェクトはマスク対象か
        const invertedMask = model.getOffscreenInvertedMask(offscreenIndex);
        const offset = masked ? (invertedMask ? 2 : 1) : 0;
        let shaderSet;
        // Cubism 5.2以前のシェーダを使用する場合はtrue
        let isUsingCompatible = true;
        const colorBlendMode = model.getOffscreenColorBlend(offscreenIndex);
        const alphaBlendMode = model.getOffscreenAlphaBlend(offscreenIndex);
        if (colorBlendMode == CubismColorBlend.ColorBlend_None ||
            alphaBlendMode == CubismAlphaBlend.AlphaBlend_None ||
            (colorBlendMode == CubismColorBlend.ColorBlend_Normal &&
                alphaBlendMode == CubismAlphaBlend.AlphaBlend_Over)) {
            // Cubism 5.2以前のシェーダを使用する。
            shaderSet =
                this._shaderSets[ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset];
            srcColor = this.gl.ONE;
            dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
            srcAlpha = this.gl.ONE;
            dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
        }
        else {
            switch (colorBlendMode) {
                // Cubism 5.2以前のシェーダを使用する。
                case CubismColorBlend.ColorBlend_AddCompatible:
                    shaderSet =
                        this._shaderSets[ShaderNames.ShaderNames_AddPremultipliedAlpha + offset];
                    srcColor = this.gl.ONE;
                    dstColor = this.gl.ONE;
                    srcAlpha = this.gl.ZERO;
                    dstAlpha = this.gl.ONE;
                    break;
                case CubismColorBlend.ColorBlend_MultiplyCompatible:
                    shaderSet =
                        this._shaderSets[ShaderNames.ShaderNames_MultPremultipliedAlpha + offset];
                    srcColor = this.gl.DST_COLOR;
                    dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
                    srcAlpha = this.gl.ZERO;
                    dstAlpha = this.gl.ONE;
                    break;
                default:
                    {
                        const srcBuffer = offscreen.getOldOffscreen() != null
                            ? offscreen.getOldOffscreen()
                            : renderer.getModelRenderTarget(0);
                        // 先にコピーを行う
                        CubismRenderTarget_WebGL.copyBuffer(this.gl, srcBuffer, renderer.getModelRenderTarget(1));
                        const baseShaderSetIndex = this._blendShaderSetMap.get(this._colorBlendMap.get(colorBlendMode) +
                            this._alphaBlendMap.get(alphaBlendMode));
                        shaderSet = this._shaderSets[baseShaderSetIndex + offset];
                        srcColor = this.gl.ONE;
                        dstColor = this.gl.ZERO;
                        srcAlpha = this.gl.ONE;
                        dstAlpha = this.gl.ZERO;
                        isUsingCompatible = false;
                    }
                    break;
            }
        }
        this.gl.useProgram(shaderSet.shaderProgram);
        // 頂点配列の設定
        CubismRenderTarget_WebGL.copyBuffer(this.gl, offscreen, renderer.getModelRenderTarget(2));
        this.gl.activeTexture(this.gl.TEXTURE0);
        const tex0 = renderer.getModelRenderTarget(2).getColorBuffer();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex0);
        this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
        //座標変換
        const matrix4x4 = new CubismMatrix44();
        matrix4x4.loadIdentity();
        this.gl.uniformMatrix4fv(shaderSet.uniformMatrixLocation, false, matrix4x4.getArray());
        // ベース色の取得
        const offscreenOpacity = model.getOffscreenOpacity(offscreenIndex);
        // 乗算済みアルファを使用するのでオフスクリーンの透明度を 1.0 に乗算した状態
        const baseColor = new CubismTextureColor(offscreenOpacity, offscreenOpacity, offscreenOpacity, offscreenOpacity);
        const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
        const multiplyColor = multiplyAndScreenColor.getOffscreenMultiplyColor(offscreenIndex);
        const screenColor = multiplyAndScreenColor.getOffscreenScreenColor(offscreenIndex);
        this.gl.uniform4f(shaderSet.uniformBaseColorLocation, baseColor.r, baseColor.g, baseColor.b, baseColor.a);
        this.gl.uniform4f(shaderSet.uniformMultiplyColorLocation, multiplyColor.r, multiplyColor.g, multiplyColor.b, multiplyColor.a);
        this.gl.uniform4f(shaderSet.uniformScreenColorLocation, screenColor.r, screenColor.g, screenColor.b, screenColor.a);
        this.gl.activeTexture(this.gl.TEXTURE2);
        // Cubism 5.2以前のシェーダを使用する場合は不要なのでこの処理をスキップ
        if (!isUsingCompatible) {
            const tex1 = renderer
                .getModelRenderTarget(1)
                .getColorBuffer();
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex1);
            this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
        }
        if (masked) {
            this.gl.activeTexture(this.gl.TEXTURE1);
            // frameBufferに書かれたテクスチャ
            const tex2 = renderer
                .getOffscreenMaskBuffer(renderer.getClippingContextBufferForOffscreen()._bufferIndex)
                .getColorBuffer();
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex2);
            this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
            // view座標をClippingContextの座標に変換するための行列を設定
            this.gl.uniformMatrix4fv(shaderSet.uniformClipMatrixLocation, false, renderer
                .getClippingContextBufferForOffscreen()
                ._matrixForDraw.getArray());
            // 使用するカラーチャンネルを設定
            const channelIndex = renderer.getClippingContextBufferForOffscreen()._layoutChannelIndex;
            const colorChannel = renderer
                .getClippingContextBufferForOffscreen()
                .getClippingManager()
                .getChannelFlagAsColor(channelIndex);
            this.gl.uniform4f(shaderSet.uniformChannelFlagLocation, colorChannel.r, colorChannel.g, colorChannel.b, colorChannel.a);
            if (model.isBlendModeEnabled()) {
                this.gl.uniform1f(shaderSet.uniformInvertMaskFlagLocation, invertedMask ? 1.0 : 0.0);
            }
        }
        // 頂点位置属性の設定
        if (!renderer._bufferData.vertex) {
            renderer._bufferData.vertex = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetVertexArray, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
        this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
        // テクスチャ座標属性の設定
        if (!renderer._bufferData.uv) {
            renderer._bufferData.uv = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetReverseUvArray, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
        this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
        this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
    }
    /**
     * マスク用のシェーダプログラムの一連のセットアップを実行する
     *
     * @param renderer レンダラー
     * @param model 描画対象のモデル
     * @param index 描画対象のメッシュのインデックス
     */
    setupShaderProgramForMask(renderer, model, index) {
        if (!renderer.isPremultipliedAlpha()) {
            CubismLogError('NoPremultipliedAlpha is not allowed');
        }
        if (this._shaderSets.length == 0) {
            this.generateShaders();
        }
        if (this._isShaderLoaded == false) {
            CubismLogWarning('Shader program is not initialized.');
            return;
        }
        const shaderSet = this._shaderSets[ShaderNames.ShaderNames_SetupMask];
        this.gl.useProgram(shaderSet.shaderProgram);
        // 頂点配列の設定
        if (renderer._bufferData.vertex == null) {
            renderer._bufferData.vertex = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
        const vertexArray = model.getDrawableVertices(index);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
        this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, 0, 0);
        //テクスチャ設定
        if (renderer._bufferData.uv == null) {
            renderer._bufferData.uv = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
        const textureNo = model.getDrawableTextureIndex(index);
        const textureId = renderer.getBindedTextures().get(textureNo);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
        this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
        // テクスチャ頂点の設定
        if (renderer._bufferData.uv == null) {
            renderer._bufferData.uv = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
        const uvArray = model.getDrawableVertexUvs(index);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
        this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
        // チャンネル
        const channelIndex = renderer.getClippingContextBufferForMask()._layoutChannelIndex;
        const colorChannel = renderer
            .getClippingContextBufferForMask()
            .getClippingManager()
            .getChannelFlagAsColor(channelIndex);
        this.gl.uniform4f(shaderSet.uniformChannelFlagLocation, colorChannel.r, colorChannel.g, colorChannel.b, colorChannel.a);
        this.gl.uniformMatrix4fv(shaderSet.uniformClipMatrixLocation, false, renderer.getClippingContextBufferForMask()._matrixForMask.getArray());
        const rect = renderer.getClippingContextBufferForMask()._layoutBounds;
        this.gl.uniform4f(shaderSet.uniformBaseColorLocation, rect.x * 2.0 - 1.0, rect.y * 2.0 - 1.0, rect.getRight() * 2.0 - 1.0, rect.getBottom() * 2.0 - 1.0);
        // Blending
        const srcColor = this.gl.ZERO;
        const dstColor = this.gl.ONE_MINUS_SRC_COLOR;
        const srcAlpha = this.gl.ZERO;
        const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
        // IBOを作成し、データを転送
        if (renderer._bufferData.index == null) {
            renderer._bufferData.index = this.gl.createBuffer();
        }
        const indexArray = model.getDrawableVertexIndices(index);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, renderer._bufferData.index);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indexArray, this.gl.DYNAMIC_DRAW);
        this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
    }
    /**
     * オフスクリーンのレンダリングターゲット用のシェーダープログラムを設定する
     *
     * @param renderer レンダラー
     */
    setupShaderProgramForOffscreenRenderTarget(renderer) {
        if (this._shaderSets.length == 0) {
            this.generateShaders();
        }
        if (this._isShaderLoaded == false) {
            CubismLogWarning('Shader program is not initialized.');
            return;
        }
        // この時点のテクスチャはPMAになっているはずなので計算を行う
        const baseColor = renderer.getModelColor();
        baseColor.r *= baseColor.a;
        baseColor.g *= baseColor.a;
        baseColor.b *= baseColor.a;
        this.copyTexture(renderer, baseColor);
    }
    /**
     * オフスクリーンのレンダリングターゲットの内容をコピーする
     *
     * @param renderer レンダラー
     * @param baseColor ベースカラー
     */
    copyTexture(renderer, baseColor) {
        // Blending
        const srcColor = this.gl.ONE;
        const dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
        const srcAlpha = this.gl.ONE;
        const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
        const shaderSet = this._shaderSets[10]; // ShaderNames_Copy = 10
        this.gl.useProgram(shaderSet.shaderProgram);
        this.gl.uniform4f(shaderSet.uniformBaseColorLocation, baseColor.r, baseColor.g, baseColor.b, baseColor.a);
        // オフスクリーンの内容を設定
        this.gl.activeTexture(this.gl.TEXTURE0);
        const tex = renderer.getModelRenderTarget(0).getColorBuffer();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
        // 頂点位置属性の設定
        if (!renderer._bufferData.vertex) {
            renderer._bufferData.vertex = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetVertexArray, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
        this.gl.vertexAttribPointer(shaderSet.attributePositionLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
        // テクスチャ座標属性の設定
        if (!renderer._bufferData.uv) {
            renderer._bufferData.uv = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, s_renderTargetUvArray, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
        this.gl.vertexAttribPointer(shaderSet.attributeTexCoordLocation, 2, this.gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 2, 0);
        this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
    }
    /**
     * シェーダープログラムを解放する
     */
    releaseShaderProgram() {
        for (let i = 0; i < this._shaderSets.length; i++) {
            this.gl.deleteProgram(this._shaderSets[i].shaderProgram);
            this._shaderSets[i].shaderProgram = 0;
            this._shaderSets[i] = void 0;
            this._shaderSets[i] = null;
        }
    }
    /**
     * シェーダープログラムを初期化する
     *
     * @param vertShaderSrc 頂点シェーダのソース
     * @param fragShaderSrc フラグメントシェーダのソース
     */
    generateShaders() {
        if (this._isShaderLoading) {
            return;
        }
        this._isShaderLoading = true;
        this._isShaderLoaded = false;
        this._shaderSets.length = this._shaderCount;
        for (let i = 0; i < this._shaderCount; i++) {
            this._shaderSets[i] = new CubismShaderSet();
        }
        // シェーダーのソースの読み込み
        this.loadShaders()
            .then(() => {
            // NOTE: ファイルの読み込みを待つ必要があるためこのようにする
            this.registerShader(); // 通常シェーダーの登録
            this.registerBlendShader(); // ブレンドモードシェーダーの登録
            this._isShaderLoading = false;
            this._isShaderLoaded = true;
        })
            .catch(error => {
            this._isShaderLoading = false;
            console.error('Failed to load shaders:', error);
        });
    }
    /**
     * シェーダープログラムを登録する
     */
    registerShader() {
        const vertexShaderSrc = this._vertShaderSrc;
        const vertexShaderSrcMasked = this._vertShaderSrcMasked;
        const vertexShaderSrcSetupMask = this._vertShaderSrcSetupMask;
        const fragmentShaderSrcSetupMask = this._fragShaderSrcSetupMask;
        const fragmentShaderSrcPremultipliedAlpha = this._fragShaderSrcPremultipliedAlpha;
        const fragmentShaderSrcMaskPremultipliedAlpha = this._fragShaderSrcMaskPremultipliedAlpha;
        const fragmentShaderSrcMaskInvertedPremultipliedAlpha = this._fragShaderSrcMaskInvertedPremultipliedAlpha;
        this._shaderSets[0].shaderProgram = this.loadShaderProgram(vertexShaderSrcSetupMask, fragmentShaderSrcSetupMask);
        this._shaderSets[1].shaderProgram = this.loadShaderProgram(vertexShaderSrc, fragmentShaderSrcPremultipliedAlpha);
        this._shaderSets[2].shaderProgram = this.loadShaderProgram(vertexShaderSrcMasked, fragmentShaderSrcMaskPremultipliedAlpha);
        this._shaderSets[3].shaderProgram = this.loadShaderProgram(vertexShaderSrcMasked, fragmentShaderSrcMaskInvertedPremultipliedAlpha);
        // 加算も通常と同じシェーダーを利用する
        this._shaderSets[4].shaderProgram = this._shaderSets[1].shaderProgram;
        this._shaderSets[5].shaderProgram = this._shaderSets[2].shaderProgram;
        this._shaderSets[6].shaderProgram = this._shaderSets[3].shaderProgram;
        // 乗算も通常と同じシェーダーを利用する
        this._shaderSets[7].shaderProgram = this._shaderSets[1].shaderProgram;
        this._shaderSets[8].shaderProgram = this._shaderSets[2].shaderProgram;
        this._shaderSets[9].shaderProgram = this._shaderSets[3].shaderProgram;
        // SetupMask
        this._shaderSets[0].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[0].shaderProgram, 'a_position');
        this._shaderSets[0].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[0].shaderProgram, 'a_texCoord');
        this._shaderSets[0].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 's_texture0');
        this._shaderSets[0].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 'u_clipMatrix');
        this._shaderSets[0].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 'u_channelFlag');
        this._shaderSets[0].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[0].shaderProgram, 'u_baseColor');
        // 通常（PremultipliedAlpha）
        this._shaderSets[1].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[1].shaderProgram, 'a_position');
        this._shaderSets[1].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[1].shaderProgram, 'a_texCoord');
        this._shaderSets[1].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 's_texture0');
        this._shaderSets[1].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_matrix');
        this._shaderSets[1].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_baseColor');
        this._shaderSets[1].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_multiplyColor');
        this._shaderSets[1].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[1].shaderProgram, 'u_screenColor');
        // 通常（クリッピング、PremultipliedAlpha）
        this._shaderSets[2].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[2].shaderProgram, 'a_position');
        this._shaderSets[2].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[2].shaderProgram, 'a_texCoord');
        this._shaderSets[2].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 's_texture0');
        this._shaderSets[2].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 's_texture1');
        this._shaderSets[2].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_matrix');
        this._shaderSets[2].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_clipMatrix');
        this._shaderSets[2].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_channelFlag');
        this._shaderSets[2].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_baseColor');
        this._shaderSets[2].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_multiplyColor');
        this._shaderSets[2].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[2].shaderProgram, 'u_screenColor');
        // 通常（クリッピング・反転, PremultipliedAlpha）
        this._shaderSets[3].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[3].shaderProgram, 'a_position');
        this._shaderSets[3].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[3].shaderProgram, 'a_texCoord');
        this._shaderSets[3].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 's_texture0');
        this._shaderSets[3].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 's_texture1');
        this._shaderSets[3].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_matrix');
        this._shaderSets[3].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_clipMatrix');
        this._shaderSets[3].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_channelFlag');
        this._shaderSets[3].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_baseColor');
        this._shaderSets[3].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_multiplyColor');
        this._shaderSets[3].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[3].shaderProgram, 'u_screenColor');
        // 加算（PremultipliedAlpha）
        this._shaderSets[4].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[4].shaderProgram, 'a_position');
        this._shaderSets[4].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[4].shaderProgram, 'a_texCoord');
        this._shaderSets[4].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 's_texture0');
        this._shaderSets[4].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_matrix');
        this._shaderSets[4].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_baseColor');
        this._shaderSets[4].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_multiplyColor');
        this._shaderSets[4].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[4].shaderProgram, 'u_screenColor');
        // 加算（クリッピング、PremultipliedAlpha）
        this._shaderSets[5].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[5].shaderProgram, 'a_position');
        this._shaderSets[5].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[5].shaderProgram, 'a_texCoord');
        this._shaderSets[5].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 's_texture0');
        this._shaderSets[5].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 's_texture1');
        this._shaderSets[5].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_matrix');
        this._shaderSets[5].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_clipMatrix');
        this._shaderSets[5].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_channelFlag');
        this._shaderSets[5].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_baseColor');
        this._shaderSets[5].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_multiplyColor');
        this._shaderSets[5].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[5].shaderProgram, 'u_screenColor');
        // 加算（クリッピング・反転、PremultipliedAlpha）
        this._shaderSets[6].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[6].shaderProgram, 'a_position');
        this._shaderSets[6].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[6].shaderProgram, 'a_texCoord');
        this._shaderSets[6].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 's_texture0');
        this._shaderSets[6].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 's_texture1');
        this._shaderSets[6].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_matrix');
        this._shaderSets[6].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_clipMatrix');
        this._shaderSets[6].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_channelFlag');
        this._shaderSets[6].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_baseColor');
        this._shaderSets[6].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_multiplyColor');
        this._shaderSets[6].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[6].shaderProgram, 'u_screenColor');
        // 乗算（PremultipliedAlpha）
        this._shaderSets[7].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[7].shaderProgram, 'a_position');
        this._shaderSets[7].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[7].shaderProgram, 'a_texCoord');
        this._shaderSets[7].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 's_texture0');
        this._shaderSets[7].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_matrix');
        this._shaderSets[7].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_baseColor');
        this._shaderSets[7].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_multiplyColor');
        this._shaderSets[7].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[7].shaderProgram, 'u_screenColor');
        // 乗算（クリッピング、PremultipliedAlpha）
        this._shaderSets[8].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[8].shaderProgram, 'a_position');
        this._shaderSets[8].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[8].shaderProgram, 'a_texCoord');
        this._shaderSets[8].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 's_texture0');
        this._shaderSets[8].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 's_texture1');
        this._shaderSets[8].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_matrix');
        this._shaderSets[8].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_clipMatrix');
        this._shaderSets[8].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_channelFlag');
        this._shaderSets[8].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_baseColor');
        this._shaderSets[8].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_multiplyColor');
        this._shaderSets[8].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[8].shaderProgram, 'u_screenColor');
        // 乗算（クリッピング・反転、PremultipliedAlpha）
        this._shaderSets[9].attributePositionLocation = this.gl.getAttribLocation(this._shaderSets[9].shaderProgram, 'a_position');
        this._shaderSets[9].attributeTexCoordLocation = this.gl.getAttribLocation(this._shaderSets[9].shaderProgram, 'a_texCoord');
        this._shaderSets[9].samplerTexture0Location = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 's_texture0');
        this._shaderSets[9].samplerTexture1Location = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 's_texture1');
        this._shaderSets[9].uniformMatrixLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_matrix');
        this._shaderSets[9].uniformClipMatrixLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_clipMatrix');
        this._shaderSets[9].uniformChannelFlagLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_channelFlag');
        this._shaderSets[9].uniformBaseColorLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_baseColor');
        this._shaderSets[9].uniformMultiplyColorLocation =
            this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_multiplyColor');
        this._shaderSets[9].uniformScreenColorLocation = this.gl.getUniformLocation(this._shaderSets[9].shaderProgram, 'u_screenColor');
    }
    /**
     * ブレンドモード用のシェーダープログラムを登録する
     */
    registerBlendShader() {
        // コピー用シェーダーの設定
        const vertShaderSrcCopy = this._vertShaderSrcCopy;
        const fragShaderSrcCopy = this._fragShaderSrcCopy;
        const copyShaderSet = this._shaderSets[10]; // ShaderNames.Copy = 10
        copyShaderSet.shaderProgram = this.loadShaderProgram(vertShaderSrcCopy, fragShaderSrcCopy);
        copyShaderSet.attributeTexCoordLocation = this.gl.getAttribLocation(copyShaderSet.shaderProgram, 'a_texCoord');
        copyShaderSet.attributePositionLocation = this.gl.getAttribLocation(copyShaderSet.shaderProgram, 'a_position');
        copyShaderSet.uniformBaseColorLocation = this.gl.getUniformLocation(copyShaderSet.shaderProgram, 'u_baseColor');
        let shaderSetIndex = 11;
        // ブレンドモード用シェーダーの設定
        for (let colorBlendIndex = 0; colorBlendIndex < this._colorBlendValues.length; colorBlendIndex++) {
            // NONEと後方互換はスキップ
            if (this._colorBlendValues[colorBlendIndex] ==
                CubismColorBlend.ColorBlend_None ||
                this._colorBlendValues[colorBlendIndex] ==
                    CubismColorBlend.ColorBlend_AddCompatible ||
                this._colorBlendValues[colorBlendIndex] ==
                    CubismColorBlend.ColorBlend_MultiplyCompatible) {
                continue;
            }
            // カラーブレンド用のマクロ
            const colorBlendValue = this._colorBlendValues[colorBlendIndex];
            const colorBlendName = this._colorBlendMap
                .get(colorBlendValue)
                .toUpperCase();
            const colorBlendMacro = `#define COLOR_BLEND_${colorBlendName}\n`;
            for (let alphablendIndex = 0; alphablendIndex < this._alphaBlendValues.length; alphablendIndex++) {
                // NONEと、カラーブレンド「Normal」かつアルファブレンド「Over」はスキップ
                if (this._alphaBlendValues[alphablendIndex] ==
                    CubismAlphaBlend.AlphaBlend_None ||
                    (this._colorBlendValues[colorBlendIndex] ==
                        CubismColorBlend.ColorBlend_Normal &&
                        this._alphaBlendValues[alphablendIndex] ==
                            CubismAlphaBlend.AlphaBlend_Over)) {
                    continue;
                }
                // アルファブレンド用のマクロ
                const alphaBlendValue = this._alphaBlendValues[alphablendIndex];
                const alphaBlendName = this._alphaBlendMap
                    .get(alphaBlendValue)
                    .toUpperCase();
                const alphaBlendMacro = `#define ALPHA_BLEND_${alphaBlendName}\n`;
                // シェーダーのソースを生成
                this.generateBlendShader(colorBlendMacro, alphaBlendMacro, shaderSetIndex);
                this._blendShaderSetMap.set(this._colorBlendMap.get(this._colorBlendValues[colorBlendIndex]) +
                    this._alphaBlendMap.get(this._alphaBlendValues[alphablendIndex]), shaderSetIndex);
                // 1つの組み合わせが終わるこのタイミングでシェーダーのインデックスを更新
                shaderSetIndex += ShaderType.ShaderType_Count;
            }
        }
    }
    /**
     * ブレンドモード用のシェーダープログラムを生成する
     *
     * @param colorBlendMacro カラーブレンド用のマクロ
     * @param alphaBlendMacro アルファブレンド用のマクロ
     * @param shaderSetBaseIndex _shaderSets のインデックス
     */
    generateBlendShader(colorBlendMacro, alphaBlendMacro, shaderSetBaseIndex) {
        for (let shaderTypeIndex = 0; shaderTypeIndex < ShaderType.ShaderType_Count; shaderTypeIndex++) {
            // ループごとにシェーダーのソースを初期化
            let vertexShaderSrc = '';
            let fragmentShaderStr = 'precision mediump float;\n';
            // シェーダの種類が変わるたびにインデックスを変更
            const shaderSetIndex = shaderSetBaseIndex + shaderTypeIndex;
            // マクロの定義
            fragmentShaderStr += colorBlendMacro;
            fragmentShaderStr += alphaBlendMacro;
            // ブレンドモードの種類に応じたマクロの定義
            fragmentShaderStr += this._fragShaderSrcColorBlend;
            fragmentShaderStr += this._fragShaderSrcAlphaBlend;
            // シェーダの種類に応じたマクロの定義
            if (shaderTypeIndex == ShaderType.ShaderType_Masked ||
                shaderTypeIndex == ShaderType.ShaderType_MaskedInverted) {
                const clippingMaskMacro = '#define CLIPPING_MASK\n';
                vertexShaderSrc += clippingMaskMacro;
                fragmentShaderStr += clippingMaskMacro;
            }
            // シェーダの本体のソースをファイルから読み込み
            vertexShaderSrc += this._vertShaderSrcBlend;
            fragmentShaderStr += this._fragShaderSrcBlend;
            // シェーダープログラムの生成
            this._shaderSets[shaderSetIndex].shaderProgram = this.loadShaderProgram(vertexShaderSrc, fragmentShaderStr);
            // シェーダープログラムへの変数のリンク
            this._shaderSets[shaderSetIndex].attributePositionLocation =
                this.gl.getAttribLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'a_position');
            this._shaderSets[shaderSetIndex].attributeTexCoordLocation =
                this.gl.getAttribLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'a_texCoord');
            this._shaderSets[shaderSetIndex].samplerTexture0Location =
                this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 's_texture0');
            this._shaderSets[shaderSetIndex].uniformMatrixLocation =
                this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_matrix');
            this._shaderSets[shaderSetIndex].uniformBaseColorLocation =
                this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_baseColor');
            this._shaderSets[shaderSetIndex].uniformMultiplyColorLocation =
                this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_multiplyColor');
            this._shaderSets[shaderSetIndex].uniformScreenColorLocation =
                this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_screenColor');
            // ブレンドモード用のテクスチャ
            this._shaderSets[shaderSetIndex].samplerFrameBufferTextureLocation =
                this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 's_blendTexture');
            // クリップ対象の場合
            if (shaderTypeIndex == ShaderType.ShaderType_Masked ||
                shaderTypeIndex == ShaderType.ShaderType_MaskedInverted) {
                // マスク用テクスチャ
                this._shaderSets[shaderSetIndex].samplerTexture1Location =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 's_texture1');
                // クリップ用の行列
                this._shaderSets[shaderSetIndex].uniformClipMatrixLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_clipMatrix');
                // チャンネルフラグ
                this._shaderSets[shaderSetIndex].uniformChannelFlagLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_channelFlag');
                // 反転マスク用の値（反転なら 1.0 が代入される）
                this._shaderSets[shaderSetIndex].uniformInvertMaskFlagLocation =
                    this.gl.getUniformLocation(this._shaderSets[shaderSetIndex].shaderProgram, 'u_invertClippingMask');
            }
        }
    }
    /**
     * シェーダプログラムをロードしてアドレスを返す
     *
     * @param vertexShaderSource    頂点シェーダのソース
     * @param fragmentShaderSource  フラグメントシェーダのソース
     *
     * @return シェーダプログラムのアドレス
     */
    loadShaderProgram(vertexShaderSource, fragmentShaderSource) {
        // Create Shader Program
        let shaderProgram = this.gl.createProgram();
        let vertShader = this.compileShaderSource(this.gl.VERTEX_SHADER, vertexShaderSource);
        if (!vertShader) {
            CubismLogError('Vertex shader compile error!');
            return 0;
        }
        let fragShader = this.compileShaderSource(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        if (!fragShader) {
            CubismLogError('Fragment shader compile error!');
            return 0;
        }
        // Attach vertex shader to program
        this.gl.attachShader(shaderProgram, vertShader);
        // Attach fragment shader to program
        this.gl.attachShader(shaderProgram, fragShader);
        // link program
        this.gl.linkProgram(shaderProgram);
        const linkStatus = this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS);
        // リンクに失敗したらシェーダーを削除
        if (!linkStatus) {
            CubismLogError('Failed to link program: {0}', shaderProgram);
            this.gl.deleteShader(vertShader);
            vertShader = 0;
            this.gl.deleteShader(fragShader);
            fragShader = 0;
            if (shaderProgram) {
                this.gl.deleteProgram(shaderProgram);
                shaderProgram = 0;
            }
            return 0;
        }
        // Release vertex and fragment shaders.
        this.gl.deleteShader(vertShader);
        this.gl.deleteShader(fragShader);
        return shaderProgram;
    }
    /**
     * シェーダープログラムをコンパイルする
     *
     * @param shaderType シェーダタイプ(Vertex/Fragment)
     * @param shaderSource シェーダソースコード
     *
     * @return コンパイルされたシェーダープログラム
     */
    compileShaderSource(shaderType, shaderSource) {
        const source = shaderSource;
        const shader = this.gl.createShader(shaderType);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!shader) {
            const log = this.gl.getShaderInfoLog(shader);
            CubismLogError('Shader compile log: {0} ', log);
        }
        const status = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
        if (!status) {
            const log = this.gl.getShaderInfoLog(shader);
            CubismLogError('Shader compile log: {0} ', log);
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
    /**
     * WebGLレンダリングコンテキストを設定する
     *
     * @param gl WebGLレンダリングコンテキスト
     */
    setGl(gl) {
        this.gl = gl;
    }
    /**
     * ブレンドモード用のシェーダーパスを設定する
     *
     * @param shaderPath シェーダーパス
     */
    setShaderPath(shaderPath) {
        this._shaderPath = shaderPath;
    }
    /**
     * シェーダーパスを取得する
     *
     * @return シェーダーパス
     */
    getShaderPath() {
        return this._shaderPath;
    }
}
/**
 * GLContextごとにCubismShader_WebGLを確保するためのクラス
 * シングルトンなクラスであり、CubismShaderManager_WebGL.getInstanceからアクセスする。
 */
export class CubismShaderManager_WebGL {
    /**
     * インスタンスを取得する（シングルトン）
     *
     * @return インスタンス
     */
    static getInstance() {
        if (s_instance == null) {
            s_instance = new CubismShaderManager_WebGL();
        }
        return s_instance;
    }
    /**
     * インスタンスを開放する（シングルトン）
     */
    static deleteInstance() {
        if (s_instance) {
            s_instance.release();
            s_instance = null;
        }
    }
    /**
     * Privateなコンストラクタ
     */
    constructor() {
        this._shaderMap = new Map();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
        for (const item of this._shaderMap) {
            item[1].release();
        }
        this._shaderMap.clear();
    }
    /**
     * GLContextをキーにShaderを取得する
     *
     * @param gl glコンテキスト
     *
     * @return shaderを返す
     */
    getShader(gl) {
        return this._shaderMap.get(gl);
    }
    /**
     * GLContextを登録する
     *
     * @param gl glコンテキスト
     */
    setGlContext(gl) {
        if (!this._shaderMap.has(gl)) {
            const instance = new CubismShader_WebGL();
            instance.setGl(gl);
            this._shaderMap.set(gl, instance);
        }
    }
}
/**
 * CubismShader_WebGLのインナークラス
 */
export class CubismShaderSet {
}
/**
 * シェーダーの名前を定義する列挙型
 */
export var ShaderNames;
(function (ShaderNames) {
    // SetupMask
    ShaderNames[ShaderNames["ShaderNames_SetupMask"] = 0] = "ShaderNames_SetupMask";
    // Normal
    ShaderNames[ShaderNames["ShaderNames_NormalPremultipliedAlpha"] = 1] = "ShaderNames_NormalPremultipliedAlpha";
    ShaderNames[ShaderNames["ShaderNames_NormalMaskedPremultipliedAlpha"] = 2] = "ShaderNames_NormalMaskedPremultipliedAlpha";
    ShaderNames[ShaderNames["ShaderNames_NomralMaskedInvertedPremultipliedAlpha"] = 3] = "ShaderNames_NomralMaskedInvertedPremultipliedAlpha";
    // Add
    ShaderNames[ShaderNames["ShaderNames_AddPremultipliedAlpha"] = 4] = "ShaderNames_AddPremultipliedAlpha";
    ShaderNames[ShaderNames["ShaderNames_AddMaskedPremultipliedAlpha"] = 5] = "ShaderNames_AddMaskedPremultipliedAlpha";
    ShaderNames[ShaderNames["ShaderNames_AddMaskedPremultipliedAlphaInverted"] = 6] = "ShaderNames_AddMaskedPremultipliedAlphaInverted";
    // Mult
    ShaderNames[ShaderNames["ShaderNames_MultPremultipliedAlpha"] = 7] = "ShaderNames_MultPremultipliedAlpha";
    ShaderNames[ShaderNames["ShaderNames_MultMaskedPremultipliedAlpha"] = 8] = "ShaderNames_MultMaskedPremultipliedAlpha";
    ShaderNames[ShaderNames["ShaderNames_MultMaskedPremultipliedAlphaInverted"] = 9] = "ShaderNames_MultMaskedPremultipliedAlphaInverted";
    // ShaderCount
    ShaderNames[ShaderNames["ShaderNames_ShaderCount"] = 10] = "ShaderNames_ShaderCount";
})(ShaderNames || (ShaderNames = {}));
/**
 * シェーダーの種類を定義する列挙型
 */
export var ShaderType;
(function (ShaderType) {
    ShaderType[ShaderType["ShaderType_Normal"] = 0] = "ShaderType_Normal";
    ShaderType[ShaderType["ShaderType_Masked"] = 1] = "ShaderType_Masked";
    ShaderType[ShaderType["ShaderType_MaskedInverted"] = 2] = "ShaderType_MaskedInverted";
    ShaderType[ShaderType["ShaderType_Count"] = 3] = "ShaderType_Count";
})(ShaderType || (ShaderType = {}));
// Namespace definition for compatibility.
import * as $ from './cubismshader_webgl.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismShaderSet = $.CubismShaderSet;
    Live2DCubismFramework.CubismShader_WebGL = $.CubismShader_WebGL;
    Live2DCubismFramework.CubismShaderManager_WebGL = $.CubismShaderManager_WebGL;
    Live2DCubismFramework.ShaderNames = $.ShaderNames;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
