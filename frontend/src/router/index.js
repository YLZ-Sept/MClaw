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
      { path: 'chat', name: 'RealtimeChat', component: () => import('../views/RealtimeChat.vue') },
      { path: 'digital-human', name: 'DigitalHuman', component: () => import('../views/DigitalHuman.vue') },
      { path: 'digital', name: 'DigitalManagement', component: () => import('../views/AgentManagement.vue') },
      { path: 'trending', name: 'TrendTracker', component: () => import('../views/TrendTracker.vue') },
      { path: 'security-protection', name: 'SecurityProtection', component: () => import('../views/SecurityProtection.vue') },
      { path: 'knowledge-base', name: 'KnowledgeBase', component: () => import('../views/KnowledgeBase.vue') },
      { path: 'internal', name: 'InternalMgmt', component: () => import('../views/InternalManagement.vue') },
      { path: 'internal/crm', name: 'CRMMgmt', component: () => import('../views/internal/CRMManagement.vue') },
      { path: 'internal/sales', name: 'SalesMgmt', component: () => import('../views/internal/SalesManagement.vue') },
      { path: 'internal/inventory', name: 'InventoryMgmt', component: () => import('../views/internal/InventoryManagement.vue') },
      { path: 'internal/hr', name: 'HRMgmt', component: () => import('../views/internal/HRManagement.vue') },
      { path: 'internal/docs', name: 'DocMgmt', component: () => import('../views/internal/DocumentManagement.vue') },
      { path: 'support', name: 'FAQMgmt', component: () => import('../views/internal/FAQManagement.vue') },
      { path: 'tasks', name: 'Tasks', component: () => import('../views/Task.vue') },
      { path: 'services', name: 'ServiceManagement', component: () => import('../views/ServiceManagement.vue') },
      { path: 'logs', name: 'LogViewer', component: () => import('../views/LogViewer.vue') },
      { path: 'model-config', name: 'ModelConfig', component: () => import('../views/ModelConfig.vue') },
      { path: 'channels', name: 'MessageChannels', component: () => import('../views/MessageChannels.vue') },
      { path: 'automation', name: 'CommunicationAutomation', component: () => import('../views/CommunicationAutomation.vue') },
      { path: 'security', name: 'SecuritySettings', component: () => import('../views/SecuritySettings.vue') }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局导航守卫：未登录跳转到登录页
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.public) {
    next()
  } else if (!token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
