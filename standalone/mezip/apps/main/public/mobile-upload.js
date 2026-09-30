const $ = id => document.getElementById(id)
const linkToken = new URLSearchParams(location.hash.slice(1)).get('token') || ''
let token = linkToken; let session; let objectUrl; let active = false; let expiryTimer
const status = text => { $('status').textContent = text }
const api = async (url, options = {}) => {
  const response = await fetch(`/api/mobile-upload/${url}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }, cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '请求失败，请重试')
  return data
}
function ready(data) {
  session = data
  $('title').textContent = data.kind === 'owner' ? '我的照片库' : '临时照片分享'
  $('description').textContent = data.kind === 'owner' ? '照片会保存到电脑上的网站图片库，并可用于其他图片板块。' : `照片仅临时展示，不会保存到图库。链接有效至 ${new Date(data.expiresAt).toLocaleTimeString()}。`
  $('unlock').hidden = data.needsPin !== true
  $('upload').hidden = data.needsPin === true
  clearTimeout(expiryTimer)
  if (data.expiresAt) expiryTimer = setTimeout(() => { $('upload').hidden = true; status('本次授权已到期，请重新打开有效链接'); if (objectUrl) URL.revokeObjectURL(objectUrl); $('preview').removeAttribute('src') }, Math.max(0, data.expiresAt - Date.now()))
}
try { ready(await api('session')) } catch (error) { $('description').textContent = error.message }
$('unlock').addEventListener('submit', async event => {
  event.preventDefault(); if (active) return; active = true
  const button = $('unlock').querySelector('button'); button.disabled = true
  try {
    const data = await api('unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('pin').value.trim() }) })
    token = data.token; $('pin').value = ''; ready(data); status('验证成功，可以上传照片')
  } catch (error) { status(error.message) }
  finally { active = false; button.disabled = false }
})
$('photo').addEventListener('change', async () => {
  const file = $('photo').files[0]; $('submit').disabled = true; status('')
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  $('preview').hidden = true; $('preview').removeAttribute('src')
  if (!file) return
  if (file.size > 20 * 1024 * 1024) { status('请选择 20 MB 以内的照片'); return }
  objectUrl = URL.createObjectURL(file); $('preview').src = objectUrl
  try { await $('preview').decode() } catch { status('无法读取照片，请选择 JPG、PNG、WebP、GIF 或 AVIF'); return }
  $('preview').hidden = false; $('filename').textContent = file.name; $('submit').disabled = false
})
$('upload').addEventListener('submit', async event => {
  event.preventDefault(); const file = $('photo').files[0]
  if (!file || active) return
  active = true; $('submit').disabled = true; $('photo').disabled = true
  $('progress').hidden = false; $('progress').value = 0; status('正在上传…')
  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/mobile-upload/photo'); xhr.timeout = 120000
  xhr.setRequestHeader('Authorization', `Bearer ${token}`)
  xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name))
  xhr.upload.onprogress = event => { if (event.lengthComputable) $('progress').value = event.loaded / event.total * 100 }
  const finish = () => { active = false; $('submit').disabled = false; $('photo').disabled = false }
  xhr.onload = () => {
    try {
      const data = JSON.parse(xhr.responseText)
      if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.message || '上传失败')
      status(data.saved ? '已保存到网站图片库，电脑页面将自动同步。' : '已发送临时预览；未保存到图库，到期自动清除。')
      $('progress').value = 100
    } catch (error) { status(error.message) }
    finish()
  }
  xhr.onerror = xhr.ontimeout = () => { status('连接中断，请确认电脑在线且手机在同一 Wi-Fi'); finish() }
  xhr.send(file)
})
window.addEventListener('pagehide', () => { if (objectUrl) URL.revokeObjectURL(objectUrl) })
