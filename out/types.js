"use strict";
/**
 * 扩展类型定义
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageType = exports.PreviewMode = void 0;
/** 预览模式 */
var PreviewMode;
(function (PreviewMode) {
    PreviewMode["BROWSE"] = "browse";
    PreviewMode["LOCATE"] = "locate";
})(PreviewMode || (exports.PreviewMode = PreviewMode = {}));
/** 消息类型（扩展端 <-> Webview） */
var MessageType;
(function (MessageType) {
    MessageType["ELEMENT_CLICKED"] = "elementClicked";
    MessageType["MODE_CHANGED"] = "modeChanged";
    MessageType["READY"] = "ready";
    MessageType["UPDATE_CONTENT"] = "updateContent";
    MessageType["SWITCH_MODE"] = "switchMode";
    MessageType["LOG"] = "log";
})(MessageType || (exports.MessageType = MessageType = {}));
//# sourceMappingURL=types.js.map