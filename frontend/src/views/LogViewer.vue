<template>
  <div class="page-container">
    <div class="page-title">日志查看</div>
    <el-timeline>
      <el-timeline-item
        v-for="(log, i) in logs"
        :key="i"
        :timestamp="log.time"
        :type="log.type"
      >
        {{ log.content }}
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup>
const logs = [
  { time: '2026-05-12 10:30:00', type: 'success', content: 'API 网关服务启动成功' },
  { time: '2026-05-12 10:29:55', type: 'primary', content: '正在初始化消息队列连接...' },
  { time: '2026-05-12 10:29:50', type: 'warning', content: '模型推理服务 CPU 使用率超过 80%' },
  { time: '2026-05-12 10:29:45', type: 'danger', content: '日志收集服务连接超时，正在重试...' },
  { time: '2026-05-12 10:29:40', type: 'info', content: '系统启动完成，版本 v0.14.0' }
]
</script>
