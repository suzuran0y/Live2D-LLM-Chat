/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { CubismMath } from '../math/cubismmath.js';
import { CubismMatrix44 } from '../math/cubismmatrix44.js';
import { csmRect } from '../type/csmrectf.js';
import { CubismLogInfo } from '../utils/cubismdebug.js';
/**
 * モデル描画を処理するレンダラ
 *
 * サブクラスに環境依存の描画命令を記述する。
 */
export class CubismRenderer {
    /**
     * レンダラのインスタンスを生成して取得する
     *
     * @return レンダラのインスタンス
     */
    static create() {
        return null;
    }
    /**
     * レンダラのインスタンスを解放する
     */
    static delete(renderer) {
        renderer = null;
    }
    /**
     * レンダラの初期化処理を実行する
     * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
     *
     * @param model モデルのインスタンス
     */
    initialize(model) {
        this._model = model;
        // ブレンドモード使用時は必ず高精細にする
        if (model.isBlendModeEnabled()) {
            this.useHighPrecisionMask(true);
            CubismLogInfo('This model uses a high-resolution mask because it operates in blend mode.');
        }
    }
    /**
     * モデルを描画する
     * @param shaderPath ブレンドモード用シェーダのパス
     */
    drawModel(shaderPath = null) {
        if (this.getModel() == null)
            return;
        // NOTE: WebGL最適化のため、デフォルトではコメントアウト
        //this.saveProfile();
        this.doDrawModel(shaderPath);
        // NOTE: WebGL最適化のため、デフォルトではコメントアウト
        //this.restoreProfile();
    }
    /**
     * Model-View-Projection 行列をセットする
     * 配列は複製されるので、元の配列は外で破棄して良い
     *
     * @param matrix44 Model-View-Projection 行列
     */
    setMvpMatrix(matrix44) {
        this._mvpMatrix4x4.setMatrix(matrix44.getArray());
    }
    /**
     * Model-View-Projection 行列を取得する
     *
     * @return Model-View-Projection 行列
     */
    getMvpMatrix() {
        return this._mvpMatrix4x4;
    }
    /**
     * モデルの色をセットする
     * 各色0.0~1.0の間で指定する（1.0が標準の状態）
     *
     * @param red 赤チャンネルの値
     * @param green 緑チャンネルの値
     * @param blue 青チャンネルの値
     * @param alpha αチャンネルの値
     */
    setModelColor(red, green, blue, alpha) {
        this._modelColor.r = CubismMath.clamp(red, 0.0, 1.0);
        this._modelColor.g = CubismMath.clamp(green, 0.0, 1.0);
        this._modelColor.b = CubismMath.clamp(blue, 0.0, 1.0);
        this._modelColor.a = CubismMath.clamp(alpha, 0.0, 1.0);
    }
    /**
     * モデルの色を取得する
     * 各色0.0~1.0の間で指定する(1.0が標準の状態)
     *
     * @return RGBAのカラー情報
     */
    getModelColor() {
        return JSON.parse(JSON.stringify(this._modelColor));
    }
    /**
     * 透明度を考慮したモデルの色を計算する。
     *
     * @param opacity 透明度
     *
     * @return RGBAのカラー情報
     */
    getModelColorWithOpacity(opacity) {
        const modelColorRGBA = this.getModelColor();
        modelColorRGBA.a *= opacity;
        if (this.isPremultipliedAlpha()) {
            modelColorRGBA.r *= modelColorRGBA.a;
            modelColorRGBA.g *= modelColorRGBA.a;
            modelColorRGBA.b *= modelColorRGBA.a;
        }
        return modelColorRGBA;
    }
    /**
     * 乗算済みαの有効・無効をセットする
     * 有効にするならtrue、無効にするならfalseをセットする
     */
    setIsPremultipliedAlpha(enable) {
        this._isPremultipliedAlpha = enable;
    }
    /**
     * 乗算済みαの有効・無効を取得する
     * @return true 乗算済みのα有効
     *         false 乗算済みのα無効
     */
    isPremultipliedAlpha() {
        return this._isPremultipliedAlpha;
    }
    /**
     * カリング（片面描画）の有効・無効をセットする。
     * 有効にするならtrue、無効にするならfalseをセットする
     */
    setIsCulling(culling) {
        this._isCulling = culling;
    }
    /**
     * カリング（片面描画）の有効・無効を取得する。
     *
     * @return true カリング有効
     *         false カリング無効
     */
    isCulling() {
        return this._isCulling;
    }
    /**
     * テクスチャの異方性フィルタリングのパラメータをセットする
     * パラメータ値の影響度はレンダラの実装に依存する
     *
     * @param n パラメータの値
     */
    setAnisotropy(n) {
        this._anisotropy = n;
    }
    /**
     * テクスチャの異方性フィルタリングのパラメータをセットする
     *
     * @return 異方性フィルタリングのパラメータ
     */
    getAnisotropy() {
        return this._anisotropy;
    }
    /**
     * レンダリングするモデルを取得する
     *
     * @return レンダリングするモデル
     */
    getModel() {
        return this._model;
    }
    /**
     * マスク描画の方式を変更する。
     * falseの場合、マスクを1枚のテクスチャに分割してレンダリングする（デフォルト）
     * 高速だが、マスク個数の上限が36に限定され、質も荒くなる
     * trueの場合、パーツ描画の前にその都度必要なマスクを描き直す
     * レンダリング品質は高いが描画処理負荷は増す
     *
     * @param high 高精細マスクに切り替えるか？
     */
    useHighPrecisionMask(high) {
        this._useHighPrecisionMask = high;
    }
    /**
     * マスクの描画方式を取得する
     *
     * @return true 高精細方式
     *         false デフォルト
     */
    isUsingHighPrecisionMask() {
        return this._useHighPrecisionMask;
    }
    /**
     * モデルを描画したバッファのサイズを設定
     *
     * @param[in]   width  -> モデルを描画したバッファの幅
     * @param[in]   height -> モデルを描画したバッファの高さ
     */
    setRenderTargetSize(width, height) {
        this._modelRenderTargetWidth = width;
        this._modelRenderTargetHeight = height;
    }
    /**
     * コンストラクタ
     */
    constructor(width, height) {
        this._modelRenderTargetWidth = width;
        this._modelRenderTargetHeight = height;
        this._isCulling = false;
        this._isPremultipliedAlpha = false;
        this._anisotropy = 0.0;
        this._model = null;
        this._modelColor = new CubismTextureColor();
        this._useHighPrecisionMask = false;
        // 単位行列に初期化
        this._mvpMatrix4x4 = new CubismMatrix44();
        this._mvpMatrix4x4.loadIdentity();
    }
}
export var CubismBlendMode;
(function (CubismBlendMode) {
    CubismBlendMode[CubismBlendMode["CubismBlendMode_Normal"] = 0] = "CubismBlendMode_Normal";
    CubismBlendMode[CubismBlendMode["CubismBlendMode_Additive"] = 1] = "CubismBlendMode_Additive";
    CubismBlendMode[CubismBlendMode["CubismBlendMode_Multiplicative"] = 2] = "CubismBlendMode_Multiplicative"; // 乗算
})(CubismBlendMode || (CubismBlendMode = {}));
/**
 * オブジェクトのタイプ
 */
export var DrawableObjectType;
(function (DrawableObjectType) {
    DrawableObjectType[DrawableObjectType["DrawableObjectType_Drawable"] = 0] = "DrawableObjectType_Drawable";
    DrawableObjectType[DrawableObjectType["DrawableObjectType_Offscreen"] = 1] = "DrawableObjectType_Offscreen";
})(DrawableObjectType || (DrawableObjectType = {}));
/**
 * テクスチャの色をRGBAで扱うためのクラス
 */
export class CubismTextureColor {
    /**
     * コンストラクタ
     */
    constructor(r = 1.0, g = 1.0, b = 1.0, a = 1.0) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}
/**
 * クリッピングマスクのコンテキスト
 */
export class CubismClippingContext {
    /**
     * 引数付きコンストラクタ
     */
    constructor(clippingDrawableIndices, clipCount) {
        // クリップしている（＝マスク用の）Drawableのインデックスリスト
        this._clippingIdList = clippingDrawableIndices;
        // マスクの数
        this._clippingIdCount = clipCount;
        this._allClippedDrawRect = new csmRect();
        this._layoutBounds = new csmRect();
        this._clippedDrawableIndexList = [];
        this._clippedOffscreenIndexList = [];
        this._matrixForMask = new CubismMatrix44();
        this._matrixForDraw = new CubismMatrix44();
        this._bufferIndex = 0;
        this._layoutChannelIndex = 0;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
        if (this._layoutBounds != null) {
            this._layoutBounds = null;
        }
        if (this._allClippedDrawRect != null) {
            this._allClippedDrawRect = null;
        }
        if (this._clippedDrawableIndexList != null) {
            this._clippedDrawableIndexList = null;
        }
        if (this._clippedOffscreenIndexList != null) {
            this._clippedOffscreenIndexList = null;
        }
    }
    /**
     * このマスクにクリップされる描画オブジェクトを追加する
     *
     * @param drawableIndex クリッピング対象に追加する描画オブジェクトのインデックス
     */
    addClippedDrawable(drawableIndex) {
        this._clippedDrawableIndexList.push(drawableIndex);
    }
    /**
     * このマスクにクリップされるオフスクリーンオブジェクトを追加する
     *
     * @param offscreenIndex クリッピング対象に追加するオフスクリーンオブジェクトのインデックス
     */
    addClippedOffscreen(offscreenIndex) {
        this._clippedOffscreenIndexList.push(offscreenIndex);
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismrenderer.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismBlendMode = $.CubismBlendMode;
    Live2DCubismFramework.CubismRenderer = $.CubismRenderer;
    Live2DCubismFramework.CubismTextureColor = $.CubismTextureColor;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
