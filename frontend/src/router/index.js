import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'

const routes = [
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
      { path: 'chat', name: 'RealtimeChat', component: () => import('../views/RealtimeChat.vue'), meta: { perm: 'chat' } },
      { path: 'digital-human', name: 'DigitalHuman', component: () => import('../views/DigitalHuman.vue'), meta: { perm: 'digital' } },
      { path: 'digital', name: 'DigitalManagement', component: () => import('../views/AgentManagement.vue'), meta: { perm: 'digital' } },
      { path: 'trending', name: 'TrendTracker', component: () => import('../views/TrendTracker.vue'), meta: { perm: 'trending' } },

      { path: 'knowledge-base', name: 'KnowledgeBase', component: () => import('../views/KnowledgeBase.vue'), meta: { perm: 'knowledge' } },
      { path: 'skill-library', name: 'SkillLibrary', component: () => import('../views/SkillLibrary.vue'), meta: { perm: 'skills' } },
      { path: 'internal', name: 'InternalMgmt', component: () => import('../views/InternalManagement.vue'), meta: { perm: 'crm' } },
      { path: 'internal/sales', name: 'SalesMgmt', component: () => import('../views/internal/SalesManagement.vue'), meta: { perm: 'publish' } },
      { path: 'internal/inventory', name: 'InventoryMgmt', component: () => import('../views/internal/InventoryManagement.vue'), meta: { perm: 'inventory' } },
      { path: 'internal/hr', name: 'HRMgmt', component: () => import('../views/internal/HRManagement.vue'), meta: { perm: 'hr' } },
      { path: 'internal/docs', name: 'DocMgmt', component: () => import('../views/internal/DocumentManagement.vue'), meta: { perm: 'docs' } },
      { path: 'internal/finance', name: 'FinanceMgmt', component: () => import('../views/internal/FinanceManagement.vue'), meta: { perm: 'crm' } },
      { path: 'support', name: 'FAQMgmt', component: () => import('../views/internal/FAQManagement.vue'), meta: { perm: 'knowledge' } },
      { path: 'tasks', name: 'Tasks', component: () => import('../views/Task.vue'), meta: { perm: 'chat' } },
      { path: 'services', name: 'ServiceManagement', component: () => import('../views/ServiceManagement.vue'), meta: { perm: 'security' } },
      { path: 'model-config', name: 'ModelConfig', component: () => import('../views/ModelConfig.vue'), meta: { perm: 'model' } },
      { path: 'channels', name: 'MessageChannels', component: () => import('../views/MessageChannels.vue'), meta: { perm: 'channels' } },
      { path: 'users', name: 'UserManagement', component: () => import('../views/UserManagement.vue'), meta: { perm: 'security_users' } },
      { path: 'security', name: 'SecuritySettings', component: () => import('../views/SecuritySettings.vue'), meta: { perm: 'security' } }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局导航守卫：检查登录状态 + 路由权限
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.public) {
    return next()
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
      if (role !== 'superadmin' && !perms.includes(to.meta.perm)) {
        return next({ path: '/chat' })
      }
    } catch {
      return next({ path: '/chat' })
    }
  }
  next()
})

export default router
