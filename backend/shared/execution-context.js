// 工具执行上下文 — 供 executor 获取当前 Agent 信息
let currentAgentId = null;

function setExecutionContext(agentId) {
  currentAgentId = agentId;
}

function getExecutionContext() {
  return { agentId: currentAgentId };
}

module.exports = { setExecutionContext, getExecutionContext };
