// MClaw WebChat — 嵌入式聊天组件
// 使用方式：<script src="http://your-server:18621/webchat/embed.js" data-agent="agent-id"></script>
(function () {
  'use strict';

  const script = document.currentScript;
  const config = {
    server: script.getAttribute('data-server') || window.location.origin.replace(/:\d+$/, ':18621'),
    agentId: script.getAttribute('data-agent') || '',
    title: script.getAttribute('data-title') || '智能助手',
    placeholder: script.getAttribute('data-placeholder') || '输入消息...',
    theme: script.getAttribute('data-theme') || 'light',
    position: script.getAttribute('data-position') || 'right',
    bubbleColor: script.getAttribute('data-bubble-color') || '#3b82f6',
    endUserId: script.getAttribute('data-end-user-id') || '',
    locale: script.getAttribute('data-locale') || 'zh-CN'
  };

  // ── Token 管理 ──
  let authToken = script.getAttribute('data-token') || '';
  if (!authToken) {
    // 尝试从 localStorage 读取
    authToken = localStorage.getItem('mclaw_webchat_token') || '';
  }

  // ── 注入样式 ──
  const style = document.createElement('style');
  style.textContent = `
    .mclaw-wc-bubble {
      position: fixed;
      ${config.position === 'left' ? 'left: 20px' : 'right: 20px'};
      bottom: 20px;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: ${config.bubbleColor};
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 999998;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      user-select: none;
    }
    .mclaw-wc-bubble:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
    .mclaw-wc-bubble svg { width: 28px; height: 28px; fill: #fff; }
    .mclaw-wc-bubble .mclaw-wc-close { display: none; }
    .mclaw-wc-bubble.open .mclaw-wc-icon { display: none; }
    .mclaw-wc-bubble.open .mclaw-wc-close { display: block; }

    .mclaw-wc-badge {
      position: absolute; top: -4px; right: -4px;
      width: 20px; height: 20px; border-radius: 50%;
      background: #ef4444; color: #fff; font-size: 12px;
      display: none; align-items: center; justify-content: center;
    }

    .mclaw-wc-window {
      position: fixed;
      ${config.position === 'left' ? 'left: 20px' : 'right: 20px'};
      bottom: 90px;
      width: 380px; height: 560px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 120px);
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      z-index: 999999;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .mclaw-wc-window.open { display: flex; }

    .mclaw-wc-header {
      padding: 14px 18px;
      background: ${config.bubbleColor};
      color: #fff;
      font-weight: 600;
      font-size: 15px;
      display: flex; align-items: center; gap: 10px;
      user-select: none;
    }
    .mclaw-wc-header .mclaw-wc-avatar {
      width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .mclaw-wc-header-actions {
      margin-left: auto; display: flex; gap: 8px;
    }
    .mclaw-wc-header-actions button {
      background: rgba(255,255,255,0.2); border: none; color: #fff;
      width: 28px; height: 28px; border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
    }
    .mclaw-wc-header-actions button:hover { background: rgba(255,255,255,0.3); }

    .mclaw-wc-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
      background: #f8f9fa;
    }
    .mclaw-wc-msg {
      max-width: 85%; padding: 10px 14px; border-radius: 14px;
      font-size: 14px; line-height: 1.5; word-break: break-word;
      animation: mclawFadeIn 0.3s ease;
    }
    @keyframes mclawFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .mclaw-wc-msg.user {
      align-self: flex-end;
      background: ${config.bubbleColor}; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .mclaw-wc-msg.assistant {
      align-self: flex-start;
      background: #fff; color: #333;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .mclaw-wc-msg.assistant a { color: ${config.bubbleColor}; }
    .mclaw-wc-msg.assistant pre {
      background: #f0f0f0; padding: 10px; border-radius: 8px;
      overflow-x: auto; font-size: 12px;
    }
    .mclaw-wc-msg.assistant code {
      background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 12px;
    }
    .mclaw-wc-typing {
      align-self: flex-start;
      padding: 12px 16px;
      display: flex; gap: 4px;
    }
    .mclaw-wc-typing span {
      width: 7px; height: 7px; border-radius: 50%; background: #999;
      animation: mclawDot 1.4s infinite ease;
    }
    .mclaw-wc-typing span:nth-child(2) { animation-delay: 0.2s; }
    .mclaw-wc-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes mclawDot { 0%,60%,100% { opacity: 0.3; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1); } }

    .mclaw-wc-input-area {
      padding: 12px 16px; border-top: 1px solid #eee;
      display: flex; gap: 8px; background: #fff;
    }
    .mclaw-wc-input-area input {
      flex: 1; padding: 10px 14px; border: 1px solid #e0e0e0;
      border-radius: 22px; font-size: 14px; outline: none;
      transition: border-color 0.2s;
    }
    .mclaw-wc-input-area input:focus { border-color: ${config.bubbleColor}; }
    .mclaw-wc-input-area button {
      width: 40px; height: 40px; border-radius: 50%; border: none;
      background: ${config.bubbleColor}; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .mclaw-wc-input-area button:hover { transform: scale(1.05); }
    .mclaw-wc-input-area button:disabled { opacity: 0.5; }

    /* Dark theme */
    .mclaw-wc-window.dark { background: #1a1a2e; }
    .mclaw-wc-window.dark .mclaw-wc-messages { background: #16213e; }
    .mclaw-wc-window.dark .mclaw-wc-msg.assistant { background: #0f3460; color: #e0e0e0; }
    .mclaw-wc-window.dark .mclaw-wc-msg.assistant code { background: #1a1a2e; }
    .mclaw-wc-window.dark .mclaw-wc-msg.assistant pre { background: #1a1a2e; }
    .mclaw-wc-window.dark .mclaw-wc-input-area { background: #1a1a2e; border-color: #2a2a4a; }
    .mclaw-wc-window.dark .mclaw-wc-input-area input { background: #16213e; border-color: #2a2a4a; color: #e0e0e0; }

    /* Mobile responsive */
    @media (max-width: 480px) {
      .mclaw-wc-window {
        width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh;
        bottom: 0; ${config.position === 'left' ? 'left: 0' : 'right: 0'};
        border-radius: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // ── 构建 DOM ──
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="mclaw-wc-bubble" id="mclawBubble" title="${config.title}">
      <svg class="mclaw-wc-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/></svg>
      <svg class="mclaw-wc-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      <div class="mclaw-wc-badge" id="mclawBadge"></div>
    </div>
    <div class="mclaw-wc-window${config.theme === 'dark' ? ' dark' : ''}" id="mclawWindow">
      <div class="mclaw-wc-header">
        <div class="mclaw-wc-avatar">🤖</div>
        <span>${config.title}</span>
        <div class="mclaw-wc-header-actions">
          <button id="mclawReset" title="新对话">↻</button>
          <button id="mclawMinimize" title="最小化">─</button>
        </div>
      </div>
      <div class="mclaw-wc-messages" id="mclawMessages">
        <div class="mclaw-wc-msg assistant">你好！👋 我是${config.title}，有什么可以帮你的？</div>
      </div>
      <div class="mclaw-wc-input-area">
        <input type="text" id="mclawInput" placeholder="${config.placeholder}" maxlength="4000">
        <button id="mclawSend" title="发送">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // ── 状态 ──
  const messagesEl = document.getElementById('mclawMessages');
  const inputEl = document.getElementById('mclawInput');
  const sendBtn = document.getElementById('mclawSend');
  const bubbleEl = document.getElementById('mclawBubble');
  const windowEl = document.getElementById('mclawWindow');
  const resetBtn = document.getElementById('mclawReset');
  const minimizeBtn = document.getElementById('mclawMinimize');

  let sessionId = localStorage.getItem('mclaw_webchat_session') || generateUUID();
  let isStreaming = false;
  let unreadCount = 0;

  function generateUUID() {
    return 'wc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function saveSession() {
    localStorage.setItem('mclaw_webchat_session', sessionId);
  }

  // ── UI 交互 ──
  function toggleChat() {
    const open = windowEl.classList.contains('open');
    if (open) {
      windowEl.classList.remove('open');
      bubbleEl.classList.remove('open');
    } else {
      windowEl.classList.add('open');
      bubbleEl.classList.add('open');
      unreadCount = 0;
      updateBadge();
      inputEl.focus();
    }
  }

  bubbleEl.addEventListener('click', toggleChat);
  minimizeBtn.addEventListener('click', toggleChat);

  resetBtn.addEventListener('click', () => {
    if (confirm('确定要开始新对话吗？')) {
      sessionId = generateUUID();
      saveSession();
      messagesEl.innerHTML = '<div class="mclaw-wc-msg assistant">你好！👋 新对话开始了，有什么可以帮你的？</div>';
    }
  });

  function updateBadge() {
    const badge = document.getElementById('mclawBadge');
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
  }

  function addMessage(role, content) {
    const el = document.createElement('div');
    el.className = `mclaw-wc-msg ${role}`;
    el.innerHTML = renderMarkdown(content);
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function addTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'mclaw-wc-typing';
    el.id = 'mclawTyping';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('mclawTyping');
    if (el) el.remove();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // 简易 Markdown 渲染（加粗、链接、代码块、换行）
  function renderMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // 代码块
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 加粗
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // 换行
      .replace(/\n/g, '<br>');
    return html;
  }

  // ── API 调用 ──
  async function sendMessage() {
    const content = inputEl.value.trim();
    if (!content || isStreaming) return;

    inputEl.value = '';
    isStreaming = true;
    sendBtn.disabled = true;

    addMessage('user', content);
    addTypingIndicator();

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const body = {
        message: content,
        stream: false,
        session_id: sessionId,
        context: { source: 'webchat', endUserId: config.endUserId }
      };
      if (config.agentId) body.agent = config.agentId;

      const response = await fetch(`${config.server}/api/chat/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (response.status === 401 || response.status === 403) {
        removeTypingIndicator();
        addMessage('assistant', '⚠️ 需要登录认证。请配置有效的访问令牌。');
        return;
      }

      const data = await response.json();
      removeTypingIndicator();

      if (data.code === 200 && data.data?.content) {
        addMessage('assistant', data.data.content);
      } else {
        addMessage('assistant', '抱歉，服务暂时不可用。');
      }
    } catch (err) {
      removeTypingIndicator();
      addMessage('assistant', `网络错误: ${err.message}`);
    } finally {
      isStreaming = false;
      sendBtn.disabled = false;
      saveSession();

      // 更新未读计数（窗口最小化时）
      if (!windowEl.classList.contains('open')) {
        unreadCount++;
        updateBadge();
      }
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ── 初始化 ──
  saveSession();

  // 暴露 API
  window.MClawWebChat = {
    open: () => { if (!windowEl.classList.contains('open')) toggleChat(); },
    close: () => { if (windowEl.classList.contains('open')) toggleChat(); },
    send: (msg) => { inputEl.value = msg; sendMessage(); },
    setToken: (token) => { authToken = token; localStorage.setItem('mclaw_webchat_token', token); },
    reset: () => { resetBtn.click(); },
    getSessionId: () => sessionId
  };

  console.log('[MClaw WebChat] 已就绪', { server: config.server, agent: config.agentId });
})();
