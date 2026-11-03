/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
/**
 * Updater for look effects.
 * Handles the management of dragging motion through the MotionQueueManager.
 */
export class CubismLookUpdater extends ICubismUpdater {
    constructor(look, dragManager, executionOrder) {
        super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : CubismUpdateOrder.CubismUpdateOrder_Drag);
        this._look = look;
        this._dragManager = dragManager;
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
        this._dragManager.update(deltaTimeSeconds);
        const dragX = this._dragManager.getX();
        const dragY = this._dragManager.getY();
        this._look.updateParameters(model, dragX, dragY);
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismlookupdater.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismLookUpdater = $.CubismLookUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
