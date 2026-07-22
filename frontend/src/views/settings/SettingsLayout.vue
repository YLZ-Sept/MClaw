<template>
  <div class="settings-shell">
    <div class="settings-side">
      <div class="settings-side-title">设置</div>
      <nav class="settings-nav">
        <router-link v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item" active-class="nav-active">
          <span class="nav-icon" v-html="item.icon"></span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>
    </div>
    <div class="settings-body">
      <router-view />
    </div>
  </div>
</template>

<script setup>
const navItems = [
  { path: '/settings/system', label: '系统', icon: '⚙️' },
  { path: '/settings/models', label: '模型', icon: '🧠' },
  { path: '/settings/tokens', label: '用量', icon: '📊' },
  { path: '/settings/users', label: '用户', icon: '👥' },
  { path: '/settings/security', label: '安全', icon: '🔒' },
  { path: '/settings/services', label: '服务', icon: '🔌' },
  { path: '/settings/about', label: '关于', icon: 'ℹ️' },
]
</script>

<style scoped>
.settings-shell { display: flex; height: 100%; background: #fafafe; }
.settings-side {
  width: 200px; flex-shrink: 0; padding: 24px 16px;
  border-right: 1px solid #f0ecfc; display: flex; flex-direction: column; gap: 16px;
}
.settings-side-title { font-size: 11px; font-weight: 700; color: #b8aad0; text-transform: uppercase; letter-spacing: 0.1em; padding: 0 8px; }
.settings-nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-radius: 10px; font-size: 14px; font-weight: 500; color: #5b4a7a;
  text-decoration: none; transition: all 0.15s;
}
.nav-item:hover { background: #f5f3ff; color: #7c3aed; }
.nav-active { background: #ede9fe; color: #7c3aed; font-weight: 600; }
.nav-icon { font-size: 16px; width: 20px; text-align: center; }
.settings-body { flex: 1; overflow-y: auto; padding: 28px 32px; min-width: 0; }
</style>
