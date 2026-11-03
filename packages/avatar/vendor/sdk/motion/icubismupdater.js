/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
export var CubismUpdateOrder;
(function (CubismUpdateOrder) {
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_EyeBlink"] = 200] = "CubismUpdateOrder_EyeBlink";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Expression"] = 300] = "CubismUpdateOrder_Expression";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Drag"] = 400] = "CubismUpdateOrder_Drag";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Breath"] = 500] = "CubismUpdateOrder_Breath";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Physics"] = 600] = "CubismUpdateOrder_Physics";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_LipSync"] = 700] = "CubismUpdateOrder_LipSync";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Pose"] = 800] = "CubismUpdateOrder_Pose";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Max"] = Number.MAX_SAFE_INTEGER] = "CubismUpdateOrder_Max";
})(CubismUpdateOrder || (CubismUpdateOrder = {}));
/**
 * Abstract base class for motions.<br>
 * Handles the management of motion playback through the CubismUpdateScheduler.
 */
export class ICubismUpdater {
    /**
     * Comparison function used when sorting ICubismUpdater objects.
     *
     * @param left The first ICubismUpdater object to be compared.
     * @param right The second ICubismUpdater object to be compared.
     *
     * @return negative if left should be placed before right,
     *         positive if right should be placed before left,
     *         zero if they are equal.
     */
    static sortFunction(left, right) {
        if (!left || !right) {
            if (!left && !right)
                return 0;
            if (!left)
                return 1; // null/undefined elements go to end
            if (!right)
                return -1;
        }
        return left.getExecutionOrder() - right.getExecutionOrder();
    }
    /**
     * Constructor
     */
    constructor(executionOrder = 0) {
        this._changeListeners = [];
        this._executionOrder = executionOrder;
    }
    getExecutionOrder() {
        return this._executionOrder;
    }
    setExecutionOrder(executionOrder) {
        if (this._executionOrder !== executionOrder) {
            this._executionOrder = executionOrder;
            this.notifyChangeListeners();
        }
    }
    /**
     * Adds a listener to be notified when this updater's properties change.
     *
     * @param listener The listener to add
     */
    addChangeListener(listener) {
        if (listener && this._changeListeners.indexOf(listener) === -1) {
            this._changeListeners.push(listener);
        }
    }
    /**
     * Removes a listener from the notification list.
     *
     * @param listener The listener to remove
     */
    removeChangeListener(listener) {
        const index = this._changeListeners.indexOf(listener);
        if (index >= 0) {
            this._changeListeners.splice(index, 1);
        }
    }
    /**
     * Notifies all registered listeners that this updater has changed.
     */
    notifyChangeListeners() {
        for (const listener of this._changeListeners) {
            listener.onUpdaterChanged(this);
        }
    }
}
// Namespace definition for compatibility.
import * as $ from './icubismupdater.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.ICubismUpdater = $.ICubismUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
