// 共享的聊天历史记录（内存存储，按 agent 分组）
const chatHistories = {};

function getHistory(agent) {
  const key = agent || 'default';
  if (!chatHistories[key]) chatHistories[key] = [];
  return chatHistories[key];
}

function addToHistory(agent, role, content) {
  const history = getHistory(agent);
  history.push({ role, content });
  return history;
}

function clearHistory(agent) {
  const key = agent || 'default';
  delete chatHistories[key];
}

module.exports = { getHistory, addToHistory, clearHistory, chatHistories };
