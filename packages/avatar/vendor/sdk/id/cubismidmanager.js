/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { CubismId } from './cubismid.js';
/**
 * ID名の管理
 *
 * ID名を管理する。
 */
export class CubismIdManager {
    /**
     * コンストラクタ
     */
    constructor() {
        this._ids = new Array();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
        for (let i = 0; i < this._ids.length; ++i) {
            this._ids[i] = void 0;
        }
        this._ids = null;
    }
    /**
     * ID名をリストから登録
     *
     * @param ids ID名リスト
     * @param count IDの個数
     */
    registerIds(ids) {
        for (let i = 0; i < ids.length; i++) {
            this.registerId(ids[i]);
        }
    }
    /**
     * ID名を登録
     *
     * @param id ID名
     */
    registerId(id) {
        let result = null;
        if ('string' == typeof id) {
            if ((result = this.findId(id)) != null) {
                return result;
            }
            result = CubismId.createIdInternal(id);
            this._ids.push(result);
        }
        else {
            return this.registerId(id);
        }
        return result;
    }
    /**
     * ID名からIDを取得する
     *
     * @param id ID名
     */
    getId(id) {
        return this.registerId(id);
    }
    /**
     * ID名からIDの確認
     *
     * @return true 存在する
     * @return false 存在しない
     */
    isExist(id) {
        if ('string' == typeof id) {
            return this.findId(id) != null;
        }
        return this.isExist(id);
    }
    /**
     * ID名からIDを検索する。
     *
     * @param id ID名
     * @return 登録されているID。なければNULL。
     */
    findId(id) {
        for (let i = 0; i < this._ids.length; ++i) {
            if (this._ids[i].getString() == id) {
                return this._ids[i];
            }
        }
        return null;
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismidmanager.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismIdManager = $.CubismIdManager;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
