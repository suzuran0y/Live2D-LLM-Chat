/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismUpdater } from './icubismupdater.js';
/**
 * Scheduler for managing and updating ICubismUpdater instances.
 * Handles the management of update order and execution through a sorted list.
 */
export class CubismUpdateScheduler {
    /**
     * Constructor
     */
    constructor() {
        this._cubismUpdatableList = [];
        this._needsSort = false;
    }
    /**
     * Destructor equivalent - releases all updaters and removes listeners
     */
    release() {
        // Remove all listeners before clearing
        for (const updater of this._cubismUpdatableList) {
            if (updater) {
                updater.removeChangeListener(this);
            }
        }
        // Clear the list - in TypeScript we don't need to manually delete objects
        // as they will be garbage collected when no longer referenced
        this._cubismUpdatableList.length = 0;
    }
    /**
     * Adds ICubismUpdater to the update list.
     * The list will be automatically sorted by execution order before the next update.
     *
     * @param updatable The ICubismUpdater instance to be added.
     */
    addUpdatableList(updatable) {
        if (!updatable) {
            return;
        }
        // Check for duplicate registration
        if (this.hasUpdatable(updatable)) {
            return; // Already exists, skip adding
        }
        this._cubismUpdatableList.push(updatable);
        updatable.addChangeListener(this);
        this._needsSort = true;
    }
    /**
     * Removes ICubismUpdater from the update list.
     *
     * @param updatable The ICubismUpdater instance to be removed.
     * @return true if the updater was found and removed, false otherwise.
     */
    removeUpdatableList(updatable) {
        if (!updatable) {
            return false;
        }
        const index = this._cubismUpdatableList.indexOf(updatable);
        if (index >= 0) {
            this._cubismUpdatableList.splice(index, 1);
            updatable.removeChangeListener(this);
            // Note: removal doesn't require re-sorting
            return true;
        }
        return false;
    }
    /**
     * Sorts the update list using the ICubismUpdater sort function.
     */
    sortUpdatableList() {
        this._cubismUpdatableList.sort(ICubismUpdater.sortFunction);
        this._needsSort = false;
    }
    /**
     * Updates every element in the list.
     * The list is automatically sorted by execution order before execution.
     *
     * @param model Model to update
     * @param deltaTimeSeconds Delta time in seconds.
     */
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        // Automatically sort if needed to ensure execution order
        if (this._needsSort) {
            this.sortUpdatableList();
        }
        for (let i = 0; i < this._cubismUpdatableList.length; ++i) {
            const updater = this._cubismUpdatableList[i];
            if (updater) {
                updater.onLateUpdate(model, deltaTimeSeconds);
            }
        }
    }
    /**
     * Gets the number of updaters in the list.
     *
     * @return Number of updaters
     */
    getUpdatableCount() {
        return this._cubismUpdatableList.length;
    }
    /**
     * Gets the updater at the specified index.
     *
     * @param index Index of the updater to retrieve
     * @return The updater at the specified index, or null if index is out of bounds
     */
    getUpdatable(index) {
        if (index < 0 || index >= this._cubismUpdatableList.length) {
            return null;
        }
        return this._cubismUpdatableList[index];
    }
    /**
     * Checks if the specified updater exists in the list.
     *
     * @param updatable The updater to check for
     * @return true if the updater exists in the list, false otherwise
     */
    hasUpdatable(updatable) {
        return this._cubismUpdatableList.indexOf(updatable) >= 0;
    }
    /**
     * Clears all updaters from the list.
     */
    clearUpdatableList() {
        // Remove listeners before clearing
        for (const updater of this._cubismUpdatableList) {
            if (updater) {
                updater.removeChangeListener(this);
            }
        }
        this._cubismUpdatableList.length = 0;
        this._needsSort = false;
    }
    /**
     * Called when an updater's execution order has changed.
     * Marks the list for re-sorting.
     *
     * @param updater The updater that was changed
     */
    onUpdaterChanged(updater) {
        this._needsSort = true;
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismupdatescheduler.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismUpdateScheduler = $.CubismUpdateScheduler;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
