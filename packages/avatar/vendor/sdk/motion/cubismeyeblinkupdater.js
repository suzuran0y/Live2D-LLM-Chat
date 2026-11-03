/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
/**
 * Updater for eye blink effects.
 * Handles the management of eye blink animation through the CubismEyeBlink class.
 */
export class CubismEyeBlinkUpdater extends ICubismUpdater {
    constructor(motionUpdated, eyeBlink, executionOrder) {
        super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : CubismUpdateOrder.CubismUpdateOrder_EyeBlink);
        this._motionUpdated = motionUpdated;
        this._eyeBlink = eyeBlink;
    }
    /**
     * Update process.
     *
     * @param model Model to update
     * @param deltaTimeSeconds Delta time in seconds.
     */
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        if (!this._motionUpdated()) {
            // メインモーションの更新がないとき
            // 目パチ
            this._eyeBlink.updateParameters(model, deltaTimeSeconds);
        }
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismeyeblinkupdater.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismEyeBlinkUpdater = $.CubismEyeBlinkUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
