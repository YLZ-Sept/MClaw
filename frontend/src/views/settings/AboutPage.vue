<template>
  <div>
    <div class="page-hd"><h2 class="page-title">关于 MClaw</h2><p class="page-desc">企业智能体管理平台</p></div>

    <div class="hero-card">
      <div class="hero-logo">🦞</div>
      <div class="hero-info">
        <h3>MClaw v{{ version }}</h3>
        <p>云南米贝科技 · 企业级 AI Agent 管理平台</p>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card" v-for="item in infoItems" :key="item.label">
        <span class="info-label">{{ item.label }}</span>
        <span class="info-value">{{ item.value }}</span>
      </div>
    </div>

    <div class="section-card">
      <h3>技术栈</h3>
      <div class="tech-chips">
        <span class="tech-chip" v-for="t in techStack" :key="t">{{ t }}</span>
      </div>
    </div>

    <div class="section-card">
      <h3>许可证</h3>
      <p class="license-text" v-if="licenseInfo">授权至 {{ licenseInfo.expireDate || '-' }} · {{ licenseInfo.status || '未知' }}</p>
      <p class="license-text" v-else>未激活或加载失败</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../../api/index.js'

const version = ref('0.14.0')
const licenseInfo = ref(null)

const techStack = ['Vue 3', 'Element Plus', 'ECharts', 'Node.js Express', 'SQLite (better-sqlite3)', 'OpenClaw Gateway', 'Playwright', 'Tesseract OCR', 'FFmpeg', 'Python']

const infoItems = ref([])

onMounted(async () => {
  try {
    const { data: r1 } = await request.get('/info').catch(() => ({ data: { data: {} } }))
    const i = r1.data || {}
    version.value = i.version || '0.14.0'
    infoItems.value = [
      { label: '版本', value: i.version || '0.14.0' },
      { label: 'Node.js', value: i.nodeVersion || '-' },
      { label: '平台', value: i.platform || '-' },
      { label: '运行时间', value: i.uptime || '-' },
    ]
    try {
      const { data: r2 } = await request.get('/license/status').catch(() => ({ data: { data: null } }))
      if (r2.data) licenseInfo.value = r2.data
    } catch {}
  } catch {}
})
</script>

<style scoped>
.page-hd { margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; color: #4a3f5e; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #94a3b8; margin: 0; }
.hero-card { display: flex; align-items: center; gap: 18px; padding: 24px; background: linear-gradient(135deg,#f5f3ff,#fff); border: 1px solid #f0ecfc; border-radius: 16px; margin-bottom: 18px; }
.hero-logo { font-size: 48px; }
.hero-info h3 { font-size: 20px; font-weight: 700; color: #4a3f5e; margin: 0 0 4px; }
.hero-info p { font-size: 13px; color: #94a3b8; margin: 0; }
.info-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; margin-bottom: 18px; }
.info-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 12px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
.info-label { font-size: 13px; color: #94a3b8; }
.info-value { font-size: 14px; font-weight: 600; color: #4a3f5e; font-family: 'SF Mono','Cascadia Code',monospace; }
.section-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
.section-card h3 { font-size: 16px; font-weight: 600; color: #4a3f5e; margin: 0 0 12px; }
.tech-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tech-chip { padding: 4px 12px; background: #f5f3ff; border-radius: 8px; font-size: 12px; color: #7c3aed; font-weight: 500; }
.license-text { font-size: 13px; color: #4a3f5e; margin: 0; }
</style>
