<template>
  <el-table v-if="data.length" :data="data" stripe border row-key="id" size="small">
    <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip/>
    <el-table-column prop="status" label="状态" width="90">
      <template #default="{row}">
        <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="video_status" label="视频" width="100">
      <template #default="{row}">
        <span v-if="row.video_status==='done'" style="color:#67c23a">已生成</span>
        <span v-else-if="row.video_status==='generating'" style="color:#e6a23c">生成中</span>
        <span v-else style="color:#b8aad0">未生成</span>
      </template>
    </el-table-column>
    <el-table-column prop="tags" label="标签" width="120" show-overflow-tooltip/>
    <el-table-column prop="generated_at" label="时间" width="110"/>
    <el-table-column label="操作" width="280" fixed="right">
      <template #default="{row}">
        <el-button v-if="step===1 && row.status==='draft'" size="small" type="primary" link @click="$emit('goStep', row, 2)">编辑</el-button>
        <el-button v-if="(step===2 || step===0) && row.status==='draft'" size="small" type="success" link @click="$emit('approve', row)">通过</el-button>
        <el-button v-if="(step===2 || step===0) && row.status==='draft'" size="small" type="danger" link @click="$emit('reject', row)">驳回</el-button>
        <el-button v-if="row.status==='approved' && row.video_status!=='generating'" size="small" type="primary" link @click="$emit('goVideo', row)">生成视频</el-button>
        <el-button v-if="row.status==='approved' && row.video_status==='done'" size="small" type="warning" link @click="$emit('publish', row)">发布</el-button>
        <el-button v-if="row.status==='published' && row.video_status==='done'" size="small" type="success" link @click="$emit('goStep', row, 4)">查看</el-button>
        <el-button v-if="step<=3" size="small" type="danger" link @click="$emit('delete', row.id)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>
  <el-empty v-else description="暂无内容"/>
</template>

<script setup>
defineProps({ data: Array, step: Number })
defineEmits(['goStep', 'goVideo', 'publish', 'approve', 'reject', 'delete'])

const statusType = s => s === 'approved' ? 'success' : s === 'rejected' ? 'danger' : s === 'published' ? '' : 'info'
const statusLabel = s => ({ draft: '草稿', approved: '已通过', rejected: '已驳回', published: '已发布' }[s] || s)
</script>
