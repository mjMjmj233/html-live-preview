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
exports.PreviewPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const htmlProcessor_1 = require("./htmlProcessor");
/**
 * 预览面板管理类
 */
class PreviewPanel {
    constructor(panel, extensionUri) {
        this.disposables = [];
        this.currentMode = 'browse';
        this.lastHtmlContent = '';
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'media'),
                vscode.Uri.file(path.sep)
            ]
        };
        this.panel.webview.html = this.getWebviewContent();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    if (this.currentDocument) {
                        await this.updatePreview(this.currentDocument);
                    }
                    break;
                case 'elementClicked':
                    await this.handleElementClick(message.payload);
                    break;
                case 'modeChanged':
                    this.currentMode = message.payload.mode;
                    const label = this.currentMode === 'locate' ? '\u5B9A\u4F4D\u6A21\u5F0F' : '\u6D4F\u89C8\u6A21\u5F0F';
                    vscode.window.setStatusBarMessage(`HTML \u9884\u89C8: ${label}`, 2000);
                    break;
                case 'refreshPreview':
                    if (this.currentDocument) {
                        this.lastHtmlContent = ''; // 强制刷新
                        await this.updatePreview(this.currentDocument);
                        vscode.window.setStatusBarMessage('\u9884\u89C8\u5DF2\u5237\u65B0', 2000);
                    }
                    break;
            }
        }, null, this.disposables);
        vscode.commands.executeCommand('setContext', 'htmlLivePreview.active', true);
    }
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel.panel.reveal(column);
            return PreviewPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel('htmlLivePreview', 'HTML \u5B9E\u65F6\u9884\u89C8', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'media'),
                vscode.Uri.file(path.sep)
            ]
        });
        PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri);
        return PreviewPanel.currentPanel;
    }
    static getPanel() {
        return PreviewPanel.currentPanel;
    }
    async updatePreview(document) {
        this.currentDocument = document;
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
            const htmlContent = document.getText();
            if (htmlContent === this.lastHtmlContent)
                return;
            this.lastHtmlContent = htmlContent;
            const basePath = path.dirname(document.uri.fsPath);
            const withUrls = this.processRelativeUrls(htmlContent, basePath);
            // 通知 webview 开始处理
            this.panel.webview.postMessage({ type: 'progress', payload: { percent: 5, text: '\u89e3\u6790\u4e2d...' } });
            // 进度回调 - 让出事件循环确保消息送达
            const onProgress = async (percent, text) => {
                this.panel.webview.postMessage({ type: 'progress', payload: { percent, text } });
                // 大文件每步让出事件循环，使进度条能刷新
                if (htmlContent.length > 200000) {
                    await new Promise(r => setImmediate(r));
                }
            };
            let result;
            try {
                // 小文件同步处理，大文件异步分批处理
                if (withUrls.length < 200000) {
                    result = (0, htmlProcessor_1.processHTML)(withUrls);
                }
                else {
                    result = await (0, htmlProcessor_1.processHTMLAsync)(withUrls, onProgress);
                }
            }
            catch (e) {
                console.error('[HPV] processHTML error:', e);
                result = { html: withUrls, lineMap: {} };
            }
            // 完成后更新预览
            this.panel.webview.postMessage({ type: 'progress', payload: { percent: 100, text: '\u5b8c\u6210' } });
            this.panel.webview.postMessage({
                type: 'updateContent',
                payload: {
                    htmlContent: result.html,
                    lineMap: result.lineMap,
                    mode: this.currentMode
                }
            });
            const fileName = path.basename(document.uri.fsPath);
            this.panel.title = `\u9884\u89C8: ${fileName}`;
        }, 150);
    }
    toggleMode() {
        const newMode = this.currentMode === 'browse' ? 'locate' : 'browse';
        this.currentMode = newMode;
        this.panel.webview.postMessage({
            type: 'switchMode',
            payload: { mode: newMode }
        });
        const label = newMode === 'locate' ? '\u5B9A\u4F4D\u6A21\u5F0F' : '\u6D4F\u89C8\u6A21\u5F0F';
        vscode.window.setStatusBarMessage(`HTML \u9884\u89C8: ${label}`, 2000);
    }
    getCurrentMode() { return this.currentMode; }
    setMode(mode) {
        if (this.currentMode !== mode)
            this.toggleMode();
    }
    async handleElementClick(payload) {
        if (!this.currentDocument)
            return;
        const uri = this.currentDocument.uri;
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false
        });
        const position = new vscode.Position(payload.startLine - 1, 0);
        const range = new vscode.Range(position, position);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            isWholeLine: true
        });
        const endPosition = new vscode.Position(payload.endLine - 1, 99999);
        editor.setDecorations(decorationType, [new vscode.Range(position, endPosition)]);
        setTimeout(() => decorationType.dispose(), 2500);
    }
    processRelativeUrls(html, basePath) {
        let processed = html;
        processed = processed.replace(/(href|src)\s*=\s*["']([^"']+)["']/gi, (match, attr, url) => {
            if (url.match(/^(https?:|data:|javascript:|#)/i))
                return match;
            try {
                const absolutePath = path.resolve(basePath, url);
                if (fs.existsSync(absolutePath)) {
                    return `${attr}="${vscode.Uri.file(absolutePath).toString()}"`;
                }
            }
            catch { /* ignore */ }
            return match;
        });
        processed = processed.replace(/url\s*\(\s*["']?([^"')\s]+)["']?\s*\)/gi, (match, url) => {
            if (url.match(/^(https?:|data:)/i))
                return match;
            try {
                const absolutePath = path.resolve(basePath, url);
                if (fs.existsSync(absolutePath)) {
                    return `url("${vscode.Uri.file(absolutePath).toString()}")`;
                }
            }
            catch { /* ignore */ }
            return match;
        });
        return processed;
    }
    getWebviewContent() {
        const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.js'));
        const styleUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css'));
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src ${this.panel.webview.cspSource} 'unsafe-inline' https:;
    style-src ${this.panel.webview.cspSource} 'unsafe-inline' https:;
    img-src ${this.panel.webview.cspSource} https: data: file: vscode-resource:;
    font-src ${this.panel.webview.cspSource} https: data: file: vscode-resource:;
    connect-src https:;
    frame-src blob:;
  ">
  <link rel="stylesheet" href="${styleUri}">
  <title>HTML \u5B9E\u65F6\u9884\u89C8</title>
</head>
<body>
  <!-- 顶部进度条 -->
  <div class="progress-bar" id="progress-bar">
    <div class="progress-fill" id="progress-fill"></div>
  </div>
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="icon-btn" id="theme-toggle" title="\u5207\u6362\u660E\u6697\u4E3B\u9898">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      </button>
      <div class="mode-group">
        <button class="mode-btn active" data-mode="browse">\u6D4F\u89C8\u6A21\u5F0F</button>
        <button class="mode-btn" data-mode="locate">\u5B9A\u4F4D\u6A21\u5F0F</button>
      </div>
    </div>
    <div class="toolbar-right">
      <button class="icon-btn" id="refresh-btn" title="\u5237\u65B0\u9884\u89C8">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
      </button>
      <span class="status-text" id="status-text"></span>
    </div>
  </div>
  <div class="content-wrapper">
    <div class="loading-overlay" id="loading">
      <div class="spinner"></div>
      <div class="loading-text">\u7B49\u5F85 HTML \u5185\u5BB9...</div>
    </div>
    <div class="preview-container" id="preview-container">
      <iframe id="preview"></iframe>
    </div>
    <div class="locate-hint hidden" id="locate-hint">\uD83D\uDC46 \u5B9A\u4F4D\u6A21\u5F0F</div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
    }
    dispose() {
        PreviewPanel.currentPanel = undefined;
        vscode.commands.executeCommand('setContext', 'htmlLivePreview.active', false);
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d)
                d.dispose();
        }
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
    }
}
exports.PreviewPanel = PreviewPanel;
//# sourceMappingURL=previewPanel.js.map