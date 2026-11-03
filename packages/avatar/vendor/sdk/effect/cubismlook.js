/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
/**
 * ターゲットによるパラメータ追従機能
 *
 * ドラッグ入力に対するパラメータ追従機能を提供する。
 */
export class CubismLook {
    /**
     * インスタンスの作成
     */
    static create() {
        return new CubismLook();
    }
    /**
     * インスタンスの破棄
     * @param instance 対象のCubismDrag
     */
    static delete(instance) {
        if (instance != null) {
            instance = null;
        }
    }
    /**
     * ターゲット追従のパラメータの紐づけ
     * @param lookParameters ターゲット追従を紐づけたいパラメータのリスト
     */
    setParameters(lookParameters) {
        this._lookParameters = lookParameters;
    }
    /**
     * ターゲット追従に紐づいているパラメータの取得
     * @return ターゲット追従に紐づいているパラメータのリスト
     */
    getParameters() {
        return this._lookParameters;
    }
    /**
     * モデルのパラメータの更新
     * @param model 対象のモデル
     * @param dragX ターゲットのX座標
     * @param dragY ターゲットのY座標
     */
    updateParameters(model, dragX, dragY) {
        for (let i = 0; i < this._lookParameters.length; ++i) {
            const data = this._lookParameters[i];
            model.addParameterValueById(data.parameterId, data.factorX * dragX +
                data.factorY * dragY +
                data.factorXY * dragX * dragY);
        }
    }
    /**
     * コンストラクタ
     */
    constructor() {
        this._lookParameters = new Array();
    }
}
/**
 * ターゲット追従のパラメータ情報
 */
export class LookParameterData {
    /**
     * コンストラクタ
     * @param parameterId   ターゲット追従を紐づけるパラメータID
     * @param factorX       X方向ドラッグ入力に対する係数
     * @param factorY       Y方向ドラッグ入力に対する係数
     * @param factorXY      XY積ドラッグ入力に対する係数
     */
    constructor(parameterId, factorX, factorY, factorXY) {
        this.parameterId = parameterId == undefined ? null : parameterId;
        this.factorX = factorX == undefined ? 0.0 : factorX;
        this.factorY = factorY == undefined ? 0.0 : factorY;
        this.factorXY = factorXY == undefined ? 0.0 : factorXY;
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismlook.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.LookParameterData = $.LookParameterData;
    Live2DCubismFramework.CubismLook = $.CubismLook;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
