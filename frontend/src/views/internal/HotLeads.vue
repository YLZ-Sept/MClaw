<template>
  <div>
    <div class="tb"><el-button @click="load" :loading="loading">刷新</el-button></div>
    <el-table v-loading="loading" :data="list" stripe border row-key="id">
      <el-table-column type="index" label="#" width="50"/>
      <el-table-column prop="user_name" label="用户名" width="130"/>
      <el-table-column prop="summary" label="线索摘要" min-width="240" show-overflow-tooltip/>
      <el-table-column prop="contact_extracted" label="联系方式" width="160"/>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{row}"><el-tag :type="row.status==='new'?'danger':row.status==='contacted'?'warning':'info'" size="small">{{ row.status || 'new' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="170"/>
    </el-table>
    <el-empty v-if="!loading && list.length===0" description="暂无线索"/>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { hotLeadsApi } from '../../api/hot-video'

const list = ref([]), loading = ref(false)
async function load() { loading.value = true; try { list.value = (await hotLeadsApi.list()).data.data } catch {}; loading.value = false }
onMounted(load)
</script>

<style scoped>
.tb { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
</style>
