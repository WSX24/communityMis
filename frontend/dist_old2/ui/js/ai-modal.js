// AI Assistant Modal — shared across all screens
// Usage: openAIModal([scene]) where scene = 'all' | 'filter' | 'publish' | 'rules' | 'summary'

(function () {
  'use strict';

  let overlay, sheet, chatArea, inputEl, sendBtn, isProcessing = false;
  let currentScene = 'all';
  let initialized = false;

  const SCENE_LABELS = {
    all: '全部',
    filter: '筛选需求',
    publish: '发布辅助',
    rules: '规则问答',
    summary: '订单摘要'
  };

  const SCENE_PLACEHOLDERS = {
    all: '输入你的问题…',
    filter: '描述你想找的任务，如：信用高的英语辅导…',
    publish: '简单描述你要发布的内容…',
    rules: '询问平台规则，如：如何发起纠纷？',
    summary: '选择一个订单或纠纷，我将为你生成摘要…'
  };

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ESCAPE_MAP[c]); }

  const icons = {
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    sparkle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    dollar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    sun: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    copy: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    thumbsUp: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>',
    thumbsDown: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/></svg>',
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    newChat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  /* ── Modal Styles (injected once) ── */
  function injectStyles() {
    if (document.getElementById('ai-modal-styles')) return;
    const css = `
      .ai-modal-overlay {
        position: fixed; inset: 0; z-index: 200;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(8px);
        display: flex; align-items: flex-end; justify-content: center;
        opacity: 0; pointer-events: none;
        transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ai-modal-overlay.open {
        opacity: 1; pointer-events: auto;
      }
      .ai-modal-sheet {
        width: 100%; max-width: 720px; max-height: 92vh;
        background: var(--bg, #f8fafc);
        border-radius: var(--radius-xl, 24px) var(--radius-xl, 24px) 0 0;
        box-shadow: 0 -8px 40px rgba(0,0,0,0.12);
        display: flex; flex-direction: column;
        transform: translateY(40px);
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }
      .ai-modal-overlay.open .ai-modal-sheet {
        transform: translateY(0);
      }
      @media (min-width: 768px) {
        .ai-modal-overlay { align-items: center; padding: 40px; }
        .ai-modal-sheet {
          border-radius: var(--radius-xl, 24px);
          max-height: 85vh;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
      }

      /* Header */
      .ai-modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 20px 24px 12px;
        border-bottom: 1px solid var(--border-light, #e2e8f0);
        flex-shrink: 0;
      }
      .ai-modal-brand {
        display: flex; align-items: center; gap: 12px;
      }
      .ai-modal-avatar {
        width: 40px; height: 40px; border-radius: 12px;
        background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5));
        display: grid; place-items: center;
        color: #fff; box-shadow: 0 4px 12px rgba(99,102,241,0.25);
      }
      .ai-modal-title {
        font-size: 16px; font-weight: 700; color: var(--fg, #0f172a);
        line-height: 1.2;
      }
      .ai-modal-subtitle {
        font-size: 12px; color: var(--muted, #64748b); margin-top: 2px;
      }
      .ai-modal-header-actions {
        display: flex; gap: 8px;
      }
      .ai-modal-icon-btn {
        width: 36px; height: 36px; border-radius: 50%;
        display: grid; place-items: center;
        color: var(--muted, #64748b);
        background: transparent;
        border: none; cursor: pointer;
        transition: all 0.2s;
      }
      .ai-modal-icon-btn:hover {
        background: var(--border-light, #e2e8f0);
        color: var(--accent, #6366f1);
      }

      /* Scene Bar */
      .ai-modal-scene-bar {
        display: flex; gap: 8px; padding: 12px 24px;
        overflow-x: auto; scrollbar-width: none;
        border-bottom: 1px solid var(--border-light, #e2e8f0);
        flex-shrink: 0;
      }
      .ai-modal-scene-bar::-webkit-scrollbar { display: none; }
      .ai-modal-scene-chip {
        flex-shrink: 0;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 14px; border-radius: var(--radius-full, 9999px);
        font-size: 13px; font-weight: 600;
        color: var(--muted, #64748b);
        background: var(--surface, #fff);
        border: 1.5px solid var(--border, #e2e8f0);
        cursor: pointer; user-select: none;
        transition: all 0.2s ease;
      }
      .ai-modal-scene-chip:hover {
        border-color: var(--accent-light, #818cf8);
        color: var(--accent, #6366f1);
      }
      .ai-modal-scene-chip.active {
        background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5));
        color: #fff; border-color: transparent;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
      }

      /* Chat Area */
      .ai-modal-chat {
        flex: 1; overflow-y: auto; padding: 20px 24px;
        scroll-behavior: smooth;
      }

      /* Welcome */
      .ai-modal-welcome {
        text-align: center; padding: 24px 8px;
        animation: fadeInUp 0.5s ease;
      }
      .welcome-icon {
        width: 56px; height: 56px; border-radius: 16px;
        background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5));
        display: grid; place-items: center;
        color: #fff;
        margin: 0 auto 16px;
      }
      .ai-modal-welcome h2 {
        font-size: 18px; font-weight: 700; color: var(--fg, #0f172a);
        margin-bottom: 8px;
      }
      .ai-modal-welcome p {
        font-size: 14px; color: var(--muted, #64748b); line-height: 1.6;
        max-width: 360px; margin: 0 auto 24px;
      }
      .suggested-qs { text-align: left; }
      .sq-label {
        font-size: 12px; font-weight: 600; color: var(--muted, #64748b);
        text-transform: uppercase; letter-spacing: 0.05em;
        margin-bottom: 10px; padding-left: 4px;
      }
      .sq-grid {
        display: grid; gap: 8px;
      }
      .sq-btn {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 14px; border-radius: var(--radius-lg, 12px);
        background: var(--surface, #fff);
        border: 1.5px solid var(--border, #e2e8f0);
        cursor: pointer; text-align: left;
        transition: all 0.2s ease;
      }
      .sq-btn:hover {
        border-color: var(--accent-light, #818cf8);
        transform: translateX(4px);
        box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
      }
      .sq-icon {
        width: 32px; height: 32px; border-radius: 10px;
        display: grid; place-items: center; flex-shrink: 0;
      }
      .sq-text {
        font-size: 14px; color: var(--text-secondary, #334155); font-weight: 500;
        line-height: 1.4;
      }

      /* Messages */
      .ai-modal-msg {
        display: flex; gap: 10px; margin-bottom: 20px;
        animation: fadeInUp 0.35s ease;
      }
      .ai-modal-msg.assistant { align-items: flex-start; }
      .ai-modal-msg.user { align-items: flex-start; flex-direction: row-reverse; }
      .ai-modal-msg-avatar {
        width: 28px; height: 28px; border-radius: 50%;
        display: grid; place-items: center; flex-shrink: 0;
      }
      .ai-modal-msg.assistant .ai-modal-msg-avatar {
        background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5));
        color: #fff;
      }
      .ai-modal-msg.user .ai-modal-msg-avatar {
        background: var(--border-light, #e2e8f0);
        color: var(--muted, #64748b);
      }
      .ai-modal-msg-bubble {
        padding: 12px 16px; border-radius: var(--radius-lg, 12px);
        font-size: 14px; line-height: 1.7;
        max-width: min(520px, calc(100% - 48px));
        word-wrap: break-word;
      }
      .ai-modal-msg.assistant .ai-modal-msg-bubble {
        background: var(--surface, #fff);
        border: 1px solid var(--border-light, #e2e8f0);
        color: var(--text-secondary, #334155);
        border-top-left-radius: 4px;
      }
      .ai-modal-msg.user .ai-modal-msg-bubble {
        background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5));
        color: #fff;
        border-top-right-radius: 4px;
      }

      /* Message actions */
      .ai-modal-msg-actions {
        display: flex; gap: 8px; margin-top: 6px; padding-left: 38px;
      }
      .ai-modal-msg-action-btn {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 10px; border-radius: var(--radius-full, 9999px);
        font-size: 12px; color: var(--muted, #64748b);
        background: transparent; border: 1px solid transparent;
        cursor: pointer; transition: all 0.2s;
      }
      .ai-modal-msg-action-btn:hover {
        background: var(--border-light, #e2e8f0);
        color: var(--text-secondary, #334155);
      }
      .ai-modal-msg-action-btn.active {
        background: var(--accent-subtle, rgba(99,102,241,0.08));
        color: var(--accent, #6366f1);
        border-color: var(--accent-light, #818cf8);
      }

      /* Typing */
      .ai-modal-typing {
        display: flex; gap: 6px; align-items: center;
        padding: 12px 16px; margin-bottom: 20px;
        margin-left: 38px;
        width: fit-content;
        background: var(--surface, #fff);
        border: 1px solid var(--border-light, #e2e8f0);
        border-radius: var(--radius-lg, 12px);
        border-top-left-radius: 4px;
      }
      .tdot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent, #6366f1);
        opacity: 0.4;
        animation: typingBounce 1.4s infinite ease-in-out both;
      }
      .tdot:nth-child(1) { animation-delay: -0.32s; }
      .tdot:nth-child(2) { animation-delay: -0.16s; }
      @keyframes typingBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* Disclaimer */
      .ai-modal-disclaimer {
        font-size: 11px; color: var(--muted, #64748b);
        text-align: center; padding: 8px 24px;
        line-height: 1.5; opacity: 0.8;
        flex-shrink: 0;
      }

      /* Input Bar */
      .ai-modal-input-bar {
        display: flex; gap: 10px; align-items: flex-end;
        padding: 12px 24px 20px;
        border-top: 1px solid var(--border-light, #e2e8f0);
        background: var(--bg, #f8fafc);
        flex-shrink: 0;
      }
      .ai-modal-input-bar textarea {
        flex: 1; resize: none; border: none; outline: none;
        background: var(--surface, #fff);
        border: 1.5px solid var(--border, #e2e8f0);
        border-radius: var(--radius-xl, 24px);
        padding: 10px 16px; font-size: 14px; line-height: 1.5;
        color: var(--fg, #0f172a); max-height: 100px;
        transition: border-color 0.2s, box-shadow 0.2s;
        font-family: inherit;
      }
      .ai-modal-input-bar textarea:focus {
        border-color: var(--accent, #6366f1);
        box-shadow: 0 0 0 3px var(--accent-subtle, rgba(99,102,241,0.15));
      }
      .ai-modal-input-bar textarea::placeholder {
        color: var(--muted, #64748b);
      }
      .ai-modal-send-btn {
        width: 40px; height: 40px; border-radius: 50%;
        display: grid; place-items: center;
        background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5));
        color: #fff; border: none; cursor: pointer;
        flex-shrink: 0;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
      }
      .ai-modal-send-btn:hover:not(:disabled) {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
      }
      .ai-modal-send-btn:disabled {
        opacity: 0.5; cursor: not-allowed; transform: none;
        box-shadow: none;
      }

      /* Rich Cards inside bubbles */
      .apply-filter-card {
        background: var(--bg, #f8fafc);
        border: 1px solid var(--border-light, #e2e8f0);
        border-radius: var(--radius-md, 8px);
        padding: 12px; margin-top: 10px;
      }
      .filter-tags {
        display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;
      }
      .filter-tag {
        display: inline-flex; padding: 4px 10px;
        border-radius: var(--radius-full, 9999px);
        font-size: 12px; font-weight: 600;
        background: var(--accent-subtle, rgba(99,102,241,0.08));
        color: var(--accent, #6366f1);
      }
      .apply-filter-btn {
        width: 100%; padding: 10px;
        border-radius: var(--radius-lg, 12px);
        border: none; background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5));
        color: #fff; font-weight: 700; font-size: 13px;
        cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .apply-filter-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
      }

      .ai-rules-list {
        margin: 10px 0 0; padding-left: 18px;
        color: var(--text-secondary, #334155);
      }
      .ai-rules-list li {
        margin-bottom: 6px; line-height: 1.6;
      }
      .ai-rules-footer {
        margin-top: 10px; font-size: 13px; color: var(--muted, #64748b);
        border-top: 1px dashed var(--border-light, #e2e8f0);
        padding-top: 8px;
      }

      .draft-card {
        background: var(--bg, #f8fafc);
        border: 1.5px solid var(--border-light, #e2e8f0);
        border-radius: var(--radius-md, 8px);
        padding: 14px; margin-top: 10px;
      }
      .draft-title {
        font-weight: 700; font-size: 14px; color: var(--fg, #0f172a);
        margin-bottom: 6px;
      }
      .draft-body {
        font-size: 13px; color: var(--text-secondary, #334155);
        line-height: 1.6; margin-bottom: 10px;
      }
      .draft-tags {
        display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;
      }
      .draft-actions {
        display: flex; gap: 8px;
      }
      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: var(--radius-full, 9999px); font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; }
      .btn--sm { padding: 8px 16px; font-size: 13px; }
      .btn--primary { background: linear-gradient(135deg, var(--accent, #6366f1), var(--accent-hover, #4f46e5)); color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,0.2); }
      .btn--primary:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,0.3); }
      .btn--ghost { background: var(--surface, #fff); color: var(--muted, #64748b); border: 1.5px solid var(--border, #e2e8f0); }
      .btn--ghost:hover { border-color: var(--accent-light, #818cf8); color: var(--accent, #6366f1); }

      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    const style = document.createElement('style');
    style.id = 'ai-modal-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Build Modal ── */
  function buildModal() {
    if (initialized) return;
    initialized = true;
    injectStyles();

    const sceneChips = ['all', 'filter', 'publish', 'rules', 'summary'].map(s =>
      `<button class="ai-modal-scene-chip" data-scene="${s}">${icons[s === 'all' ? 'sun' : s === 'filter' ? 'search' : s === 'publish' ? 'edit' : s === 'rules' ? 'copy' : 'dollar']} ${SCENE_LABELS[s]}</button>`
    ).join('');

    const suggestedQs = [
      { q: '我想找一个信用高、今天发布的电脑维修需求', icon: 'search', bg: 'var(--secondary-light, #e0e7ff)', color: 'var(--secondary, #4f46e5)' },
      { q: '如何发起纠纷？需要什么条件？', icon: 'alert', bg: 'var(--warning-light, #fef3c7)', color: 'var(--warning, #d97706)' },
      { q: '我的时间币为什么被冻结了？', icon: 'dollar', bg: 'var(--accent-subtle, rgba(99,102,241,0.08))', color: 'var(--accent, #6366f1)' },
      { q: '帮我写一段发布代取快递任务的描述', icon: 'edit', bg: 'var(--success-light, #d1fae5)', color: 'var(--success, #059669)' }
    ].map(sq =>
      `<button class="sq-btn" data-question="${esc(sq.q)}"><span class="sq-icon" style="background:${sq.bg};color:${sq.color};">${icons[sq.icon]}</span><span class="sq-text">${esc(sq.q)}</span></button>`
    ).join('');

    const html = `
    <div class="ai-modal-overlay" id="ai-modal-overlay">
      <div class="ai-modal-sheet" id="ai-modal-sheet" role="dialog" aria-label="AI 助手">
        <div class="ai-modal-header">
          <div class="ai-modal-brand">
            <div class="ai-modal-avatar">${icons.sparkle}</div>
            <div>
              <div class="ai-modal-title">AI 助手</div>
              <div class="ai-modal-subtitle">邻帮智能辅助 · 仅供参考</div>
            </div>
          </div>
          <div class="ai-modal-header-actions">
            <button class="ai-modal-icon-btn" id="ai-modal-new" aria-label="新对话">${icons.newChat}</button>
            <button class="ai-modal-icon-btn" id="ai-modal-close" aria-label="关闭">${icons.close}</button>
          </div>
        </div>
        <div class="ai-modal-scene-bar" id="ai-modal-scene-bar">${sceneChips}</div>
        <div class="ai-modal-chat" id="ai-modal-chat">
          <div class="ai-modal-welcome" id="ai-modal-welcome">
            <div class="welcome-icon">${icons.sparkle.replace('width="16"','width="28"').replace('height="16"','height="28"')}</div>
            <h2>你好，我是邻帮 AI 助手</h2>
            <p>我可以帮你查找服务、解答规则、筛选需求，以及辅助发布内容。我不能替你做关键操作——最终决定权在你手中。</p>
            <div class="suggested-qs"><div class="sq-label">试试问我</div><div class="sq-grid">${suggestedQs}</div></div>
          </div>
        </div>
        <p class="ai-modal-disclaimer">AI 回答仅供参考，不能替代平台规则和人工判断。<br>关键操作（接单、结算、纠纷裁决等）仍需你在页面中确认。</p>
        <div class="ai-modal-input-bar">
          <textarea id="ai-modal-input" rows="1" placeholder="输入你的问题…" oninput="this.style.height='';this.style.height=Math.min(this.scrollHeight,100)+'px';"></textarea>
          <button class="ai-modal-send-btn" id="ai-modal-send" aria-label="发送">${icons.send}</button>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    overlay = document.getElementById('ai-modal-overlay');
    sheet = document.getElementById('ai-modal-sheet');
    chatArea = document.getElementById('ai-modal-chat');
    inputEl = document.getElementById('ai-modal-input');
    sendBtn = document.getElementById('ai-modal-send');

    // Events
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.getElementById('ai-modal-close').addEventListener('click', closeModal);
    document.getElementById('ai-modal-new').addEventListener('click', resetChat);

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    document.querySelectorAll('#ai-modal-scene-bar .ai-modal-scene-chip').forEach(chip => {
      chip.addEventListener('click', function () {
        document.querySelectorAll('#ai-modal-scene-bar .ai-modal-scene-chip').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        currentScene = this.dataset.scene;
        inputEl.placeholder = SCENE_PLACEHOLDERS[currentScene] || SCENE_PLACEHOLDERS.all;
        inputEl.focus();
      });
    });

    document.querySelectorAll('#ai-modal-chat .sq-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        inputEl.value = this.dataset.question;
        sendMessage();
      });
    });
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function openModal(scene) {
    buildModal();
    currentScene = scene || 'all';
    document.querySelectorAll('#ai-modal-scene-bar .ai-modal-scene-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.scene === currentScene);
    });
    inputEl.placeholder = SCENE_PLACEHOLDERS[currentScene] || SCENE_PLACEHOLDERS.all;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => inputEl.focus(), 350);
  }

  function resetChat() {
    const suggestedQs = [
      { q: '我想找一个信用高、今天发布的电脑维修需求', icon: 'search', bg: 'var(--secondary-light, #e0e7ff)', color: 'var(--secondary, #4f46e5)' },
      { q: '如何发起纠纷？需要什么条件？', icon: 'alert', bg: 'var(--warning-light, #fef3c7)', color: 'var(--warning, #d97706)' },
      { q: '我的时间币为什么被冻结了？', icon: 'dollar', bg: 'var(--accent-subtle, rgba(99,102,241,0.08))', color: 'var(--accent, #6366f1)' },
      { q: '帮我写一段发布代取快递任务的描述', icon: 'edit', bg: 'var(--success-light, #d1fae5)', color: 'var(--success, #059669)' }
    ].map(sq =>
      `<button class="sq-btn" data-question="${esc(sq.q)}"><span class="sq-icon" style="background:${sq.bg};color:${sq.color};">${icons[sq.icon]}</span><span class="sq-text">${esc(sq.q)}</span></button>`
    ).join('');

    chatArea.innerHTML = `<div class="ai-modal-welcome" id="ai-modal-welcome">
      <div class="welcome-icon">${icons.sparkle.replace('width="16"','width="28"').replace('height="16"','height="28"')}</div>
      <h2>你好，我是邻帮 AI 助手</h2>
      <p>我可以帮你查找服务、解答规则、筛选需求，以及辅助发布内容。我不能替你做关键操作——最终决定权在你手中。</p>
      <div class="suggested-qs"><div class="sq-label">试试问我</div><div class="sq-grid">${suggestedQs}</div></div>
    </div>`;

    chatArea.querySelectorAll('.sq-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        inputEl.value = this.dataset.question;
        sendMessage();
      });
    });
  }

  // ── AI Response Engine ──
  const aiResponses = {
    '电脑维修': { text: '根据你的需求，我为你筛选了以下条件：', type: 'filter', tags: ['关键词=电脑维修', '信用分≥4.5', '发布时间=今天', '状态=待接单'], action: '查看匹配结果', resultCount: 3 },
    '纠纷': { text: '发起纠纷需要满足以下条件，我为你整理了关键规则：', type: 'rules', rules: ['订单状态为"已完成"或"已确认"', '订单完成后 7 天内可发起', '需提供纠纷类型（服务未完成、质量不符、沟通问题等）', '需提供相关证据（聊天记录、图片等）', '纠纷发起后将冻结相关时间币，等待处理'], footer: '以上为平台规则摘要，具体操作请在"我的订单"中点击对应订单的"发起纠纷"按钮。' },
    '冻结': { text: '你的时间币被冻结可能有以下几种原因：', type: 'rules', rules: ['正在进行中的订单——接单后对应时间币会被冻结，双方确认完成后自动释放', '纠纷处理中——纠纷订单涉及的时间币被临时冻结，等待管理员裁决', '系统风控——异常交易行为会触发临时冻结以便核查', '账户限制——如账户处于受限状态，部分功能和时间币可能被冻结'], footer: '如需查询具体冻结记录，请前往"我的钱包 → 冻结明细"查看。' },
    '快递': { text: '我为你生成了一份任务草稿，你可以在此基础上修改：', type: 'draft', draftTitle: '代取快递并送货上门', draftBody: '需要帮忙去菜鸟驿站代取一个包裹，取件码通过私信发送。包裹不大，不需要推车。送到阳光花园 X 号楼 X 室，放在门口即可。有时间的邻居请联系，谢谢！', draftTags: ['快递代取', '轻量', '即时'], draftReward: '¥10-15' },
    '发布': { text: '我为你生成了一份任务草稿，你可以在此基础上修改：', type: 'draft', draftTitle: '代取快递并送货上门', draftBody: '需要帮忙去菜鸟驿站代取一个包裹，取件码通过私信发送。包裹不大，不需要推车。送到阳光花园 X 号楼 X 室，放在门口即可。有时间的邻居请联系，谢谢！', draftTags: ['快递代取', '轻量', '即时'], draftReward: '¥10-15' },
    default: { text: '好的，让我帮你梳理一下相关信息：', type: 'default', response: '我目前可以帮你解答平台规则相关问题、辅助筛选需求大厅的任务、帮忙生成发布文案草稿。\n\n你可以尝试问我：\n· 如何评价已完成订单？\n· 找一个今天发布的宠物照看需求\n· 发布一则社区活动通知应该怎么写\n· 陪审投票有什么作用？' }
  };

  function getResponse(query) {
    const q = query.trim();
    for (const [key, resp] of Object.entries(aiResponses)) {
      if (q.includes(key)) return resp;
    }
    return aiResponses.default;
  }

  function buildMsgHTML(role, content) {
    return `<div class="ai-modal-msg ${role}">
      <div class="ai-modal-msg-avatar">${role === 'user' ? icons.user : icons.sparkle.replace('width="16"','width="14"').replace('height="16"','height="14"')}</div>
      <div><div class="ai-modal-msg-bubble">${esc(content)}</div></div>
    </div>`;
  }

  function buildAIResponseHTML(resp) {
    let html = `<div class="ai-modal-msg assistant">
      <div class="ai-modal-msg-avatar">${icons.sparkle.replace('width="16"','width="14"').replace('height="16"','height="14"')}</div>
      <div><div class="ai-modal-msg-bubble"><p>${esc(resp.text)}</p>`;

    if (resp.type === 'filter') {
      html += `<div class="apply-filter-card">
        <div class="filter-tags">${resp.tags.map(t => `<span class="filter-tag">${t}</span>`).join('')}</div>
        <button class="apply-filter-btn" onclick="window._aiModalNavigate&&window._aiModalNavigate('tasks.html')">
          ${icons.search.replace('width="14"','').replace('height="14"','')} 查看匹配结果（${resp.resultCount} 个任务）
        </button>
      </div>`;
    }
    if (resp.type === 'rules' && resp.rules) {
      html += '<ul class="ai-rules-list">';
      resp.rules.forEach(r => { html += `<li>${esc(r)}</li>`; });
      html += '</ul>';
      if (resp.footer) html += `<p class="ai-rules-footer">${esc(resp.footer)}</p>`;
    }
    if (resp.type === 'draft') {
      html += `<div class="draft-card">
        <div class="draft-title">${esc(resp.draftTitle)}</div>
        <div class="draft-body">${esc(resp.draftBody)}</div>
        <div class="draft-tags">
          ${resp.draftTags.map(t => `<span class="filter-tag" style="background:var(--accent-subtle, rgba(99,102,241,0.08));color:var(--accent, #6366f1);">${t}</span>`).join('')}
          <span class="filter-tag" style="background:var(--warning-light, #fef3c7);color:var(--warning, #d97706);">悬赏 ${esc(resp.draftReward)}</span>
        </div>
        <div class="draft-actions">
          <button class="btn btn--primary btn--sm" onclick="window._aiModalNavigate&&window._aiModalNavigate('post.html')">确认并填入发布表单</button>
          <button class="btn btn--ghost btn--sm" onclick="document.getElementById('ai-modal-input').value='帮我写一段发布代取快递任务的描述';document.getElementById('ai-modal-send').click();">重新生成</button>
        </div>
      </div>`;
    }

    html += `</div>
      <div class="ai-modal-msg-actions">
        <button class="ai-modal-msg-action-btn" onclick="navigator.clipboard?.writeText(this.closest('.ai-modal-msg').querySelector('.ai-modal-msg-bubble').textContent.trim());this.textContent='✓ 已复制';setTimeout(()=>this.textContent='${esc('复制')}',2000);">${icons.copy} 复制</button>
        <button class="ai-modal-msg-action-btn" onclick="this.classList.toggle('active')">${icons.thumbsUp} 有用</button>
        <button class="ai-modal-msg-action-btn" onclick="this.classList.toggle('active')">${icons.thumbsDown} 没用</button>
      </div></div></div>`;
    return html;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'ai-modal-typing';
    el.id = 'ai-modal-typing';
    el.innerHTML = '<span class="tdot"></span><span class="tdot"></span><span class="tdot"></span>';
    chatArea.appendChild(el);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('ai-modal-typing');
    if (el) el.remove();
  }

  function sendMessage() {
    const query = inputEl.value.trim();
    if (!query || isProcessing) return;
    isProcessing = true;
    sendBtn.disabled = true;

    const welcome = document.getElementById('ai-modal-welcome');
    if (welcome) welcome.style.display = 'none';

    chatArea.insertAdjacentHTML('beforeend', buildMsgHTML('user', query));
    inputEl.value = '';
    inputEl.style.height = '';
    chatArea.scrollTop = chatArea.scrollHeight;

    setTimeout(() => {
      showTyping();
      setTimeout(() => {
        hideTyping();
        const resp = getResponse(query);
        chatArea.insertAdjacentHTML('beforeend', buildAIResponseHTML(resp));
        chatArea.scrollTop = chatArea.scrollHeight;
        isProcessing = false;
        sendBtn.disabled = false;
      }, 1000 + Math.random() * 700);
    }, 250);
  }

  // Expose to window
  window.openAIModal = openModal;
  window.closeAIModal = closeModal;
  window._aiModalNavigate = function (url) { closeModal(); setTimeout(() => { window.location.href = url; }, 300); };
})();