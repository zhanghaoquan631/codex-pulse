const access = new URLSearchParams(location.search).get('access') || '';
const form = document.querySelector('#upload-form');
const input = document.querySelector('#photo');
const fileName = document.querySelector('#file-name');
const state = document.querySelector('#state');
const submit = document.querySelector('#submit');
input.addEventListener('change', () => { fileName.textContent = input.files?.[0]?.name || '还没有选择照片'; state.textContent = ''; });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!access) { state.textContent = '上传链接无效，请回到电脑端重新扫码。'; return; }
  submit.disabled = true;
  state.textContent = '正在进入画廊…';
  try {
    const response = await fetch(`/api/gallery/works?access=${encodeURIComponent(access)}`, { method: 'POST', body: new FormData(form) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '上传没有完成。');
    form.reset();
    fileName.textContent = '已加入画廊，还可以继续上传';
    state.textContent = '已保存。回到电脑端，它已经进入无限画廊。';
  } catch (error) { state.textContent = error.message || '上传失败，请重试。'; }
  finally { submit.disabled = false; }
});
