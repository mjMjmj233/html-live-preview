"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const previewPanel_1 = require("./previewPanel");
/**
 * 插件激活入口
 */
function activate(context) {
    console.log('HTML 实时预览插件已激活');
    // 注册命令
    const commands = [
        vscode.commands.registerCommand('htmlLivePreview.openPreview', () => {
            openPreview(context.extensionUri);
        }),
        vscode.commands.registerCommand('htmlLivePreview.toggleMode', () => {
            toggleMode();
        }),
        vscode.commands.registerCommand('htmlLivePreview.refreshPreview', () => {
            refreshPreview();
        })
    ];
    // 文档变更监听（自动刷新）
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        const panel = previewPanel_1.PreviewPanel.getPanel();
        if (!panel)
            return;
        if (isHtmlDocument(event.document)) {
            panel.updatePreview(event.document);
        }
    });
    // 编辑器切换监听
    const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor)
            return;
        const panel = previewPanel_1.PreviewPanel.getPanel();
        if (!panel)
            return;
        if (isHtmlDocument(editor.document)) {
            panel.updatePreview(editor.document);
        }
    });
    context.subscriptions.push(...commands, docChangeDisposable, editorChangeDisposable);
}
/**
 * 插件停用
 */
function deactivate() {
    console.log('HTML 实时预览插件已停用');
}
/**
 * 打开预览
 */
function openPreview(extensionUri) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showWarningMessage('请先打开一个 HTML 文件。');
        return;
    }
    const document = activeEditor.document;
    if (!isHtmlDocument(document)) {
        vscode.window.showWarningMessage('当前文件不是 HTML 文件，请打开 .html 文件。');
        return;
    }
    const panel = previewPanel_1.PreviewPanel.createOrShow(extensionUri);
    panel.updatePreview(document);
}
/**
 * 切换模式
 */
function toggleMode() {
    const panel = previewPanel_1.PreviewPanel.getPanel();
    if (!panel) {
        vscode.window.showWarningMessage('请先打开 HTML 实时预览。');
        return;
    }
    panel.toggleMode();
}
/**
 * 刷新预览
 */
function refreshPreview() {
    const panel = previewPanel_1.PreviewPanel.getPanel();
    if (!panel) {
        vscode.window.showWarningMessage('没有活动的预览面板。');
        return;
    }
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isHtmlDocument(activeEditor.document)) {
        panel.updatePreview(activeEditor.document);
        vscode.window.setStatusBarMessage('预览已刷新', 2000);
    }
}
/**
 * 判断是否为 HTML 文档
 */
function isHtmlDocument(document) {
    return (document.languageId === 'html' ||
        document.fileName.toLowerCase().endsWith('.html') ||
        document.fileName.toLowerCase().endsWith('.htm'));
}
//# sourceMappingURL=extension.js.map