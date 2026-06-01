const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'diagrams');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Mermaid 图表生成 — 使用 Playwright 离线渲染
 * params: {
 *   code: 'graph TD;\n  A[开始] --> B[处理];',
 *   theme: 'default' | 'forest' | 'dark' | 'neutral',
 *   format: 'png' | 'svg'
 * }
 */
async function generateDiagram(params) {
  const { code, theme, format } = params;
  const diagramCode = code || 'graph TD; A-->B;';
  const diagramTheme = theme || 'default';
  const outputFormat = format || 'png';

  // 构建完整 HTML，内嵌 Mermaid CDN
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
mermaid.initialize({
  startOnLoad: true,
  theme: '${diagramTheme}',
  securityLevel: 'loose',
  fontFamily: 'Microsoft YaHei, sans-serif'
});
</script>
<style>
body { margin: 20px; background: white; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; }
#container { max-width: 100%; }
</style>
</head><body>
<div id="container">
<pre class="mermaid">${escapeHtml(diagramCode)}</pre>
</div>
</body></html>`;

  const filepath = path.join(OUTPUT_DIR, `${randomUUID()}.html`);
  fs.writeFileSync(filepath, html, 'utf-8');

  try {
    const { chromium } = require('playwright');
    const exePath = 'C:/Users/10260/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
    const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(exePath) ? exePath : undefined });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(`file:///${filepath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle', timeout: 15000 });

    // 等待 mermaid 渲染完成
    await page.waitForSelector('svg', { timeout: 10000 });

    const filename = `${randomUUID()}.${outputFormat}`;
    const outPath = path.join(OUTPUT_DIR, filename);

    if (outputFormat === 'svg') {
      // 提取 SVG
      const svgContent = await page.evaluate(() => {
        const svg = document.querySelector('svg');
        return svg ? svg.outerHTML : null;
      });
      if (svgContent) {
        fs.writeFileSync(outPath, svgContent, 'utf-8');
      }
    } else {
      // 截图：只截 SVG 区域
      const svgEl = await page.$('svg');
      if (svgEl) {
        await svgEl.screenshot({ path: outPath, omitBackground: false });
      } else {
        // fallback: 截取整个 mermaid 容器
        const mermaidEl = await page.$('.mermaid');
        if (mermaidEl) {
          await mermaidEl.screenshot({ path: outPath, omitBackground: false });
        } else {
          await page.screenshot({ path: outPath, fullPage: true });
        }
      }
    }

    await browser.close();
    fs.unlinkSync(filepath); // 清理临时 HTML

    const stat = fs.statSync(outPath);
    return { filename, filepath: outPath, size: stat.size };
  } catch (err) {
    // 清理
    try { fs.unlinkSync(filepath); } catch {}
    throw err;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cleanup() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    fs.readdirSync(OUTPUT_DIR).forEach(f => {
      const fp = path.join(OUTPUT_DIR, f);
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    });
  } catch {}
}
setInterval(cleanup, 60 * 60 * 1000);

module.exports = { generateDiagram };
