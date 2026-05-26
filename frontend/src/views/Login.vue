<template>
  <div class="login-container">
    <div class="login-bg"></div>
    <div class="login-card">
      <div class="login-header">
        <h1>MClaw V1.0</h1>
        <p>企业智能体管理平台</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" show-password :prefix-icon="Lock" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" class="login-btn" @click="handleLogin">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="login-footer">
        <span>v2026.5.7 · DeepSeek AI 驱动</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { login } from '../api'

const router = useRouter()
const route = useRoute()
const formRef = ref()
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const res = await login(form.username, form.password)
    if (res.code === 200) {
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify({ name: res.data.name, role: res.data.role }))
      ElMessage.success(`欢迎回来，${res.data.name}`)
      const redirect = route.query.redirect || '/'
      router.push(redirect)
    } else {
      ElMessage.error(res.message || '登录失败')
    }
  } catch {
    ElMessage.error('网络错误，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #0f172a;
}

.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(66, 99, 235, 0.12), transparent),
    radial-gradient(ellipse 60% 50% at 20% 80%, rgba(99, 102, 241, 0.08), transparent),
    radial-gradient(ellipse 50% 50% at 80% 10%, rgba(56, 189, 248, 0.06), transparent);
  pointer-events: none;
}

.login-card {
  position: relative;
  width: 420px;
  padding: 48px 40px 32px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 16px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 6px;
  letter-spacing: 1px;
}

.login-header p {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
}

.login-btn {
  width: 100%;
  margin-top: 4px;
  height: 44px;
  font-size: 16px;
  letter-spacing: 4px;
}

.login-footer {
  text-align: center;
  margin-top: 20px;
  font-size: 12px;
  color: #c0c8d4;
}
</style>
