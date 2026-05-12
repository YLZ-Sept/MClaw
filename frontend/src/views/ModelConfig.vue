<template>
  <div class="page-container">
    <div class="page-title">模型配置</div>

    <el-card shadow="hover" style="border-radius: 12px;">
      <template #header><span style="font-weight: 600;">模型参数</span></template>
      <el-form label-width="120px" label-position="left">
        <el-form-item label="AI 引擎">
          <el-select v-model="engine" style="width: 300px" disabled>
            <el-option label="OpenClaw" value="OpenClaw" />
          </el-select>
          <div style="color: #909399; font-size: 12px; margin-top: 4px;">当前仅支持 OpenClaw 引擎</div>
        </el-form-item>
        <el-form-item label="默认模型">
          <el-select v-model="model" style="width: 300px">
            <el-option label="DeepSeek-V4-Pro" value="deepseek-v4-pro" />
            <el-option label="GPT-4" value="gpt-4" />
            <el-option label="GPT-3.5 Turbo" value="gpt-3.5-turbo" />
            <el-option label="Claude 3 Opus" value="claude-3-opus" />
            <el-option label="DeepSeek V3" value="deepseek-v3" />
            <el-option label="本地模型" value="local" />
          </el-select>
        </el-form-item>
        <el-form-item label="Temperature">
          <el-slider v-model="temperature" :min="0" :max="2" :step="0.1" style="width: 300px" />
        </el-form-item>
        <el-form-item label="最大 Token">
          <el-input-number v-model="maxTokens" :min="256" :max="8192" :step="256" />
        </el-form-item>
        <el-form-item label="超时时间">
          <el-input-number v-model="timeout" :min="10" :max="300" /> 秒
        </el-form-item>
        <el-form-item>
          <el-button type="primary">保存配置</el-button>
          <el-button>重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const engine = ref('OpenClaw')
const model = ref('gpt-4')
const temperature = ref(0.7)
const maxTokens = ref(2048)
const timeout = ref(60)
</script>
