/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
import { ICubismModelSetting } from './icubismmodelsetting.js';
import { CubismFramework } from './live2dcubismframework.js';
import { CubismJson } from './utils/cubismjson.js';
export var FrequestNode;
(function (FrequestNode) {
    FrequestNode[FrequestNode["FrequestNode_Groups"] = 0] = "FrequestNode_Groups";
    FrequestNode[FrequestNode["FrequestNode_Moc"] = 1] = "FrequestNode_Moc";
    FrequestNode[FrequestNode["FrequestNode_Motions"] = 2] = "FrequestNode_Motions";
    FrequestNode[FrequestNode["FrequestNode_Expressions"] = 3] = "FrequestNode_Expressions";
    FrequestNode[FrequestNode["FrequestNode_Textures"] = 4] = "FrequestNode_Textures";
    FrequestNode[FrequestNode["FrequestNode_Physics"] = 5] = "FrequestNode_Physics";
    FrequestNode[FrequestNode["FrequestNode_Pose"] = 6] = "FrequestNode_Pose";
    FrequestNode[FrequestNode["FrequestNode_HitAreas"] = 7] = "FrequestNode_HitAreas"; // getRoot().getValueByString(HitAreas)
})(FrequestNode || (FrequestNode = {}));
/**
 * Model3Jsonパーサー
 *
 * model3.jsonファイルをパースして値を取得する
 */
export class CubismModelSettingJson extends ICubismModelSetting {
    /**
     * 引数付きコンストラクタ
     *
     * @param buffer    Model3Jsonをバイト配列として読み込んだデータバッファ
     * @param size      Model3Jsonのデータサイズ
     */
    constructor(buffer, size) {
        super();
        /**
         * Model3Jsonのキー文字列
         */
        this.version = 'Version';
        this.fileReferences = 'FileReferences';
        this.groups = 'Groups';
        this.layout = 'Layout';
        this.hitAreas = 'HitAreas';
        this.moc = 'Moc';
        this.textures = 'Textures';
        this.physics = 'Physics';
        this.pose = 'Pose';
        this.expressions = 'Expressions';
        this.motions = 'Motions';
        this.userData = 'UserData';
        this.name = 'Name';
        this.filePath = 'File';
        this.id = 'Id';
        this.ids = 'Ids';
        this.target = 'Target';
        // Motions
        this.idle = 'Idle';
        this.tapBody = 'TapBody';
        this.pinchIn = 'PinchIn';
        this.pinchOut = 'PinchOut';
        this.shake = 'Shake';
        this.flickHead = 'FlickHead';
        this.parameter = 'Parameter';
        this.soundPath = 'Sound';
        this.fadeInTime = 'FadeInTime';
        this.fadeOutTime = 'FadeOutTime';
        // Layout
        this.centerX = 'CenterX';
        this.centerY = 'CenterY';
        this.x = 'X';
        this.y = 'Y';
        this.width = 'Width';
        this.height = 'Height';
        this.lipSync = 'LipSync';
        this.eyeBlink = 'EyeBlink';
        this.initParameter = 'init_param';
        this.initPartsVisible = 'init_parts_visible';
        this.val = 'val';
        this._json = CubismJson.create(buffer, size);
        if (this.getJson()) {
            this._jsonValue = [
                // 順番はenum FrequestNodeと一致させる
                this.getJson().getRoot().getValueByString(this.groups),
                this.getJson()
                    .getRoot()
                    .getValueByString(this.fileReferences)
                    .getValueByString(this.moc),
                this.getJson()
                    .getRoot()
                    .getValueByString(this.fileReferences)
                    .getValueByString(this.motions),
                this.getJson()
                    .getRoot()
                    .getValueByString(this.fileReferences)
                    .getValueByString(this.expressions),
                this.getJson()
                    .getRoot()
                    .getValueByString(this.fileReferences)
                    .getValueByString(this.textures),
                this.getJson()
                    .getRoot()
                    .getValueByString(this.fileReferences)
                    .getValueByString(this.physics),
                this.getJson()
                    .getRoot()
                    .getValueByString(this.fileReferences)
                    .getValueByString(this.pose),
                this.getJson().getRoot().getValueByString(this.hitAreas)
            ];
        }
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
        CubismJson.delete(this._json);
        this._jsonValue = null;
    }
    /**
     * CubismJsonオブジェクトを取得する
     *
     * @return CubismJson
     */
    getJson() {
        return this._json;
    }
    /**
     * Mocファイルの名前を取得する
     * @return Mocファイルの名前
     */
    getModelFileName() {
        if (!this.isExistModelFile()) {
            return '';
        }
        return this._jsonValue[FrequestNode.FrequestNode_Moc].getRawString();
    }
    /**
     * モデルが使用するテクスチャの数を取得する
     * テクスチャの数
     */
    getTextureCount() {
        if (!this.isExistTextureFiles()) {
            return 0;
        }
        return this._jsonValue[FrequestNode.FrequestNode_Textures].getSize();
    }
    /**
     * テクスチャが配置されたディレクトリの名前を取得する
     * @return テクスチャが配置されたディレクトリの名前
     */
    getTextureDirectory() {
        const texturePath = this._jsonValue[FrequestNode.FrequestNode_Textures]
            .getValueByIndex(0)
            .getRawString();
        const pathArray = texturePath.split('/');
        // 最後の要素はテクスチャ名なので不要
        const arrayLength = pathArray.length - 1;
        let textureDirectoryStr = '';
        // 分割したパスを結合
        for (let i = 0; i < arrayLength; i++) {
            textureDirectoryStr += pathArray[i];
            if (i < arrayLength - 1) {
                textureDirectoryStr += '/';
            }
        }
        return textureDirectoryStr;
    }
    /**
     * モデルが使用するテクスチャの名前を取得する
     * @param index 配列のインデックス値
     * @return テクスチャの名前
     */
    getTextureFileName(index) {
        return this._jsonValue[FrequestNode.FrequestNode_Textures]
            .getValueByIndex(index)
            .getRawString();
    }
    /**
     * モデルに設定された当たり判定の数を取得する
     * @return モデルに設定された当たり判定の数
     */
    getHitAreasCount() {
        if (!this.isExistHitAreas()) {
            return 0;
        }
        return this._jsonValue[FrequestNode.FrequestNode_HitAreas].getSize();
    }
    /**
     * 当たり判定に設定されたIDを取得する
     *
     * @param index 配列のindex
     * @return 当たり判定に設定されたID
     */
    getHitAreaId(index) {
        return CubismFramework.getIdManager().getId(this._jsonValue[FrequestNode.FrequestNode_HitAreas]
            .getValueByIndex(index)
            .getValueByString(this.id)
            .getRawString());
    }
    /**
     * 当たり判定に設定された名前を取得する
     * @param index 配列のインデックス値
     * @return 当たり判定に設定された名前
     */
    getHitAreaName(index) {
        return this._jsonValue[FrequestNode.FrequestNode_HitAreas]
            .getValueByIndex(index)
            .getValueByString(this.name)
            .getRawString();
    }
    /**
     * 物理演算設定ファイルの名前を取得する
     * @return 物理演算設定ファイルの名前
     */
    getPhysicsFileName() {
        if (!this.isExistPhysicsFile()) {
            return '';
        }
        return this._jsonValue[FrequestNode.FrequestNode_Physics].getRawString();
    }
    /**
     * パーツ切り替え設定ファイルの名前を取得する
     * @return パーツ切り替え設定ファイルの名前
     */
    getPoseFileName() {
        if (!this.isExistPoseFile()) {
            return '';
        }
        return this._jsonValue[FrequestNode.FrequestNode_Pose].getRawString();
    }
    /**
     * 表情設定ファイルの数を取得する
     * @return 表情設定ファイルの数
     */
    getExpressionCount() {
        if (!this.isExistExpressionFile()) {
            return 0;
        }
        return this._jsonValue[FrequestNode.FrequestNode_Expressions].getSize();
    }
    /**
     * 表情設定ファイルを識別する名前（別名）を取得する
     * @param index 配列のインデックス値
     * @return 表情の名前
     */
    getExpressionName(index) {
        return this._jsonValue[FrequestNode.FrequestNode_Expressions]
            .getValueByIndex(index)
            .getValueByString(this.name)
            .getRawString();
    }
    /**
     * 表情設定ファイルの名前を取得する
     * @param index 配列のインデックス値
     * @return 表情設定ファイルの名前
     */
    getExpressionFileName(index) {
        return this._jsonValue[FrequestNode.FrequestNode_Expressions]
            .getValueByIndex(index)
            .getValueByString(this.filePath)
            .getRawString();
    }
    /**
     * モーショングループの数を取得する
     * @return モーショングループの数
     */
    getMotionGroupCount() {
        if (!this.isExistMotionGroups()) {
            return 0;
        }
        return this._jsonValue[FrequestNode.FrequestNode_Motions].getKeys().length;
    }
    /**
     * モーショングループの名前を取得する
     * @param index 配列のインデックス値
     * @return モーショングループの名前
     */
    getMotionGroupName(index) {
        if (!this.isExistMotionGroups()) {
            return null;
        }
        return this._jsonValue[FrequestNode.FrequestNode_Motions].getKeys()[index];
    }
    /**
     * モーショングループに含まれるモーションの数を取得する
     * @param groupName モーショングループの名前
     * @return モーショングループの数
     */
    getMotionCount(groupName) {
        if (!this.isExistMotionGroupName(groupName)) {
            return 0;
        }
        return this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getSize();
    }
    /**
     * グループ名とインデックス値からモーションファイル名を取得する
     * @param groupName モーショングループの名前
     * @param index     配列のインデックス値
     * @return モーションファイルの名前
     */
    getMotionFileName(groupName, index) {
        if (!this.isExistMotionGroupName(groupName)) {
            return '';
        }
        return this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getValueByIndex(index)
            .getValueByString(this.filePath)
            .getRawString();
    }
    /**
     * モーションに対応するサウンドファイルの名前を取得する
     * @param groupName モーショングループの名前
     * @param index 配列のインデックス値
     * @return サウンドファイルの名前
     */
    getMotionSoundFileName(groupName, index) {
        if (!this.isExistMotionSoundFile(groupName, index)) {
            return '';
        }
        return this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getValueByIndex(index)
            .getValueByString(this.soundPath)
            .getRawString();
    }
    /**
     * モーション開始時のフェードイン処理時間を取得する
     * @param groupName モーショングループの名前
     * @param index 配列のインデックス値
     * @return フェードイン処理時間[秒]
     */
    getMotionFadeInTimeValue(groupName, index) {
        if (!this.isExistMotionFadeIn(groupName, index)) {
            return -1.0;
        }
        return this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getValueByIndex(index)
            .getValueByString(this.fadeInTime)
            .toFloat();
    }
    /**
     * モーション終了時のフェードアウト処理時間を取得する
     * @param groupName モーショングループの名前
     * @param index 配列のインデックス値
     * @return フェードアウト処理時間[秒]
     */
    getMotionFadeOutTimeValue(groupName, index) {
        if (!this.isExistMotionFadeOut(groupName, index)) {
            return -1.0;
        }
        return this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getValueByIndex(index)
            .getValueByString(this.fadeOutTime)
            .toFloat();
    }
    /**
     * ユーザーデータのファイル名を取得する
     * @return ユーザーデータのファイル名
     */
    getUserDataFile() {
        if (!this.isExistUserDataFile()) {
            return '';
        }
        return this.getJson()
            .getRoot()
            .getValueByString(this.fileReferences)
            .getValueByString(this.userData)
            .getRawString();
    }
    /**
     * レイアウト情報を取得する
     * @param outLayoutMap Mapクラスのインスタンス
     * @return true レイアウト情報が存在する
     * @return false レイアウト情報が存在しない
     */
    getLayoutMap(outLayoutMap) {
        // 存在しない要素にアクセスするとエラーになるためValueがnullの場合はnullを代入する
        const map = this.getJson()
            .getRoot()
            .getValueByString(this.layout)
            .getMap();
        if (map == null) {
            return false;
        }
        let ret = false;
        for (const element of map) {
            outLayoutMap.set(element[0], element[1].toFloat());
            ret = true;
        }
        return ret;
    }
    /**
     * 目パチに関連付けられたパラメータの数を取得する
     * @return 目パチに関連付けられたパラメータの数
     */
    getEyeBlinkParameterCount() {
        if (!this.isExistEyeBlinkParameters()) {
            return 0;
        }
        let num = 0;
        for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
            const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
                num = refI.getValueByString(this.ids).getVector().length;
                break;
            }
        }
        return num;
    }
    /**
     * 目パチに関連付けられたパラメータのIDを取得する
     * @param index 配列のインデックス値
     * @return パラメータID
     */
    getEyeBlinkParameterId(index) {
        if (!this.isExistEyeBlinkParameters()) {
            return null;
        }
        for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
            const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
                return CubismFramework.getIdManager().getId(refI.getValueByString(this.ids).getValueByIndex(index).getRawString());
            }
        }
        return null;
    }
    /**
     * リップシンクに関連付けられたパラメータの数を取得する
     * @return リップシンクに関連付けられたパラメータの数
     */
    getLipSyncParameterCount() {
        if (!this.isExistLipSyncParameters()) {
            return 0;
        }
        let num = 0;
        for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
            const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
                num = refI.getValueByString(this.ids).getVector().length;
                break;
            }
        }
        return num;
    }
    /**
     * リップシンクに関連付けられたパラメータの数を取得する
     * @param index 配列のインデックス値
     * @return パラメータID
     */
    getLipSyncParameterId(index) {
        if (!this.isExistLipSyncParameters()) {
            return null;
        }
        for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); i++) {
            const refI = this._jsonValue[FrequestNode.FrequestNode_Groups].getValueByIndex(i);
            if (refI.isNull() || refI.isError()) {
                continue;
            }
            if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
                return CubismFramework.getIdManager().getId(refI.getValueByString(this.ids).getValueByIndex(index).getRawString());
            }
        }
        return null;
    }
    /**
     * モデルファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistModelFile() {
        const node = this._jsonValue[FrequestNode.FrequestNode_Moc];
        return !node.isNull() && !node.isError();
    }
    /**
     * テクスチャファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistTextureFiles() {
        const node = this._jsonValue[FrequestNode.FrequestNode_Textures];
        return !node.isNull() && !node.isError();
    }
    /**
     * 当たり判定のキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistHitAreas() {
        const node = this._jsonValue[FrequestNode.FrequestNode_HitAreas];
        return !node.isNull() && !node.isError();
    }
    /**
     * 物理演算ファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistPhysicsFile() {
        const node = this._jsonValue[FrequestNode.FrequestNode_Physics];
        return !node.isNull() && !node.isError();
    }
    /**
     * ポーズ設定ファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistPoseFile() {
        const node = this._jsonValue[FrequestNode.FrequestNode_Pose];
        return !node.isNull() && !node.isError();
    }
    /**
     * 表情設定ファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistExpressionFile() {
        const node = this._jsonValue[FrequestNode.FrequestNode_Expressions];
        return !node.isNull() && !node.isError();
    }
    /**
     * モーショングループのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionGroups() {
        const node = this._jsonValue[FrequestNode.FrequestNode_Motions];
        return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーショングループのキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionGroupName(groupName) {
        const node = this._jsonValue[FrequestNode.FrequestNode_Motions].getValueByString(groupName);
        return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーションに対応するサウンドファイルのキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @param index 配列のインデックス値
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionSoundFile(groupName, index) {
        const node = this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getValueByIndex(index)
            .getValueByString(this.soundPath);
        return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーションに対応するフェードイン時間のキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @param index 配列のインデックス値
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionFadeIn(groupName, index) {
        const node = this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getValueByIndex(index)
            .getValueByString(this.fadeInTime);
        return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーションに対応するフェードアウト時間のキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @param index 配列のインデックス値
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionFadeOut(groupName, index) {
        const node = this._jsonValue[FrequestNode.FrequestNode_Motions]
            .getValueByString(groupName)
            .getValueByIndex(index)
            .getValueByString(this.fadeOutTime);
        return !node.isNull() && !node.isError();
    }
    /**
     * UserDataのファイル名が存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistUserDataFile() {
        const node = this.getJson()
            .getRoot()
            .getValueByString(this.fileReferences)
            .getValueByString(this.userData);
        return !node.isNull() && !node.isError();
    }
    /**
     * 目ぱちに対応付けられたパラメータが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistEyeBlinkParameters() {
        if (this._jsonValue[FrequestNode.FrequestNode_Groups].isNull() ||
            this._jsonValue[FrequestNode.FrequestNode_Groups].isError()) {
            return false;
        }
        for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); ++i) {
            if (this._jsonValue[FrequestNode.FrequestNode_Groups]
                .getValueByIndex(i)
                .getValueByString(this.name)
                .getRawString() == this.eyeBlink) {
                return true;
            }
        }
        return false;
    }
    /**
     * リップシンクに対応付けられたパラメータが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistLipSyncParameters() {
        if (this._jsonValue[FrequestNode.FrequestNode_Groups].isNull() ||
            this._jsonValue[FrequestNode.FrequestNode_Groups].isError()) {
            return false;
        }
        for (let i = 0; i < this._jsonValue[FrequestNode.FrequestNode_Groups].getSize(); ++i) {
            if (this._jsonValue[FrequestNode.FrequestNode_Groups]
                .getValueByIndex(i)
                .getValueByString(this.name)
                .getRawString() == this.lipSync) {
                return true;
            }
        }
        return false;
    }
}
// Namespace definition for compatibility.
import * as $ from './cubismmodelsettingjson.js';
// eslint-disable-next-line @typescript-eslint/no-namespace
export var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismModelSettingJson = $.CubismModelSettingJson;
    Live2DCubismFramework.FrequestNode = $.FrequestNode;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
