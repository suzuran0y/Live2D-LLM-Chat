/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
/**
 * Updater for physics effects.
 * Handles the management of physics simulation through the CubismPhysics class.
 */
export class CubismPhysicsUpdater extends ICubismUpdater {
    constructor(physics, executionOrder) {
        super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : CubismUpdateOrder.CubismUpdateOrder_Physics);
        this._physics = physics;
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
        this._physics.evaluate(model, deltaTimeSeconds);
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismphysicsupdater.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismPhysicsUpdater = $.CubismPhysicsUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
