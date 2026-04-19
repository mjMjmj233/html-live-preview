"use strict";
/**
 * HTML 处理器 - 在扩展端（Node.js）运行
 * 支持异步分批处理，不阻塞事件循环，可实时反馈进度
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processHTML = processHTML;
exports.processHTMLAsync = processHTMLAsync;
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
    'param', 'source', 'track', 'wbr'
]);
const SKIP_ELEMENTS = new Set([
    'script', 'style', 'svg', 'path', 'circle', 'rect', 'line', 'polyline',
    'polygon', 'ellipse', 'g', 'defs', 'clipPath', 'mask', 'pattern',
    'linearGradient', 'radialGradient', 'stop', 'use', 'symbol', 'text',
    'tspan', 'textPath', 'image', 'foreignObject', 'marker', 'title',
    'meta', 'link', 'base', 'head', 'html', 'param', 'source', 'track',
    'wbr', 'area', 'col', 'embed', 'input', 'br', 'hr'
]);
/** 小文件直接同步处理 */
function processHTML(source, onProgress) {
    return _processChunk(source, 0, source.length, onProgress ?? null);
}
/** 大文件异步分批处理 - 每处理一段让出事件循环，进度条可实时更新 */
async function processHTMLAsync(source, onProgress) {
    // 小文件直接同步处理（< 200KB 直接走同步路径）
    if (source.length < 200000) {
        return _processChunk(source, 0, source.length, onProgress ?? null);
    }
    // 大文件分批异步处理
    const CHUNK_SIZE = 150000; // 每批最多处理 150KB
    const totalLen = source.length;
    const parts = [];
    let allLineMap = {};
    let processedLen = 0;
    onProgress?.(0, '\u89e3\u6790\u4e2d...');
    // 第一批：从开头处理
    let firstResult = _processChunk(source, 0, Math.min(CHUNK_SIZE, totalLen), onProgress ? (p, t) => {
        onProgress(Math.floor((p * 0.3)), t); // 第一批占 30%
    } : null);
    parts.push(firstResult.html);
    allLineMap = { ...firstResult.lineMap };
    processedLen = _findSafeBreakPoint(source, CHUNK_SIZE);
    // 让出事件循环，让进度消息送达
    await _tick();
    // 中间批次
    while (processedLen < totalLen) {
        const end = Math.min(processedLen + CHUNK_SIZE, totalLen);
        const batchResult = _processChunk(source, processedLen, end, null);
        parts.push(batchResult.html);
        Object.assign(allLineMap, batchResult.lineMap);
        const progress = Math.floor(30 + (processedLen / totalLen) * 60); // 30%~90%
        onProgress?.(progress, '\u89e3\u6790\u4e2d...');
        processedLen = end;
        await _tick(); // 让出事件循环
    }
    // 最后整合未闭合标签
    onProgress?.(95, '\u6574\u5408\u4e2d...');
    const finalHtml = parts.join('');
    onProgress?.(100, '\u5b8c\u6210');
    return { html: finalHtml, lineMap: allLineMap };
}
/** 让出事件循环 */
function _tick() {
    return new Promise(resolve => setImmediate(resolve));
}
/** 找到一个安全的分割点（在标签结束之后） */
function _findSafeBreakPoint(source, around) {
    // 向前找 '>' 的位置
    let i = Math.min(around, source.length - 1);
    while (i < source.length && i > 0) {
        if (source[i] === '>')
            return i + 1;
        i++;
    }
    return Math.min(around, source.length);
}
/** 核心处理逻辑 - 处理 source[start:end] 段 */
function _processChunk(source, start, end, onProgress) {
    const lineMap = {};
    const stack = [];
    const out = [];
    let line = 1;
    let idc = 1;
    let i = start;
    const len = end;
    const totalLen = source.length;
    const isLarge = totalLen > 300000;
    const MAX_ELS = 800;
    // 计算起始行号
    if (start > 0) {
        for (let k = 0; k < start; k++) {
            if (source[k] === '\n')
                line++;
        }
    }
    let inRawText = false;
    let rawEndTag = '';
    while (i < len) {
        const ch = source[i];
        // 每处理 5% 报告一次进度
        if (onProgress && i > start) {
            const pct = ((i - start) / (len - start)) * 100;
            onProgress(Math.floor(pct), '\u89e3\u6790\u4e2d...');
        }
        if (ch === '\n') {
            line++;
            out.push(ch);
            i++;
            continue;
        }
        // 在 script/style 内原样透传
        if (inRawText) {
            if (ch === '<' && source[i + 1] === '/') {
                const closeMatch = source.substring(i).match(/^<\/\s*([a-zA-Z][a-zA-Z0-9-]*)/i);
                if (closeMatch && closeMatch[1].toLowerCase() === rawEndTag) {
                    inRawText = false;
                }
                else {
                    out.push(ch);
                    i++;
                    continue;
                }
            }
            else {
                out.push(ch);
                i++;
                continue;
            }
        }
        if (ch !== '<') {
            out.push(ch);
            i++;
            continue;
        }
        const nxt = source[i + 1];
        // 结束标签
        if (nxt === '/') {
            const ei = _findTagEnd(source, i, len);
            const sli = ei === -1 ? source.substring(i) : source.substring(i, ei + 1);
            line += _countNewlines(sli);
            const m = sli.match(/^<\/\s*([a-zA-Z][a-zA-Z0-9-]*)/i);
            if (m) {
                const tn = m[1].toLowerCase();
                for (let k = stack.length - 1; k >= 0; k--) {
                    if (stack[k].tag === tn) {
                        lineMap[stack[k].id].endLine = line;
                        stack.splice(k, 1);
                        break;
                    }
                }
            }
            out.push(sli);
            i = ei === -1 ? len : ei + 1;
            continue;
        }
        // 注释/DOCTYPE/XML
        if (nxt === '!' || nxt === '?') {
            const ei = source.indexOf('>', i);
            const sli = ei === -1 || ei > len ? source.substring(i, len) : source.substring(i, ei + 1);
            line += _countNewlines(sli);
            out.push(sli);
            i = ei === -1 || ei > len ? len : ei + 1;
            continue;
        }
        // 开始标签
        const ei = _findTagEnd(source, i, len);
        const sli = ei === -1 ? source.substring(i) : source.substring(i, ei + 1);
        const m = sli.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/i);
        if (!m) {
            out.push(sli);
            i = ei === -1 ? len : ei + 1;
            continue;
        }
        const tn = m[1].toLowerCase();
        const isVoid = VOID_ELEMENTS.has(tn) || sli.trimEnd().endsWith('/>');
        // script/style 特殊处理
        if (tn === 'script' || tn === 'style') {
            out.push(sli);
            if (!isVoid) {
                inRawText = true;
                rawEndTag = tn;
            }
            line += _countNewlines(sli);
            i = ei === -1 ? len : ei + 1;
            continue;
        }
        // 跳过不需要映射的元素
        if (SKIP_ELEMENTS.has(tn)) {
            out.push(sli);
            line += _countNewlines(sli);
            i = ei === -1 ? len : ei + 1;
            continue;
        }
        // 大文件限制
        if (isLarge && idc > MAX_ELS) {
            out.push(sli);
            line += _countNewlines(sli);
            i = ei === -1 ? len : ei + 1;
            continue;
        }
        // 注入 data-comp-id
        const id = 'c-' + (idc++);
        const escaped = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('^<' + escaped + '\\b', 'i');
        out.push(sli.replace(re, '<' + m[1] + ' data-comp-id="' + id + '"'));
        lineMap[id] = { startLine: line, endLine: isVoid ? line : 0, tag: tn };
        if (!isVoid) {
            stack.push({ id, tag: tn });
        }
        line += _countNewlines(sli);
        i = ei === -1 ? len : ei + 1;
    }
    // 处理未闭合标签
    const total = _countNewlines(source) + 1;
    for (const it of stack) {
        lineMap[it.id].endLine = total;
    }
    return { html: out.join(''), lineMap };
}
function _findTagEnd(str, start, maxPos) {
    let j = start + 1;
    let q = null;
    while (j < str.length && j < maxPos) {
        if (q) {
            if (str[j] === q && str[j - 1] !== '\\')
                q = null;
        }
        else {
            if (str[j] === '"' || str[j] === "'")
                q = str[j];
            else if (str[j] === '>')
                return j;
        }
        j++;
    }
    return -1;
}
function _countNewlines(s) {
    let c = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '\n')
            c++;
    }
    return c;
}
//# sourceMappingURL=htmlProcessor.js.map