import { ElMessage } from 'element-plus'

function getFilename(res) {
  const h = res.headers.get('Content-Disposition')
  if (!h) return 'export.xlsx'
  // RFC 5987: filename*=UTF-8''...
  const m1 = h.match(/filename\*=UTF-8''([^;]*)/)
  if (m1) return decodeURIComponent(m1[1])
  // standard: filename="..."
  const m2 = h.match(/filename="?([^";]+)"?/)
  if (m2) return m2[1]
  return 'export.xlsx'
}

export async function downloadFile(url, errMsg) {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      let msg = errMsg || '导出失败'
      try {
        const err = await res.json()
        if (err.message) msg = err.message
      } catch {}
      ElMessage.error(msg)
      return
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = getFilename(res)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch (e) {
    console.error('[downloadFile]', e)
    ElMessage.error(errMsg || '导出失败')
  }
}
