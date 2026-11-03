/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
/**
 * Interface class for providing parameter values.<br>
 * Defines the base interface for classes that supply parameter values to the model.
 */
export class IParameterProvider {
    /**
     * Constructor
     */
    constructor() { }
}
// Namespace definition for compatibility.
import * as $ from './iparameterprovider.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.IParameterProvider = $.IParameterProvider;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
