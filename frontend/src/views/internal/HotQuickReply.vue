<template>
  <div>
    <el-card header="快捷回复测试">
      <el-form :model="form" label-width="80px" style="max-width:600px">
        <el-form-item label="用户名"><el-input v-model="form.user_name" placeholder="私信用户昵称"/></el-form-item>
        <el-form-item label="消息内容"><el-input v-model="form.text" type="textarea" :rows="3" placeholder="模拟用户发送的私信内容"/></el-form-item>
        <el-form-item><el-button type="primary" :loading="sending" @click="send">发送测试</el-button></el-form-item>
      </el-form>
    </el-card>

    <div v-if="result" style="margin-top:16px">
      <el-card>
        <template #header><div style="display:flex;align-items:center;gap:12px">测试结果 <el-tag v-if="result.intent" :type="intentType(result.intent)" size="small">{{ intentLabel(result.intent) }}</el-tag><el-tag v-if="result.is_lead" type="danger" size="small">高意向线索</el-tag></div></template>
        <div style="margin-bottom:12px"><strong>AI 回复：</strong></div>
        <div style="background:#f8f7ff;padding:12px;border-radius:8px;white-space:pre-wrap">{{ result.reply }}</div>
        <div v-if="result.lead_summary" style="margin-top:12px">
          <strong>线索摘要：</strong><span style="color:#7c3aed">{{ result.lead_summary }}</span>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { hotQuickReplyApi } from '../../api/hot-video'

const form = reactive({ user_name: '', text: '' })
const result = ref(null), sending = ref(false)

function intentLabel(i) {
  const m = { inquiry: '咨询', consult: '询问', complaint: '投诉', invalid: '无效' }
  return m[i] || i
}
function intentType(i) {
  const m = { inquiry: '', consult: 'warning', complaint: 'danger', invalid: 'info' }
  return m[i] || ''
}

async function send() {
  if (!form.text) return ElMessage.warning('请输入消息内容')
  sending.value = true
  try {
    const res = await hotQuickReplyApi.send({ user_name: form.user_name || '测试用户', text: form.text })
    result.value = res.data.data
    ElMessage.success('已处理')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '请求失败')
  } finally {
    sending.value = false
  }
}
</script>
