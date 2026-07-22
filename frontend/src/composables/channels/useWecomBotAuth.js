/**
 * 企业微信扫码授权：动态加载官方 JS SDK，弹出授权窗口，回调 botid/secret。
 *
 * 与 mateclaw useWecomBotAuth 完全一致：
 *   - SDK 脚本只在用户点击"授权"按钮时才注入
 *   - 多次点击不会重复 append <script>（sdkLoadPromise 去重）
 *   - 弹窗组件 template 里只剩按钮 + loading 状态
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const SDK_URL = 'https://wwcdn.weixin.qq.com/node/wework/js/wecom-aibot-sdk@0.1.0.min.js'
const SOURCE = 'mclaw'

let sdkLoadPromise = null

function loadSDK() {
  if (window.WecomAIBotSDK) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      sdkLoadPromise = null
      reject(new Error('WeCom SDK load failed'))
    }
    document.body.appendChild(script)
  })
  return sdkLoadPromise
}

export function useWecomBotAuth(onSuccess) {
  const loading = ref(false)

  async function start() {
    loading.value = true
    try {
      await loadSDK()
    } catch {
      ElMessage.error('企业微信 SDK 加载失败，请检查网络连接')
      loading.value = false
      return
    }

    const sdk = window.WecomAIBotSDK
    if (!sdk) {
      ElMessage.error('企业微信 SDK 不可用')
      loading.value = false
      return
    }
    loading.value = false

    const result = sdk.openBotInfoAuthWindow({ source: SOURCE })
    if (!result || typeof result.then !== 'function') return

    result.then(
      (bot) => {
        if (bot?.botid) {
          onSuccess(bot)
          ElMessage.success('企业微信授权成功')
        }
      },
      (error) => {
        if (error?.code === 'WINDOW_BLOCKED') {
          ElMessage.error('授权窗口被浏览器拦截，请允许弹窗后重试')
        } else if (error?.code === 'CANCELLED') {
          ElMessage.info('已取消授权')
        } else {
          ElMessage.error('授权失败：' + (error?.message || error?.code || '未知错误'))
        }
      }
    )
  }

  return { loading, start }
}
