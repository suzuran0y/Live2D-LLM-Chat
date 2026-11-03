/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
/**
 * Updater for expression effects.
 * Handles the management of expression motion through the CubismExpressionMotionManager.
 */
export class CubismExpressionUpdater extends ICubismUpdater {
    constructor(expressionManager, executionOrder) {
        super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : CubismUpdateOrder.CubismUpdateOrder_Expression);
        this._expressionManager = expressionManager;
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
        this._expressionManager.updateMotion(model, deltaTimeSeconds);
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismexpressionupdater.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismExpressionUpdater = $.CubismExpressionUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
