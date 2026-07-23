import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'

const routes = [
  {
    path: '/help',
    name: 'Help',
    component: () => import('../views/Help.vue'),
    meta: { public: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/chat',
    children: [
      { path: '', name: 'Dashboard', component: () => import('../views/Dashboard.vue'), meta: { perm: 'chat' } },
      { path: 'chat', name: 'RealtimeChat', component: () => import('../views/RealtimeChat.vue'), meta: { perm: 'chat' } },
      { path: 'digital-human', name: 'DigitalHuman', component: () => import('../views/DigitalHuman.vue'), meta: { perm: 'digital' } },
      { path: 'digital', name: 'DigitalManagement', component: () => import('../views/AgentManagement.vue'), meta: { perm: 'digital' } },
      { path: 'expert-hub', name: 'ExpertHub', component: () => import('../views/ExpertHub.vue'), meta: { perm: 'digital' } },
      { path: 'trending', name: 'TrendTracker', component: () => import('../views/TrendTracker.vue'), meta: { perm: 'trending' } },

      { path: 'knowledge-base', name: 'KnowledgeBase', component: () => import('../views/wiki/WikiHub.vue'), meta: { perm: 'knowledge' } },
      { path: 'wiki', redirect: '/knowledge-base' },
      { path: 'skill-library', name: 'SkillLibrary', component: () => import('../views/SkillLibrary.vue'), meta: { perm: 'skills' } },
      { path: 'internal', name: 'InternalMgmt', component: () => import('../views/InternalManagement.vue'), meta: { perm: 'crm' } },
      { path: 'internal/sales', name: 'SalesMgmt', component: () => import('../views/internal/SalesManagement.vue'), meta: { perm: 'publish' } },
      { path: 'internal/inventory', name: 'InventoryMgmt', component: () => import('../views/internal/InventoryManagement.vue'), meta: { perm: 'inventory' } },
      { path: 'internal/hr', name: 'HRMgmt', component: () => import('../views/internal/HRManagement.vue'), meta: { perm: 'hr' } },
      { path: 'internal/docs', name: 'DocMgmt', component: () => import('../views/internal/DocumentManagement.vue'), meta: { perm: 'docs' } },
      { path: 'internal/finance', name: 'FinanceMgmt', component: () => import('../views/internal/FinanceManagement.vue'), meta: { perm: 'crm' } },
      { path: 'support', name: 'FAQMgmt', component: () => import('../views/internal/FAQManagement.vue'), meta: { perm: 'knowledge' } },
      // 旧路径重定向到设置中心
      { path: 'tasks', redirect: '/settings/tasks' },
      { path: 'model-config', redirect: '/settings/models' },
      { path: 'services', redirect: '/settings/services' },
      { path: 'users', redirect: '/settings/users' },
      { path: 'security', redirect: '/settings/security' },
      { path: 'channels', name: 'MessageChannels', component: () => import('../views/MessageChannels.vue'), meta: { perm: 'channels' } },
      { path: 'memory', name: 'MemoryManagement', component: () => import('../views/MemoryManagement.vue'), meta: { perm: 'system' } },
      // 设置中心（嵌套布局，不加父级 perm，各子路由独立检查）
      {
        path: 'settings',
        component: () => import('../views/settings/SettingsLayout.vue'),
        children: [
          { path: '', redirect: '/settings/system' },
          { path: 'system', name: 'SystemSettings', component: () => import('../views/settings/SystemSettings.vue'), meta: { perm: 'chat' } },
          { path: 'models', name: 'SettingsModels', component: () => import('../views/ModelConfig.vue'), meta: { perm: 'model' } },
          { path: 'tokens', name: 'TokenUsage', component: () => import('../views/settings/TokenUsage.vue'), meta: { perm: 'model' } },
          { path: 'users', name: 'SettingsUsers', component: () => import('../views/UserManagement.vue'), meta: { perm: 'security_users' } },
          { path: 'security', name: 'SettingsSecurity', component: () => import('../views/SecuritySettings.vue'), meta: { perm: 'security' } },
          { path: 'services', name: 'SettingsServices', component: () => import('../views/ServiceManagement.vue'), meta: { perm: 'security' } },
          { path: 'tasks', name: 'SettingsTasks', component: () => import('../views/scheduler/SchedulerView.vue'), meta: { perm: 'tasks' } },
          { path: 'about', name: 'SettingsAbout', component: () => import('../views/settings/AboutPage.vue'), meta: { perm: 'chat' } },
        ]
      },
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 找用户有权限访问的第一个路由
function hasRoutePerm(perms, permMeta) {
  if (!permMeta) return true
  if (Array.isArray(permMeta)) return permMeta.some(p => perms.includes(p))
  return perms.includes(permMeta)
}

function findFirstPermitted(perms) {
  const children = routes.find(r => r.path === '/')?.children || []
  for (const r of children) {
    if (hasRoutePerm(perms, r.meta?.perm)) {
      return r.path
    }
  }
  return null
}

// 全局导航守卫：检查登录状态 + 授权过期 + 路由权限
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.public) {
    return next()
  }
  // 授权过期 → 只能去帮助页
  if (localStorage.getItem('license_expired') === 'true' && to.path !== '/help') {
    return next('/help')
  }
  if (!token) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }
  // 权限检查
  if (to.meta.perm) {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      const role = user.role || ''
      const perms = user.permissions || []
      if (role !== 'superadmin' && !hasRoutePerm(perms, to.meta.perm)) {
        const fallback = findFirstPermitted(perms)
        return next(fallback ? { path: '/' + fallback } : { path: '/login' })
      }
    } catch {
      return next({ path: '/login' })
    }
  }
  next()
})

export default router
