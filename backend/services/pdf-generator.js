const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'pdf');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * 使用 Playwright HTML→PDF 生成 PDF
 * params: {
 *   title: '文档标题',
 *   author: 'MClaw',
 *   content: [
 *     { text: '段落文字', style: 'body' },
 *     { text: '标题', style: 'header' },
 *     { table: { headers: [...], rows: [[...]] } },
 *     { ul: ['item1', 'item2'] },
 *     { pageBreak: true }
 *   ],
 *   pageSize: 'A4',
 *   orientation: 'portrait',
 *   watermark: 'CONFIDENTIAL'
 * }
 */
function generatePDF(params) {
  return (async () => {
    const { title, author, content, pageSize, orientation, watermark } = params;

    const html = buildHTML(title, content || [], watermark);
    const filepath = path.join(OUTPUT_DIR, `${randomUUID()}.html`);
    fs.writeFileSync(filepath, html, 'utf-8');

    try {
      const { chromium } = require('playwright');
      const exePath = 'C:/Users/10260/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
      const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(exePath) ? exePath : undefined });
      const page = await browser.newPage();

      const format = pageSize || 'A4';
      await page.goto(`file:///${filepath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle', timeout: 10000 });

      const filename = `${randomUUID()}.pdf`;
      const outPath = path.join(OUTPUT_DIR, filename);

      await page.pdf({
        path: outPath,
        format,
        landscape: orientation === 'landscape',
        margin: { top: '15mm', bottom: '20mm', left: '15mm', right: '15mm' },
        displayHeaderFooter: true,
        headerTemplate: title ? `<div style="font-size:8px;color:#999;text-align:center;width:100%;padding-top:5px">${escapeHtml(title)}</div>` : '<div></div>',
        footerTemplate: '<div style="font-size:8px;color:#999;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        printBackground: true
      });

      await browser.close();
      try { fs.unlinkSync(filepath); } catch {}

      return { filename, filepath: outPath };
    } catch (err) {
      try { fs.unlinkSync(filepath); } catch {}
      throw err;
    }
  })();
}

function buildHTML(title, content, watermark) {
  const items = (content || []).map(item => {
    if (typeof item === 'string') return `<p class="body">${escapeHtml(item)}</p>`;

    if (item.table) {
      const h = item.table.headers || [];
      const r = item.table.rows || [];
      const headerRow = h.length ? `<tr>${h.map(c => `<th>${escapeHtml(String(c))}</th>`).join('')}</tr>` : '';
      const dataRows = r.map((row, i) =>
        `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${row.map(c => `<td>${escapeHtml(String(c || ''))}</td>`).join('')}</tr>`
      ).join('');
      return `<table>${headerRow}${dataRows}</table>`;
    }

    if (item.ul) {
      return `<ul>${item.ul.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
    }

    if (item.ol) {
      return `<ol>${item.ol.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol>`;
    }

    if (item.pageBreak) {
      return '<div class="page-break"></div>';
    }

    if (item.image) {
      return `<img src="${item.image}" style="max-width:100%;${item.width ? 'width:' + item.width + 'px;' : ''}" />`;
    }

    if (item.text !== undefined) {
      const style = item.style || 'body';
      const cls = style === 'header' ? 'header' : style === 'subheader' ? 'subheader' : style === 'small' ? 'small' : 'body';
      const align = item.alignment ? `text-align:${item.alignment}` : '';
      const margin = item.margin ? `margin:${item.margin[1] || 4}px 0` : '';
      return `<p class="${cls}" style="${align}${margin}">${escapeHtml(item.text)}</p>`;
    }

    return '';
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 11pt; line-height: 1.7; color: #333; padding: 0; }
  .header { font-size: 20pt; font-weight: bold; color: #1B365D; margin: 16px 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #C4973B; }
  .subheader { font-size: 14pt; font-weight: bold; color: #2D5F8A; margin: 14px 0 8px 0; }
  .body { margin: 6px 0; }
  .small { font-size: 9pt; color: #888; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  th { background: #1B365D; color: #fff; padding: 8px 10px; text-align: left; font-weight: bold; }
  td { padding: 6px 10px; border-bottom: 1px solid #E0E0E0; }
  tr.even td { background: #F8F9FB; }
  ul, ol { margin: 6px 0; padding-left: 24px; }
  li { margin: 3px 0; }
  .page-break { page-break-after: always; }
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 72pt; color: rgba(0,0,0,0.04); pointer-events: none; z-index: 999; white-space: nowrap; }
</style></head><body>
${watermark ? `<div class="watermark">${escapeHtml(watermark)}</div>` : ''}
${items}
</body></html>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

module.exports = { generatePDF };
