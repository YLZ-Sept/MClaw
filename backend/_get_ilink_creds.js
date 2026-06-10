// 获取新的微信 iLink Bot 凭证 — 扫码登录获取 token + userId
// 用法: CD 到 backend 目录后 node _get_ilink_creds.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const API = 'https://ilinkai.weixin.qq.com';
const CREDS_FILE = path.resolve(__dirname, 'data/ilink-creds-new.json');

async function main() {
  // 1. 获取二维码
  console.log('1. 获取登录二维码...');
  const qrResp = await fetch(`${API}/ilink/bot/get_bot_qrcode?bot_type=3`, {
    headers: { 'iLink-App-ClientVersion': '8.0.70' },
    signal: AbortSignal.timeout(15000)
  }).then(r => r.json()).catch(e => {
    console.error('请求失败:', e.message);
    console.error('请确认网络能访问 ilinkai.weixin.qq.com');
    process.exit(1);
  });

  if (!qrResp.qrcode || !qrResp.qrcode_img_content) {
    console.error('获取二维码失败:', JSON.stringify(qrResp));
    process.exit(1);
  }

  const qrUrl = qrResp.qrcode_img_content;
  console.log('   二维码已生成，正在打开浏览器...');
  // 打开浏览器显示二维码
  if (qrUrl.startsWith('http')) {
    exec(process.platform === 'win32' ? `start "" "${qrUrl}"` : `open "${qrUrl}"`);
  }
  console.log('   如果浏览器未弹出，请手动访问:');
  console.log('   ' + qrUrl.slice(0, 100) + '...');
  console.log('');

  // 2. 轮询扫码状态（最多等待 2 分钟）
  const qrcodeToken = qrResp.qrcode;
  console.log('2. 请用微信扫一扫浏览器中的二维码，然后在手机上点"确认登录"');
  console.log('   等待扫码确认...（最长 2 分钟）\n');

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const statusResp = await fetch(
        `${API}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeToken)}`,
        { signal: AbortSignal.timeout(10000) }
      ).then(r => r.json());

      const status = statusResp.status;
      console.log('   [' + new Date().toLocaleTimeString() + '] 状态: ' + status);

      if (status === 'confirmed') {
        const creds = {
          token: statusResp.bot_token,
          userId: statusResp.ilink_user_id || statusResp.ilink_bot_id,
          botId: statusResp.ilink_bot_id,
          baseUrl: statusResp.baseurl || API,
          savedAt: new Date().toISOString()
        };
        if (!fs.existsSync(path.dirname(CREDS_FILE))) fs.mkdirSync(path.dirname(CREDS_FILE), { recursive: true });
        fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
        console.log('');
        console.log('   ╔══════════════════════════════════════════╗');
        console.log('   ║         扫码成功！凭证如下               ║');
        console.log('   ╠══════════════════════════════════════════╣');
        console.log('   ║  Bot Token: ' + creds.token.slice(0, 30) + '...  ║');
        console.log('   ║  User ID:   ' + creds.userId + '  ║');
        console.log('   ╚══════════════════════════════════════════╝');
        console.log('');
        console.log('3. 现在去前端「消息渠道 → 渠道账号管理 → 添加账号」:');
        console.log('   平台选「微信 (iLink Bot)」，粘贴上面的 Token 和 User ID');
        console.log('');
        console.log('   凭证文件: ' + CREDS_FILE);
        process.exit(0);
      } else if (status === 'expired') {
        console.error('二维码已过期，请重新运行');
        process.exit(1);
      }
      // wait / scaned → 继续轮询
    } catch (err) {
      console.log('   [' + new Date().toLocaleTimeString() + '] 请求超时，重试...');
    }
  }
  console.error('等待超时，请重新运行');
  process.exit(1);
}

main().catch(e => { console.error('错误:', e.message); process.exit(1); });
