<template>
  <div class="about-body">
    <!-- Hero 品牌区 -->
    <div class="hero-card">
      <div class="hero-logo">MC</div>
      <div class="hero-info">
        <h3>MClaw v{{ version }}</h3>
        <p>企业智能体管理平台 · 云南米贝科技</p>
        <p class="hero-desc">基于多模型 AI 驱动的企业智能体操作系统，集成 CRM、进销存、人事、知识库、内容生产与全渠道消息触达。</p>
      </div>
    </div>

    <!-- 系统信息 + 联系 -->
    <div class="info-grid">
      <div class="info-card" v-for="item in infoItems" :key="item.label">
        <span class="info-label">{{ item.label }}</span>
        <span class="info-value">{{ item.value }}</span>
      </div>
    </div>

    <!-- 联系方式 -->
    <div class="contact-row">
      <div class="contact-card">
        <div class="contact-icon" style="--c:#7c3aed"><el-icon :size="22"><Phone /></el-icon></div>
        <div class="contact-text">
          <div class="contact-label">联系电话</div>
          <div class="contact-value">0871-63820616</div>
          <div class="contact-hint">工作日 9:00 - 18:00</div>
        </div>
      </div>
      <div class="contact-card">
        <div class="contact-icon" style="--c:#07c160"><el-icon :size="22"><ChatDotSquare /></el-icon></div>
        <div class="contact-text">
          <div class="contact-label">在线客服</div>
          <div class="contact-value">企业微信</div>
          <a href="https://work.weixin.qq.com/kfid/kfc6ea1e452c2944b7f" target="_blank" class="contact-link">联系在线客服 →</a>
        </div>
      </div>
      <div class="contact-card contact-card-qr">
        <img src="/kefu-qrcode.png" alt="客服二维码" class="qr-img" />
        <span class="qr-hint">扫码咨询</span>
      </div>
    </div>

    <!-- 技术栈 -->
    <div class="section-card">
      <h3 class="section-title">技术栈</h3>
      <div class="tech-chips">
        <span class="tech-chip" v-for="t in techStack" :key="t">{{ t }}</span>
      </div>
    </div>

    <!-- 许可证 -->
    <div class="section-card">
      <h3 class="section-title">系统授权</h3>

      <!-- 机器指纹 -->
      <div class="license-fp">
        <span class="license-fp-label">机器指纹</span>
        <div class="license-fp-row">
          <code>{{ licenseFP }}</code>
          <el-button size="small" text @click="copyFP">复制</el-button>
        </div>
      </div>

      <!-- 未激活 -->
      <el-alert v-if="!licenseInfo.activated" title="系统尚未激活，请粘贴授权码完成激活" type="warning" show-icon :closable="false"
        style="margin-top:12px" />

      <!-- 已激活 -->
      <div v-if="licenseInfo.activated" class="license-detail">
        <div class="license-row">
          <span class="license-lbl">授权客户</span>
          <span class="license-val">{{ licenseInfo.customer || '-' }}</span>
        </div>
        <div class="license-row">
          <span class="license-lbl">到期日期</span>
          <span class="license-val">{{ licenseInfo.expires || '-' }}</span>
        </div>
        <div class="license-row">
          <span class="license-lbl">剩余天数</span>
          <span class="license-val" :class="licenseInfo.daysLeft <= 30 ? 'val-warn' : 'val-ok'">
            {{ licenseInfo.daysLeft > 0 ? licenseInfo.daysLeft + ' 天' : '已过期' }}
          </span>
        </div>
      </div>

      <!-- 过期提醒 -->
      <el-alert v-if="licenseInfo.expired" title="授权已过期，系统功能受限" type="error" show-icon :closable="false"
        style="margin-top:12px" />

      <!-- 激活/续费（超管可见） -->
      <div v-if="isSuperadmin" class="license-activate">
        <el-input v-model="licenseCode" type="textarea" :rows="2" size="small"
          placeholder="粘贴授权码" style="margin-top:10px" />
        <el-button type="primary" size="small" :loading="licenseActivating"
          style="margin-top:8px" @click="handleActivate">
          激 活
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Phone, ChatDotSquare } from '@element-plus/icons-vue'
import request from '../../api/index.js'

const version = ref('V1.0')
const licenseInfo = ref({ activated: false })
const licenseFP = ref('获取中...')
const licenseCode = ref('')
const licenseActivating = ref(false)
const isSuperadmin = ref(false)

const techStack = ['Vue 3', 'Element Plus', 'ECharts', 'Node.js Express', 'SQLite (better-sqlite3)',
  'OpenClaw Gateway', 'Playwright', 'Tesseract OCR', 'FFmpeg', 'Python']

const infoItems = ref([])

async function fetchLicense() {
  try {
    const { data: r1 } = await request.get('/license/status').catch(() => ({ data: { data: {} } }))
    if (r1.data) {
      licenseInfo.value = r1.data
      licenseFP.value = r1.data.fingerprint || '获取失败'
    }
  } catch {}
}

async function copyFP() {
  try {
    await navigator.clipboard.writeText(licenseFP.value)
    ElMessage.success('已复制机器指纹')
  } catch {
    ElMessage.success(licenseFP.value)
  }
}

async function handleActivate() {
  if (!licenseCode.value.trim()) { ElMessage.warning('请输入授权码'); return }
  licenseActivating.value = true
  try {
    const { data } = await request.post('/license/activate', { code: licenseCode.value.trim() })
    if (data.code === 200) {
      ElMessage.success('授权成功')
      licenseCode.value = ''
      localStorage.removeItem('license_expired')
      await fetchLicense()
    } else {
      ElMessage.error(data.message || '激活失败')
    }
  } catch { ElMessage.error('网络错误') }
  finally { licenseActivating.value = false }
}

onMounted(async () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    isSuperadmin.value = user.role === 'superadmin'
  } catch {}

  // 系统信息 + 授权 + 服务状态 并行加载
  const [{ data: r1 }, { data: r2 }] = await Promise.all([
    request.get('/info').catch(() => ({ data: { data: {} } })),
    request.get('/status').catch(() => ({ data: { data: {} } })),
    fetchLicense()
  ])
  const info = r1.data || {}
  const status = r2.data || {}
  version.value = info.version || '0.14.0'
  infoItems.value = [
    { label: '版本', value: info.version || 'V1.0' },
    { label: 'Node.js', value: info.nodeVersion || '-' },
    { label: '平台', value: info.platform || '-' },
    { label: '运行时间', value: info.uptime || '-' },
    { label: '数据库', value: 'SQLite (WAL)' },
    { label: '服务数', value: (status.services || []).length + ' 个' },
  ]
})
</script>

<style scoped>
.about-body { max-width: 780px; }

/* Hero */
.hero-card {
  display: flex; align-items: flex-start; gap: 20px;
  padding: 28px; margin-bottom: 20px;
  background: linear-gradient(135deg, #f5f3ff 0%, #fff 60%);
  border: 1px solid #f0ecfc; border-radius: 16px;
}
.hero-logo {
  width: 64px; height: 64px; flex-shrink: 0;
  border-radius: 16px; background: linear-gradient(135deg, #7c3aed, #a78bfa);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px;
}
.hero-info h3 { font-size: 22px; font-weight: 700; color: #4a3f5e; margin: 0 0 4px; }
.hero-info p { font-size: 13px; color: #7c3aed; font-weight: 500; margin: 0; }
.hero-desc { font-size: 13px; color: #94a3b8 !important; font-weight: 400 !important; margin-top: 6px !important; line-height: 1.6; }

/* System info */
.info-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;
}
.info-card {
  background: #fff; border: 1px solid #f0ecfc; border-radius: 12px;
  padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;
}
.info-label { font-size: 12px; color: #94a3b8; }
.info-value { font-size: 14px; font-weight: 600; color: #4a3f5e; font-family: 'SF Mono', Consolas, monospace; }

/* Contact */
.contact-row { display: flex; gap: 12px; margin-bottom: 20px; }
.contact-card {
  flex: 1; background: #fff; border: 1px solid #f0ecfc; border-radius: 12px;
  padding: 16px 18px; display: flex; align-items: center; gap: 14px;
}
.contact-card-qr { flex: 0 0 auto; flex-direction: column; gap: 6px; padding: 14px 20px; }
.contact-icon {
  width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px;
  background: color-mix(in srgb, var(--c) 12%, transparent);
  display: flex; align-items: center; justify-content: center; color: var(--c);
}
.contact-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.contact-value { font-size: 15px; font-weight: 600; color: #4a3f5e; margin-top: 2px; }
.contact-hint { font-size: 11px; color: #b8aad0; margin-top: 2px; }
.contact-link { font-size: 12px; color: #7c3aed; text-decoration: none; font-weight: 500; margin-top: 4px; display: inline-block; }
.contact-link:hover { text-decoration: underline; }
.qr-img { width: 64px; height: 64px; border-radius: 8px; border: 1px solid #f0ecf8; }
.qr-hint { font-size: 11px; color: #94a3b8; }

/* Tech stack */
.section-card { background: #fff; border: 1px solid #f0ecfc; border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.section-title { font-size: 15px; font-weight: 600; color: #4a3f5e; margin: 0 0 14px; }
.tech-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tech-chip {
  padding: 5px 14px; background: #f5f3ff; border-radius: 8px;
  font-size: 12px; color: #7c3aed; font-weight: 500;
}

/* License */
.license-fp { margin-bottom: 8px; }
.license-fp-label { font-size: 12px; color: #94a3b8; margin-bottom: 4px; display: block; }
.license-fp-row { display: flex; align-items: center; gap: 8px; }
.license-fp-row code {
  font-size: 11px; color: #6b7280; font-family: 'SF Mono', Consolas, monospace;
  background: #f8f9fc; padding: 6px 10px; border-radius: 6px; word-break: break-all; flex: 1;
}
.license-detail { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.license-row { display: flex; justify-content: space-between; padding: 8px 12px; background: #f8f9fc; border-radius: 8px; }
.license-lbl { font-size: 13px; color: #94a3b8; }
.license-val { font-size: 14px; font-weight: 600; color: #4a3f5e; }
.val-ok { color: #10b981; }
.val-warn { color: #f59e0b; }
.license-activate { margin-top: 8px; }

@media (max-width: 640px) {
  .info-grid { grid-template-columns: repeat(2, 1fr); }
  .contact-row { flex-direction: column; }
}
</style>
