import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'

const routes = [
  {
    path: '/',
    component: MainLayout,
    redirect: '/chat',
    children: [
      { path: 'chat', name: 'RealtimeChat', component: () => import('../views/RealtimeChat.vue') },
      { path: 'digital', name: 'DigitalManagement', component: () => import('../views/AgentManagement.vue') },
      { path: 'internal', name: 'InternalMgmt', component: () => import('../views/InternalManagement.vue') },
      { path: 'internal/crm', name: 'CRMMgmt', component: () => import('../views/internal/CRMManagement.vue') },
      { path: 'internal/inventory', name: 'InventoryMgmt', component: () => import('../views/internal/InventoryManagement.vue') },
      { path: 'internal/hr', name: 'HRMgmt', component: () => import('../views/internal/HRManagement.vue') },
      { path: 'internal/docs', name: 'DocMgmt', component: () => import('../views/internal/DocumentManagement.vue') },
      { path: 'tasks', name: 'Tasks', component: () => import('../views/Task.vue') },
      { path: 'files', name: 'Files', component: () => import('../views/File.vue') },
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

export default router
