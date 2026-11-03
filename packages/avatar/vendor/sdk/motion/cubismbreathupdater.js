/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
/**
 * Updater for breath effects.
 * Handles the management of breath animation through the CubismBreath class.
 */
export class CubismBreathUpdater extends ICubismUpdater {
    constructor(breath, executionOrder) {
        super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : CubismUpdateOrder.CubismUpdateOrder_Breath);
        this._breath = breath;
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
        this._breath.updateParameters(model, deltaTimeSeconds);
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismbreathupdater.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismBreathUpdater = $.CubismBreathUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
