<template>
  <div class="sec-page">
    <div class="sp-hd">
      <span class="sp-title">安全防护</span>
      <span class="sp-sub">系统安全监控与威胁防护</span>
    </div>
    <div class="sp-body">
      <div class="kpi-row">
        <div class="kpi" style="--c:#10b981"><div class="kpi-val">{{ stats.safe }}</div><div class="kpi-label">安全天数</div></div>
        <div class="kpi" style="--c:#f59e0b"><div class="kpi-val">{{ stats.alerts }}</div><div class="kpi-label">活跃告警</div></div>
        <div class="kpi" style="--c:#e53e3e"><div class="kpi-val">{{ stats.blocked }}</div><div class="kpi-label">拦截攻击</div></div>
        <div class="kpi" style="--c:#3b82f6"><div class="kpi-val">{{ stats.logins }}</div><div class="kpi-label">今日登录</div></div>
      </div>

      <div class="sp-grid">
        <div class="sp-card">
          <div class="spc-hd">系统安全状态</div>
          <div class="spc-body">
            <div class="check-list">
              <div v-for="c in checks" :key="c.key" class="check-item">
                <span>{{ c.label }}</span>
                <el-tag :type="c.ok ? 'success' : 'danger'" size="small">{{ c.ok ? '正常' : '异常' }}</el-tag>
              </div>
            </div>
          </div>
        </div>

        <div class="sp-card">
          <div class="spc-hd">最近登录记录</div>
          <div class="spc-body">
            <div class="login-list">
              <div v-for="(l, i) in loginLogs" :key="i" class="login-item">
                <span class="li-user">{{ l.user }}</span>
                <span class="li-ip">{{ l.ip }}</span>
                <span class="li-time">{{ l.time }}</span>
                <el-tag :type="l.status==='成功'?'success':'danger'" size="small">{{ l.status }}</el-tag>
              </div>
              <div v-if="loginLogs.length===0" class="empty-hint">暂无登录记录</div>
            </div>
          </div>
        </div>
      </div>

      <div class="sp-card" style="margin-top:14px">
        <div class="spc-hd">安全操作</div>
        <div class="spc-body">
          <div class="action-row">
            <el-button type="primary" @click="doAction('scan')">漏洞扫描</el-button>
            <el-button type="warning" @click="doAction('audit')">日志审计</el-button>
            <el-button type="danger" @click="doAction('lockdown')">一键封禁异常IP</el-button>
            <el-button @click="loadLogs">刷新数据</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const stats = ref({ safe: 0, alerts: 0, blocked: 0, logins: 0 })
const checks = ref([
  { key: 'port', label: '端口扫描检测', ok: true },
  { key: 'injection', label: 'SQL注入防护', ok: true },
  { key: 'xss', label: 'XSS跨站防护', ok: true },
  { key: 'csrf', label: 'CSRF令牌验证', ok: true },
  { key: 'rate', label: '接口限流', ok: true },
  { key: 'auth', label: '认证异常检测', ok: true },
])
const loginLogs = ref([])

function loadLogs() {
  stats.value = {
    safe: Math.floor(Math.random() * 30) + 60,
    alerts: Math.floor(Math.random() * 5),
    blocked: Math.floor(Math.random() * 200) + 50,
    logins: Math.floor(Math.random() * 20) + 5
  }

  const users = ['管理员', '运营', '销售主管', '技术员']
  const ips = ['192.168.1.100', '10.0.0.12', '172.16.5.88', '192.168.1.101']
  loginLogs.value = Array.from({ length: 6 }, (_, i) => ({
    user: users[i % users.length],
    ip: ips[i % ips.length],
    time: new Date(Date.now() - i * 3600000).toLocaleString('zh-CN'),
    status: i === 4 ? '失败' : '成功'
  }))
}

function doAction(type) {
  const map = {
    scan: '漏洞扫描已启动',
    audit: '日志审计已开始',
    lockdown: '异常IP已全部封禁'
  }
  ElMessage.success(map[type] || '操作完成')
}

onMounted(loadLogs)
</script>

<style scoped>
.sec-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.sp-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.sp-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.sp-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.sp-body { flex: 1; padding: 16px 24px; overflow-y: auto; }
.kpi-row { display: flex; gap: 14px; margin-bottom: 16px; }
.kpi { flex: 1; padding: 16px; background: #fff; border-radius: 10px; border: 1px solid #f0ecfc; text-align: center; }
.kpi-val { font-size: 28px; font-weight: 700; color: var(--c); }
.kpi-label { font-size: 12px; color: #b8aad0; margin-top: 4px; }
.sp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.sp-card { background: #fff; border-radius: 10px; border: 1px solid #f0ecfc; }
.spc-hd { padding: 14px 16px; font-size: 14px; font-weight: 600; color: #4a3f5e; border-bottom: 1px solid #f0ecfc; }
.spc-body { padding: 14px 16px; }
.check-list { display: flex; flex-direction: column; gap: 10px; }
.check-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #4a3f5e; }
.login-list { display: flex; flex-direction: column; gap: 8px; }
.login-item { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.li-user { font-weight: 500; color: #4a3f5e; width: 60px; }
.li-ip { color: #6b5f80; font-family: monospace; }
.li-time { color: #b8aad0; margin-left: auto; }
.empty-hint { text-align: center; color: #b8aad0; font-size: 13px; padding: 12px; }
.action-row { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
