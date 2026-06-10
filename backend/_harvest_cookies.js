// Open visible browser → poll for login → save cookies
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.resolve(__dirname, 'data/woyaobid-cookies.json');
const DATA_DIR = path.resolve(__dirname, 'data');

(async () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  await page.goto('https://qiye.qianlima.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('浏览器已打开。请在浏览器中登录乙方宝，等待自动检测...');
  console.log('(最多等待5分钟)');

  // Poll for login — check every 3 seconds if page title changed from login
  let loggedIn = false;
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const title = await page.title();
      const url = page.url();
      if (!title.includes('登录') && !url.includes('/login')) {
        console.log('检测到登录成功！Title: ' + title);
        loggedIn = true;
        break;
      }
      if (i % 10 === 0) process.stdout.write('.');
    } catch (e) {
      // page might be navigating
    }
  }

  if (!loggedIn) {
    console.log('\n超时，尝试保存当前 Cookie...');
  }

  const cookies = await context.cookies();
  const relevant = cookies.filter(c => c.domain.includes('qianlima'));
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(relevant, null, 2), 'utf-8');
  console.log('已保存 ' + relevant.length + ' 个 Cookie');
  relevant.forEach(c => console.log('  ' + c.name + ' = ' + c.value.substring(0, 50)));

  await browser.close();
  console.log('完成！可关闭此窗口。');
  process.exit(0);
})();
