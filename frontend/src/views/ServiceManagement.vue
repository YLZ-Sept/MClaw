<template>
  <div class="page-container">
    <div class="page-title">服务管理</div>
    <el-table :data="services" stripe style="width: 100%" border>
      <el-table-column prop="name" label="服务名称" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '运行中' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="port" label="端口" width="100" />
      <el-table-column prop="uptime" label="运行时间" width="160" />
      <el-table-column label="操作" width="160">
        <el-button size="small" type="primary" link>重启</el-button>
        <el-button size="small" type="warning" link>停止</el-button>
        <el-button size="small" type="info" link>日志</el-button>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
const services = [
  { name: 'API 网关服务', status: '运行中', port: 3666, uptime: '72h 15m' },
  { name: '消息队列服务', status: '运行中', port: 5672, uptime: '72h 15m' },
  { name: '模型推理服务', status: '运行中', port: 8080, uptime: '48h 30m' },
  { name: '日志收集服务', status: '已停止', port: 9200, uptime: '-' }
]
</script>
