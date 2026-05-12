<template>
  <div class="page-container">
    <div class="page-title">数字人管理</div>

    <div class="agent-grid">
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="agent-card"
        @click="chatWith(agent)"
      >
        <div class="agent-header">
          <div class="agent-icon" :style="{ background: agent.color }">
            <el-icon :size="28"><component :is="agent.icon" /></el-icon>
          </div>
          <el-tag size="small" :type="agent.status === '在线' ? 'success' : 'info'" effect="plain">
            {{ agent.status }}
          </el-tag>
        </div>
        <div class="agent-name">{{ agent.name }}</div>
        <div class="agent-desc">{{ agent.desc }}</div>
        <div class="agent-meta">
          <span class="agent-id">ID: {{ agent.id }}</span>
        </div>
        <div class="agent-action">
          <el-button type="primary" size="small" round @click.stop="chatWith(agent)">
            开始对话
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import {
  Avatar, Coin, Headset, Lock
} from '@element-plus/icons-vue'

const router = useRouter()

const agents = [
  {
    id: 'sales-agent',
    name: '销售管理 Agent',
    desc: '管理销售流程、客户跟进、合同签署和业绩统计',
    icon: Coin,
    color: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
    status: '在线'
  },
  {
    id: 'internal-agent',
    name: '内部管理 Agent',
    desc: '处理内部审批、日程安排、文档管理和协作任务',
    icon: Avatar,
    color: 'linear-gradient(135deg, #818cf8, #4f46e5)',
    status: '在线'
  },
  {
    id: 'support-agent',
    name: '售后管理 Agent',
    desc: '处理售后咨询、工单跟进、FAQ 解答和客户反馈',
    icon: Headset,
    color: 'linear-gradient(135deg, #34d399, #10b981)',
    status: '在线'
  },
  {
    id: 'security-agent',
    name: '安全防护 Agent',
    desc: '监控安全威胁、漏洞扫描、入侵检测和日志审计',
    icon: Lock,
    color: 'linear-gradient(135deg, #fb7185, #ef4444)',
    status: '在线'
  }
]

function chatWith(agent) {
  router.push({ path: '/chat', query: { agent: agent.id, agentName: agent.name } })
}
</script>

<style scoped>
.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.agent-card {
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.25s;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 4px rgba(139, 92, 246, 0.04);
}

.agent-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.1);
  border-color: #c4b5fd;
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.agent-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.agent-name {
  font-size: 17px;
  font-weight: 600;
  color: #4a3f5e;
  margin-bottom: 8px;
}

.agent-desc {
  font-size: 13px;
  color: #b8aad0;
  line-height: 1.5;
  margin-bottom: 12px;
  flex: 1;
}

.agent-meta {
  margin-bottom: 16px;
}

.agent-id {
  font-size: 11px;
  color: #d0c8e0;
  font-family: monospace;
}

.agent-action {
  text-align: center;
}
</style>
