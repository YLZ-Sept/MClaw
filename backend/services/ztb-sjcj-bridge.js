// ztb-sjcj-bridge.js — Node.js ↔ Python 招投标采集桥接
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { randomUUID } = require('crypto');

const SKILL_DIR = path.join(__dirname, 'ztb-sjcj');
const DATA_DIR = path.join(SKILL_DIR, 'data');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function extractAmount(text) {
  if (!text && text !== 0) return null;
  const m = String(text).match(/(\d+\.?\d*)\s*万/);
  if (m) return parseFloat(m[1]);
  const m2 = String(text).match(/(\d+\.?\d*)\s*元/);
  if (m2) return parseFloat((parseFloat(m2[1]) / 10000).toFixed(2));
  const m3 = String(text).match(/(\d+\.?\d*)/);
  if (m3) {
    const v = parseFloat(m3[1]);
    return v > 10000 ? parseFloat((v / 10000).toFixed(2)) : v;
  }
  return null;
}

function classifyIndustry(title, content) {
  const text = `${title || ''} ${content || ''}`;
  if (/学校|学院|大学|中学|小学|幼儿园|教育/.test(text)) return '学校';
  if (/医院|卫生院|疾控|妇幼|医疗|药/.test(text)) return '医院';
  if (/政府|局|委员会|办公室|公安|法院|检察院|行政/.test(text)) return '政府';
  return '企业';
}

// 运行 Python 脚本，返回 { code, stdout, stderr }
function runPython(script, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const pyArgs = [path.join(SKILL_DIR, script), ...args];
    const proc = spawn('python', pyArgs, {
      cwd: SKILL_DIR,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
    proc.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d); });
    proc.on('close', code => {
      if (code === 0) resolve({ code: 0, stdout, stderr });
      else resolve({ code, stdout, stderr, error: stderr || `exit code ${code}` });
    });
    proc.on('error', err => reject(err));
  });
}

// ─── 登录：打开浏览器让用户扫码 ───
async function login() {
  console.log('[ztb-bridge] 启动登录，请在浏览器中扫码...');
  const result = await runPython('login.py', [], { timeout: 5 * 60 * 1000 });
  console.log('[ztb-bridge] 登录脚本退出, code:', result.code);

  // flush browser_state 写入磁盘
  await new Promise(r => setTimeout(r, 2000));

  const stateDir = path.join(SKILL_DIR, 'browser_state');
  let hasState = false;
  try {
    hasState = fs.existsSync(stateDir) && fs.readdirSync(stateDir).filter(f => !f.startsWith('.')).length > 0;
  } catch {}
  return { success: hasState, message: hasState ? '登录成功' : '登录失败，browser_state 为空' };
}

// ─── 检查登录状态 ───
function checkLoginState() {
  const stateDir = path.join(SKILL_DIR, 'browser_state');
  try {
    if (fs.existsSync(stateDir)) {
      const files = fs.readdirSync(stateDir).filter(f => !f.startsWith('.'));
      return files.length > 0;
    }
  } catch {}
  return false;
}

// ─── 采集数据并入库 ───
async function scrape(opts = {}) {
  const loggedIn = checkLoginState();
  if (!loggedIn) {
    const err = new Error('未登录！请先在招标设置中扫码登录乙方宝');
    err.needsLogin = true;
    throw err;
  }

  const args = [];
  if (opts.headless !== false) args.push('--headless');
  if (opts.noDetail) args.push('--no-detail');

  console.log('[ztb-bridge] 开始采集... args:', args.join(' ') || '(default)');
  const result = await runPython('scrape.py', args, { timeout: 60 * 60 * 1000 });

  if (result.code !== 0) {
    // 检测是否未登录
    if (result.stdout.includes('未登录') || result.stderr.includes('未登录')) {
      const err = new Error('乙方宝登录态已过期，请重新扫码登录');
      err.needsLogin = true;
      throw err;
    }
    throw new Error(`采集脚本失败: ${result.error}`);
  }

  // 找最新的批次目录
  ensureDir(DATA_DIR);
  const items = fs.readdirSync(DATA_DIR).filter(f => {
    const p = path.join(DATA_DIR, f);
    return fs.statSync(p).isDirectory() && /^\d{8}_\d{6}$/.test(f);
  }).sort().reverse();

  if (items.length === 0) throw new Error('未找到采集结果目录');

  const batchDir = path.join(DATA_DIR, items[0]);
  console.log('[ztb-bridge] 读取批次:', items[0]);

  const fullDataFile = path.join(batchDir, '_full_data.json');
  const rawFile = path.join(batchDir, '_raw_list.json');
  const dataFile = fs.existsSync(fullDataFile) ? fullDataFile : rawFile;

  if (!fs.existsSync(dataFile)) throw new Error(`数据文件不存在: ${dataFile}`);

  const allData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

  // 获取或创建 woyaobid source
  let source = db.prepare("SELECT id FROM bid_sources WHERE source_type='woyaobid' LIMIT 1").get();
  if (!source) {
    const sid = randomUUID();
    db.prepare("INSERT INTO bid_sources (id,name,url,source_type) VALUES (?,?,?,?)")
      .run(sid, '乙方宝', 'https://qiye.qianlima.com', 'woyaobid');
    source = { id: sid };
  }

  let inserted = 0;
  let skipped = 0;
  const seen = new Set();
  const insert = db.prepare(`INSERT INTO bid_items (id,source_id,title,project_no,bid_type,fetch_time,doc_deadline,bid_time,submit_type,amount,purchase_requirements,evaluation,collect_time,url,is_notified,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`);

  // 处理中标信息
  for (const item of allData.zhongbiao || []) {
    const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
    if (!title) continue;
    if (seen.has(title)) { skipped++; continue; }
    seen.add(title);

    const contentId = item.contentId || '';
    const areaId = item.areaId || '29';
    const url = contentId
      ? `https://qiye.qianlima.com/new_qd_yfbsite/#/infoCenter/infoDetail/${contentId}/${areaId}/zhongbiao?fromPage=searchPage`
      : '';

    if (url) {
      const dup = db.prepare('SELECT id FROM bid_items WHERE url=?').get(url);
      if (dup) { skipped++; continue; }
    }

    const amount = extractAmount(item._amount || item.amountUnit || item.extractBudget || '');
    const winAmount = extractAmount(item._dealAmount || '');
    const regDeadline = item._regDeadline || item.registrationDeadline || null;
    const bidTime = item._bidDeadline || item.tenderEndTime || null;
    const bidder = item._zhaoBiaoUnit || item.zhaoBiaoUnit || null;
    const winner = item._zhongBiaoUnit || item.zhongBiaoUnit || null;
    const region = item.areaName || item.area || '';
    const industry = classifyIndustry(title, item._fullContent || item.content || '');
    const noticeTime = item.updateDate || null;
    const requirements = (item._fullContent || item.content || '').substring(0, 500);
    const bidType = item._procurementMethod || item.biddingType || null;
    const projectNo = item._projectNo || null;

    const id = randomUUID();
    try {
      insert.run(id, source.id, title, projectNo, bidType, null, regDeadline, bidTime, null, amount, requirements, null, null, url, 'new');
      inserted++;
    } catch (e) {
      if (!e.message.includes('UNIQUE constraint')) {
        console.error('[ztb-bridge] insert zhongbiao error:', e.message);
      }
    }
  }

  // 处理采购意向
  for (const item of allData.caiyi || []) {
    const title = (item.newTitle || item.title || '').replace(/<[^>]+>/g, '').trim();
    if (!title) continue;
    if (seen.has(title)) { skipped++; continue; }
    seen.add(title);

    const relationId = item.relationId || '';
    const itemId = item.id || '';
    const areaId = item.areaId || '29';
    const url = relationId
      ? `https://qiye.qianlima.com/new_qd_yfbsite/#/infoCenter/infoDetail/${relationId}/${areaId}/caigou?purchaseId=${itemId}`
      : '';

    if (url) {
      const dup = db.prepare('SELECT id FROM bid_items WHERE url=?').get(url);
      if (dup) { skipped++; continue; }
    }

    const amount = extractAmount(item.budgetAmount || item.budget || '');
    const bidder = item.zhaoBiaoUnit || item.zhaoBiaoUnitComplate || null;
    const region = item.area || item.areaName || '';
    const noticeTime = item.releaseTime || item.releaseTimeYyyymmdd || null;
    const requirements = (item.purchaseSurvey || item.content || '').substring(0, 500);
    const industry = classifyIndustry(title, item.purchaseSurvey || item.content || '');

    const id = randomUUID();
    try {
      insert.run(id, source.id, title, null, '采购意向', null, null, null, null, amount, requirements, null, null, url, 'new');
      inserted++;
    } catch (e) {
      if (!e.message.includes('UNIQUE constraint')) {
        console.error('[ztb-bridge] insert caiyi error:', e.message);
      }
    }
  }

  const total = (allData.zhongbiao?.length || 0) + (allData.caiyi?.length || 0);
  console.log(`[ztb-bridge] 完成: 共${total}条, 新增入库${inserted}, 跳过${skipped}`);
  return { found: total, inserted, batch: items[0] };
}

module.exports = { login, scrape, checkLoginState };
