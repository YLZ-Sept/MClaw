<template>
  <div class="help-page">
    <div class="help-card">
      <h2>系统授权</h2>

      <!-- 已激活 -->
      <div v-if="status.activated" class="status-section">
        <el-descriptions border :column="2">
          <el-descriptions-item label="授权客户">{{ status.customer }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ tierLabel }}</el-descriptions-item>
          <el-descriptions-item label="到期日期">{{ status.expires }}</el-descriptions-item>
          <el-descriptions-item label="剩余天数">
            <span :class="status.daysLeft <= 30 ? 'text-warn' : 'text-ok'">
              {{ status.daysLeft > 0 ? status.daysLeft + ' 天' : '已过期' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item v-if="status.maxUsers" label="最大用户数">{{ status.maxUsers }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 未激活 -->
      <el-alert v-else title="系统尚未激活" type="warning" show-icon :closable="false"
        description="请复制下方机器指纹发送给商务获取授权码" />

      <!-- 到期提醒 -->
      <el-alert v-if="status.activated && status.expired" title="授权已过期"
        type="error" show-icon :closable="false" style="margin-top:16px"
        :description="'已过期 ' + Math.abs(status.daysLeft) + ' 天，系统功能受限。请联系商务续费'" />

      <!-- 机器指纹 -->
      <div class="fp-section">
        <label>机器指纹</label>
        <div class="fp-row">
          <code>{{ status.fingerprint }}</code>
          <el-button size="small" @click="copyFp">复制</el-button>
        </div>
      </div>

      <!-- 激活授权码（仅超管可见） -->
      <div v-if="isSuperadmin" class="activate-section">
        <el-divider />
        <label>输入授权码激活 / 续费</label>
        <el-input v-model="code" type="textarea" :rows="3" placeholder="粘贴商务发给您的授权码" />
        <el-button type="primary" :loading="activating" style="margin-top:12px" @click="handleActivate">
          激 活
        </el-button>
      </div>

      <el-divider />
      <div class="contact-info">
        <p>如需获取授权或续费，请联系</p>
        <p class="company">云南米贝科技有限公司</p>
        <p>电话：0871-XXXXXXXX</p>
        <p>邮箱：license@mibei.com</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../api'

const status = ref({ activated: false, fingerprint: '获取中...' })
const code = ref('')
const activating = ref(false)

const tierLabel = computed(() => {
  const t = status.value.tier
  return t === 'enterprise' ? '企业版' : t === 'pro' ? '专业版' : t === 'basic' ? '基础版' : t || '-'
})

const isSuperadmin = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    return user.role === 'superadmin'
  } catch { return false }
})

async function fetchStatus() {
  try {
    const res = await request.get('/license/status')
    if (res.data?.code === 200) status.value = res.data.data
  } catch {}
}

async function handleActivate() {
  if (!code.value.trim()) {
    ElMessage.warning('请输入授权码')
    return
  }
  activating.value = true
  try {
    const res = await request.post('/license/activate', { code: code.value.trim() })
    if (res.data?.code === 200) {
      ElMessageBox.alert(
        `授权成功！客户：${res.data.data.customer}，到期：${res.data.data.expires}`,
        '激活成功',
        { type: 'success', confirmButtonText: '确定' }
      )
      // 清除过期标记
      localStorage.removeItem('license_expired')
      code.value = ''
      await fetchStatus()
    } else {
      ElMessage.error(res.data?.message || '激活失败')
    }
  } catch {
    ElMessage.error('网络错误')
  } finally {
    activating.value = false
  }
}

async function copyFp() {
  try {
    await navigator.clipboard.writeText(status.value.fingerprint)
    ElMessage.success('机器指纹已复制')
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = status.value.fingerprint
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    ElMessage.success('机器指纹已复制')
  }
}

onMounted(fetchStatus)
</script>

<style scoped>
.help-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  padding: 24px;
}
.help-card {
  width: 100%;
  max-width: 600px;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.06);
}
.help-card h2 {
  margin: 0 0 24px;
  font-size: 22px;
  color: #303133;
}
.status-section {
  margin-bottom: 24px;
}
.fp-section {
  margin-top: 24px;
}
.fp-section label, .activate-section label {
  display: block;
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}
.fp-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.fp-row code {
  flex: 1;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 16px;
  font-family: monospace;
  user-select: all;
  letter-spacing: 1px;
}
.text-ok { color: #67c23a; font-weight: 600; }
.text-warn { color: #e6a23c; font-weight: 600; }
.contact-info {
  text-align: center;
  color: #909399;
  font-size: 14px;
  line-height: 1.8;
}
.contact-info .company {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
</style>
