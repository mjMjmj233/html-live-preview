/**
 * HTML 实时预览与组件定位工具 - Webview 脚本 (v5)
 * 改用 Blob URL 渲染 iframe，避免 srcdoc 大文件问题
 */

const vscode = acquireVsCodeApi();

const els = {
  preview: document.getElementById('preview'),
  loading: document.getElementById('loading'),
  themeToggle: document.getElementById('theme-toggle'),
  modeBtns: document.querySelectorAll('.mode-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  statusText: document.getElementById('status-text'),
  locateHint: document.getElementById('locate-hint'),
  progressFill: document.getElementById('progress-fill'),
};

let currentMode = 'browse';
let lineMap = {};
  let tooltipEl = null;
let currentBlobUrl = null;

function init() {
  createTooltip();
  const state = vscode.getState();
  if (state?.theme === 'light') {
    document.body.classList.add('light-theme');
    els.themeToggle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  els.themeToggle.addEventListener('click', onThemeClick);
  els.modeBtns.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  els.refreshBtn.addEventListener('click', () => { vscode.postMessage({ type: 'refreshPreview' }); updateStatus('\u5237\u65B0\u4E2D...'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && currentMode === 'locate') setMode('browse'); });
  window.addEventListener('message', onMessage);

  vscode.postMessage({ type: 'ready' });
}

function onThemeClick() {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  els.themeToggle.innerHTML = isLight
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  vscode.setState({ theme: isLight ? 'light' : 'dark' });
}

function onMessage(e) {
  const msg = e.data;
  if (msg.type === 'updateContent') handleUpdate(msg.payload);
  else if (msg.type === 'switchMode') setMode(msg.payload.mode);
  else if (msg.type === 'progress') handleProgress(msg.payload);
}

let lastProgressPct = 0;

function handleProgress(payload) {
  const pct = payload.percent || 0;
  // 只增不减，避免进度条回退闪烁
  if (pct >= lastProgressPct) {
    els.progressFill.style.width = pct + '%';
    lastProgressPct = pct;
  }
  if (pct >= 100) {
    // 完成后短暂保留然后归零
    setTimeout(() => {
      els.progressFill.style.width = '0%';
      lastProgressPct = 0;
    }, 500);
  }
}

function handleUpdate(payload) {
  const html = payload.htmlContent || '';
  lineMap = payload.lineMap || {};
  if (!html) return;

  els.loading.classList.add('hidden');
  // 内容到达时进度条设为100%然后淡出
  els.progressFill.style.width = '100%';
  setTimeout(() => { els.progressFill.style.width = '0%'; }, 500);

  // 释放之前的 Blob URL
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }

  // 使用 Blob URL 渲染（比 srcdoc 更可靠，无大小限制）
  try {
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    currentBlobUrl = URL.createObjectURL(blob);
    els.preview.src = currentBlobUrl;
  } catch (e) {
    console.error('[HPV] Blob URL failed, fallback to srcdoc:', e);
    els.preview.removeAttribute('src');
    els.preview.srcdoc = html;
  }

  // 绑定交互事件
  setTimeout(bindIframeEvents, 100);

  const lines = html.split('\n').length;
  const mapped = Object.keys(lineMap).length;
  updateStatus(`\u884C\u6570: ${lines} / \u5143\u7D20: ${mapped}`);
}

function bindIframeEvents() {
  try {
    const d = els.preview.contentDocument || els.preview.contentWindow?.document;
    if (!d || d._hpvBound) return;
    d._hpvBound = true;

    d.addEventListener('mouseover', e => {
      if (currentMode !== 'locate') return;
      const t = e.target.closest?.('[data-comp-id]');
      if (!t) return;
      t.style.outline = '2px dashed #bd93f9';
      t.style.outlineOffset = '2px';

      const id = t.getAttribute('data-comp-id');
      const rng = lineMap[id];
      const tag = t.tagName.toLowerCase();
      let cls = (t.className && typeof t.className === 'string')
        ? '.' + t.className.split(/\s+/).filter(Boolean)[0] : '';
      if (!cls || cls === '.undefined') cls = '';

      let txt = '<' + tag + cls + '>';
      if (rng) txt += ` \u7B2C${rng.startLine}-${rng.endLine}\u884C`;

      tooltipEl.textContent = txt;
      tooltipEl.classList.add('visible');
      updateTipPos(e);
    });

    d.addEventListener('mouseout', e => {
      if (currentMode !== 'locate') return;
      const t = e.target.closest?.('[data-comp-id]');
      if (t) { t.style.outline = ''; t.style.outlineOffset = ''; }
      tooltipEl.classList.remove('visible');
    });

    d.addEventListener('mousemove', e => { if (currentMode === 'locate') updateTipPos(e); });

    d.addEventListener('click', e => {
      if (currentMode !== 'locate') return;
      e.preventDefault(); e.stopPropagation();

      const t = e.target.closest?.('[data-comp-id]');
      if (!t) return;

      const id = t.getAttribute('data-comp-id');
      const rng = lineMap[id];
      if (!rng) return;

      const orig = t.getAttribute('style') || '';
      t.style.cssText = orig + ';outline:2px solid #bd93f9!important;outline-offset:2px!important;';
      setTimeout(() => { t.setAttribute('style', orig); }, 900);

      vscode.postMessage({
        type: 'elementClicked',
        payload: { startLine: rng.startLine, endLine: rng.endLine, tagName: t.tagName.toLowerCase() }
      });
    }, true);

    // 检测 iframe 内是否有实际内容
    const hasContent = d.body && (d.body.children.length > 0 || d.body.textContent.trim().length > 0);
    if (!hasContent) {
      console.warn('[HPV] iframe loaded but appears empty');
    }

  } catch (err) { console.error('[HPV] iframe bind error:', err); }
}

function updateTipPos(e) {
  const r = els.preview.getBoundingClientRect();
  let x = r.left + e.clientX + 14;
  let y = r.top + e.clientY - 34;
  if (x + 160 > window.innerWidth) x = r.left + e.clientX - 170;
  if (y < 0) y = r.top + e.clientY + 16;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

function createTooltip() {
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'element-tooltip';
  document.body.appendChild(tooltipEl);
}

function setMode(mode) {
  currentMode = mode;
  els.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'locate') {
    els.preview.classList.add('locate-mode');
    els.locateHint.classList.remove('hidden');
  } else {
    els.preview.classList.remove('locate-mode');
    els.locateHint.classList.add('hidden');
    tooltipEl.classList.remove('visible');
  }
  vscode.postMessage({ type: 'modeChanged', payload: { mode } });
}

function updateStatus(t) { if (els.statusText) els.statusText.textContent = t; }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }