// bid-excel-writer — Node.js wrapper for bid_excel_writer.py
// Called by collectors to append items to desktop Excel files
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_SCRIPT = path.join(__dirname, 'bid_excel_writer.py');
const TXT_DIR = path.join(__dirname, '..', 'data', 'bid-txt');

// Ensure txt directory exists
if (!fs.existsSync(TXT_DIR)) fs.mkdirSync(TXT_DIR, { recursive: true });

/**
 * Save collected items to timestamped txt file
 * @param {string} engine - 'crawl4ai' or 'scrapling'
 * @param {Array} items - collected bid items
 * @returns {string} txt file path
 */
function saveToTxt(engine, items) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${engine}_${ts}.txt`;
  const filepath = path.join(TXT_DIR, filename);

  const lines = [];
  lines.push(`=== ${engine} 采集结果 — ${new Date().toLocaleString('zh-CN')} ===`);
  lines.push(`共 ${items.length} 条\n`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    lines.push(`--- 第 ${i + 1} 条 ---`);
    lines.push(`标题: ${item.title || ''}`);
    lines.push(`URL: ${item.url || ''}`);
    if (item.bid_type) lines.push(`招标方式: ${item.bid_type}`);
    if (item.project_no) lines.push(`项目编号: ${item.project_no}`);
    if (item.amount) lines.push(`金额: ${item.amount}万元`);
    if (item.doc_deadline) lines.push(`文件截止: ${item.doc_deadline}`);
    if (item.bid_time) lines.push(`投标时间: ${item.bid_time}`);
    if (item.purchase_requirements) lines.push(`采购需求: ${item.purchase_requirements}`);
    if (item.source_name) lines.push(`来源: ${item.source_name}`);
    lines.push('');
  }

  fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
  console.log(`[bid-excel-writer] txt saved: ${filename}`);
  return filepath;
}

/**
 * Append items to Excel files via Python script
 * @param {Array} items - with fields: title, url, bid_type, amount, doc_deadline, bid_time, purchase_requirements, source_name
 * @returns {object} { zhongbiao, caiyou, zhongbiao_skipped, caiyou_skipped }
 */
function appendToExcel(items) {
  return new Promise((resolve, reject) => {
    if (!items || items.length === 0) {
      return resolve({ zhongbiao: 0, caiyou: 0, zhongbiao_skipped: 0, caiyou_skipped: 0 });
    }

    const json = JSON.stringify(items);
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, [PYTHON_SCRIPT, json], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => stdout += chunk.toString('utf-8'));
    proc.stderr.on('data', chunk => {
      const line = chunk.toString('utf-8');
      stderr += line;
      process.stderr.write(line);
    });

    proc.on('close', code => {
      if (code !== 0) {
        console.log(`[bid-excel-writer] Python exited code=${code}: ${stderr.slice(-300)}`);
        return resolve({ zhongbiao: 0, caiyou: 0, zhongbiao_skipped: 0, caiyou_skipped: 0, error: stderr.slice(-200) });
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        console.log(`[bid-excel-writer] JSON parse error: ${stdout.slice(0, 200)}`);
        resolve({ zhongbiao: 0, caiyou: 0, zhongbiao_skipped: 0, caiyou_skipped: 0 });
      }
    });

    proc.on('error', err => {
      console.log(`[bid-excel-writer] spawn error: ${err.message}`);
      resolve({ zhongbiao: 0, caiyou: 0, zhongbiao_skipped: 0, caiyou_skipped: 0 });
    });
  });
}

module.exports = { saveToTxt, appendToExcel, TXT_DIR };
