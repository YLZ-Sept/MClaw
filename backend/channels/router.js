// Channel Message Router — 参考 mateclaw ChannelMessageRouter
// 每渠道类型独立队列 + 自适应去抖 + 每条消息重新加载配置
const db = require('../db');
const { channelManager } = require('./manager');

// 去抖配置
const DEBOUNCE_NORMAL_MS = 500;      // 正常去抖
const DEBOUNCE_PASTE_MS = 2500;      // 粘贴检测去抖（>1500 字符）
const PASTE_THRESHOLD_CHARS = 1500;
const QUEUE_CAPACITY = 200;

// 每渠道类型的消息队列
const queues = new Map(); // channelType → Array
const consumers = new Map(); // channelType → running

/**
 * 接收消息并入队
 * @param {object} msg — 标准化消息 { channelId, channelType, from, to, content, msgType, isGroup }
 */
function enqueue(msg) {
  const { channelType } = msg;
  if (!channelType) return;

  let queue = queues.get(channelType);
  if (!queue) {
    queue = [];
    queues.set(channelType, queue);
  }

  // 容量保护
  if (queue.length >= QUEUE_CAPACITY) {
    console.warn(`[router] ${channelType} 队列已满 (${QUEUE_CAPACITY})，丢弃最旧消息`);
    queue.shift();
  }

  // 自适应去抖：检测是否与上一条消息来自同一发送者
  const last = queue[queue.length - 1];
  if (last && last.from === msg.from && last.to === msg.to) {
    const debounceMs = (msg.content || '').length > PASTE_THRESHOLD_CHARS
      ? DEBOUNCE_PASTE_MS
      : DEBOUNCE_NORMAL_MS;

    const elapsed = Date.now() - (last._enqueuedAt || 0);
    if (elapsed < debounceMs) {
      // 合并消息：追加内容
      last.content = (last.content || '') + '\n' + (msg.content || '');
      last._merged = true;
      last._enqueuedAt = Date.now();
      return; // 被合并，不单独处理
    }
  }

  msg._enqueuedAt = Date.now();
  queue.push(msg);
  _ensureConsumer(channelType);
}

/**
 * 重新加载渠道配置（每条消息前调用，配置变更即时生效）
 */
function freshChannelEntity(channelId) {
  try {
    return db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(channelId);
  } catch {
    return null;
  }
}

/**
 * 确保消费者在运行
 */
function _ensureConsumer(channelType) {
  if (consumers.get(channelType)) return;

  consumers.set(channelType, true);
  _consumeLoop(channelType);
}

/**
 * 消费循环
 */
async function _consumeLoop(channelType) {
  const queue = queues.get(channelType);

  while (true) {
    // 等待消息
    while (queue && queue.length > 0) {
      const msg = queue.shift();
      try {
        await _processMessage(msg);
      } catch (e) {
        console.error(`[router] ${channelType} 处理消息失败:`, e.message);
      }
    }

    // 空闲等待
    await new Promise(r => setTimeout(r, 200));

    // 队列空 → 停止消费者
    if (!queue || queue.length === 0) {
      consumers.set(channelType, false);
      break;
    }
  }
}

/**
 * 处理单条消息
 */
async function _processMessage(msg) {
  // 1. 重新加载渠道配置（配置变更即时生效）
  const freshConfig = freshChannelEntity(msg.channelId);
  if (!freshConfig) {
    console.log(`[router] 渠道 ${msg.channelId} 不存在，丢弃消息`);
    return;
  }

  // 更新 ChannelManager 中的适配器配置
  const adapter = channelManager.get(msg.channelId);
  if (adapter) {
    adapter.refreshConfig(freshConfig);

    // 访问控制
    const botPrefix = freshConfig.bot_prefix || '';
    const access = adapter.shouldProcess(msg, botPrefix);
    if (!access.process) return; // 被过滤

    // 活跃时间
    adapter.touchActivity();
    adapter.recordMessage();
  }

  // 2. 更新健康监控
  try {
    const { monitor } = require('./health');
    monitor.recordMessage(msg.channelId || channelType);
  } catch {}

  // 3. 交给统一消息处理（保持兼容现有 index.js）
  try {
    const { handleIncoming } = require('./index');
    await handleIncoming(msg, freshConfig);
  } catch (e) {
    console.error(`[router] 消息处理失败:`, e.message);
    if (adapter) adapter.recordError(e);
  }
}

/**
 * 获取队列统计
 */
function stats() {
  const result = {};
  for (const [type, queue] of queues) {
    result[type] = {
      queueSize: queue.length,
      consumerRunning: consumers.get(type) || false,
    };
  }
  return result;
}

module.exports = { enqueue, freshChannelEntity, stats };
