<template>
  <div class="page-container">
    <div class="page-title">内部管理</div>
    <p style="color: #b8aad0; margin-bottom: 24px;">选择管理模块进入</p>

    <div class="module-grid">
      <div v-for="m in modules" :key="m.path" class="module-card" @click="router.push(m.path)">
        <div class="module-icon" :style="{ background: m.color }">
          <el-icon :size="28"><component :is="m.icon" /></el-icon>
        </div>
        <div class="module-name">{{ m.name }}</div>
        <div class="module-desc">{{ m.desc }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { TrendCharts, Box, UserFilled, FolderOpened } from '@element-plus/icons-vue'

const router = useRouter()

const modules = [
  { path: '/internal/crm', name: '客户关系管理', desc: '客户档案、联系人、线索、营销、报价、合同、工单、反馈', icon: TrendCharts, color: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
  { path: '/internal/inventory', name: '进销存管理', desc: '产品、供应商、采购订单、仓库管理', icon: Box, color: 'linear-gradient(135deg, #818cf8, #4f46e5)' },
  { path: '/internal/hr', name: '人力资源管理', desc: '员工档案、组织架构、招聘、请假考勤', icon: UserFilled, color: 'linear-gradient(135deg, #34d399, #10b981)' },
  { path: '/internal/docs', name: '文档管理', desc: '文档上传、搜索、分类管理', icon: FolderOpened, color: 'linear-gradient(135deg, #fb7185, #ef4444)' }
]
</script>

<style scoped>
.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
.module-card {
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  padding: 28px 24px;
  cursor: pointer;
  transition: all 0.25s;
  box-shadow: 0 1px 4px rgba(139,92,246,0.04);
}
.module-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(139,92,246,0.1);
  border-color: #c4b5fd;
}
.module-icon {
  width: 52px; height: 52px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; margin-bottom: 16px;
}
.module-name { font-size: 17px; font-weight: 600; color: #4a3f5e; margin-bottom: 8px; }
.module-desc { font-size: 13px; color: #b8aad0; line-height: 1.5; }
.page-container { padding: 24px; background: #fff; height: 100%; overflow-y: auto; }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e; margin-bottom: 4px; }
</style>
