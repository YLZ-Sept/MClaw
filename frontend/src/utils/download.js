import { ElMessage } from 'element-plus'

export async function downloadFile(url, errMsg) {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      ElMessage.error(err.message || errMsg || '导出失败')
      return
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch { ElMessage.error(errMsg || '导出失败') }
}
