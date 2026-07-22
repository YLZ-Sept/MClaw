/**
 * 微信 iLink Bot 扫码登录状态机
 *
 *  1. 拉一张二维码 → 轮询扫码状态（每 2s）→ confirmed 时回调 botToken/baseUrl
 *  2. 组件卸载时自动 stopPolling，不漏定时器
 *
 * 与 mateclaw useWeixinQrcodePoll 完全一致。
 */
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { channelAccountsApi } from '../../api/channels'

export function useWeixinQrcodePoll(onConfirmed) {
  const qrcodeImg = ref('')
  const loading = ref(false)
  const pollStatus = ref('') // '' | 'polling' | 'scanned' | 'confirmed' | 'expired'

  let pollTimer = null
  let confirmedFired = false

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  function reset() {
    stopPolling()
    qrcodeImg.value = ''
    pollStatus.value = ''
    confirmedFired = false
  }

  async function start() {
    reset()
    loading.value = true

    try {
      const { data } = await channelAccountsApi.wechatQrcode()
      const imgContent = data?.data?.img_url || data?.data?.qrcode_img || data?.img_url || ''
      const qrcodeId = data?.data?.qrcode || data?.qrcode || ''

      if (!imgContent && !qrcodeId) {
        ElMessage.error('获取微信二维码失败')
        loading.value = false
        return
      }

      if (imgContent) {
        // iLink 返回的是登录链接（非图片），用 QR 服务生成二维码图片
        qrcodeImg.value = imgContent.startsWith('http')
          ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(imgContent)}`
          : `data:image/png;base64,${imgContent}`
      }
      pollStatus.value = 'polling'
      loading.value = false

      if (!qrcodeId) return

      pollTimer = setInterval(async () => {
        try {
          const { data } = await channelAccountsApi.wechatQrcodeStatus(qrcodeId)
          const status = data?.data?.status || data?.status || ''

          if (status === 'scanned') { pollStatus.value = 'scanned' }

          if (status === 'confirmed') {
            if (confirmedFired) return
            confirmedFired = true
            stopPolling()
            qrcodeImg.value = ''
            pollStatus.value = 'confirmed'
            const token = data?.data?.token || data?.token || ''
            const baseUrl = data?.data?.base_url || data?.base_url || ''
            if (token) {
              onConfirmed({ botToken: token, baseUrl })
              ElMessage.success('微信扫码登录成功')
            }
          }

          if (status === 'expired') {
            stopPolling()
            qrcodeImg.value = ''
            pollStatus.value = 'expired'
            ElMessage.warning('二维码已过期，请重新获取')
          }
        } catch { /* 静默处理网络瞬断 */ }
      }, 2000)
    } catch {
      ElMessage.error('获取微信二维码失败')
      loading.value = false
    }
  }

  onBeforeUnmount(stopPolling)

  return { qrcodeImg, loading, pollStatus, start, reset, stopPolling }
}
