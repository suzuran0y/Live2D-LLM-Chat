/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
/**
 * Updater for lip sync effects.
 * Handles the management of lip sync animation through parameter providers.
 */
export class CubismLipSyncUpdater extends ICubismUpdater {
    constructor(lipSyncIds, audioProvider, executionOrder) {
        super(executionOrder !== null && executionOrder !== void 0 ? executionOrder : CubismUpdateOrder.CubismUpdateOrder_LipSync);
        this._lipSyncIds = [...lipSyncIds]; // Copy array
        this._audioProvider = audioProvider;
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
        if (this._audioProvider) {
            const updateSuccessful = this._audioProvider.update(deltaTimeSeconds);
            if (updateSuccessful) {
                const lipSyncValue = this._audioProvider.getParameter();
                // Apply lip sync value to all registered parameters
                for (let i = 0; i < this._lipSyncIds.length; i++) {
                    model.addParameterValueById(this._lipSyncIds[i], lipSyncValue);
                }
            }
        }
    }
    /**
     * Set audio parameter provider.
     *
     * @param audioProvider Audio parameter provider to set
     */
    setAudioProvider(audioProvider) {
        this._audioProvider = audioProvider;
    }
    /**
     * Get audio parameter provider.
     *
     * @return Current audio parameter provider
     */
    getAudioProvider() {
        return this._audioProvider;
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismlipsyncupdater.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismLipSyncUpdater = $.CubismLipSyncUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
