/**
 * QQ 扫码绑定状态机（混合模式：扫码 + 手动表单共存）
 *
 * 与 mateclaw useQqAppRegister 一致：
 *   1. POST /qq/register/begin → sessionId + qrcode_img
 *   2. 每 2s 轮询 GET /qq/register/status → confirmed 时回调
 */
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../api/index.js'

export function useQqAppRegister(onConfirmed) {
  const qrcodeUrl = ref('')
  const loading = ref(false)
  const status = ref('') // '' | 'waiting' | 'confirmed' | 'expired' | 'denied'

  let pollTimer = null
  let confirmedFired = false

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  function reset() {
    stopPolling()
    qrcodeUrl.value = ''
    status.value = ''
    confirmedFired = false
  }

  async function start() {
    reset()
    loading.value = true

    try {
      const { data } = await request.post('/qq/register/begin')
      const sessionId = data?.data?.session_id || data?.session_id || ''

      if (!sessionId) {
        loading.value = false
        ElMessage.warning('QQ 扫码绑定暂不可用，请手动填写凭证')
        return
      }

      status.value = 'waiting'

      const pollOnce = async () => {
        try {
          const { data: d } = await request.get('/qq/register/status', { params: { session_id: sessionId } })
          const s = d?.data?.status || d?.status || 'waiting'
          const img = d?.data?.qrcode_img || d?.qrcode_img || d?.data?.qrcode_url || ''
          if (img && qrcodeUrl.value !== img) { qrcodeUrl.value = img; loading.value = false }
          status.value = s

          if (s === 'confirmed') {
            if (confirmedFired) return
            confirmedFired = true
            stopPolling()
            loading.value = false
            const appId = d?.data?.app_id || d?.app_id || ''
            const clientSecret = d?.data?.client_secret || d?.client_secret || ''
            if (appId && clientSecret) {
              onConfirmed({ appId, clientSecret })
              ElMessage.success('QQ 绑定成功')
            }
            return
          }

          if (s === 'expired') { stopPolling(); loading.value = false; ElMessage.warning('二维码已过期') }
          else if (s === 'denied') { stopPolling(); loading.value = false; ElMessage.warning('已取消绑定') }
        } catch { /* 静默 */ }
      }

      await pollOnce()
      pollTimer = setInterval(pollOnce, 2000)
    } catch {
      loading.value = false
      ElMessage.warning('QQ 扫码绑定暂不可用，请手动填写凭证')
    }
  }

  onBeforeUnmount(stopPolling)
  return { qrcodeUrl, loading, status, start, reset, stopPolling }
}
