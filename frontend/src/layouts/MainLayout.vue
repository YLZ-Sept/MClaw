<template>
  <div class="main-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>MClaw V1.0</h2>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-group">
          <div class="nav-group-title">对话</div>
          <router-link to="/chat" class="nav-item" active-class="active">
            <el-icon><ChatDotSquare /></el-icon><span>实时聊天</span>
          </router-link>
          <router-link to="/digital" class="nav-item" active-class="active">
            <el-icon><DataAnalysis /></el-icon><span>数字人管理</span>
          </router-link>
          <router-link to="/tasks" class="nav-item" active-class="active">
            <el-icon><List /></el-icon><span>任务</span>
          </router-link>
          <router-link to="/files" class="nav-item" active-class="active">
            <el-icon><FolderOpened /></el-icon><span>文件</span>
          </router-link>
          <router-link to="/logs" class="nav-item" active-class="active">
            <el-icon><Document /></el-icon><span>日志查看</span>
          </router-link>
        </div>
        <div class="nav-group">
          <div class="nav-group-title">配置</div>
          <router-link to="/model-config" class="nav-item" active-class="active">
            <el-icon><Cpu /></el-icon><span>模型配置</span>
          </router-link>
          <router-link to="/services" class="nav-item" active-class="active">
            <el-icon><Setting /></el-icon><span>服务管理</span>
          </router-link>
          <router-link to="/channels" class="nav-item" active-class="active">
            <el-icon><ChatLineSquare /></el-icon><span>消息渠道</span>
          </router-link>
          <router-link to="/automation" class="nav-item" active-class="active">
            <el-icon><Promotion /></el-icon><span>通信与自动化</span>
          </router-link>
          <router-link to="/security" class="nav-item" active-class="active">
            <el-icon><Lock /></el-icon><span>安全设置</span>
          </router-link>
        </div>
      </nav>
      <div class="sidebar-footer">版本 v2026.5.7</div>
    </aside>

    <!-- 主内容 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>
