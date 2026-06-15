const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const db = require('../db');
const auth = require('./auth');
const { addLog } = require('./logs');

const PROJECT_ROOT = path.join(__dirname, '..');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');

// 解析可执行文件路径（Windows 下 execSync 可能找不到 PATH 中的命令）
function resolveExe(name) {
  if (process.platform !== 'win32') return name;
  const known = {
    git: [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\bin\\git.exe',
    ],
  };
  const candidates = known[name] || [];
  if (candidates.length === 0) {
    // npm/npx/node: 用 node 进程路径反推
    const nodeDir = path.dirname(process.execPath);
    candidates.push(path.join(nodeDir, name + '.cmd'), path.join(nodeDir, name + '.exe'));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return name; // fallback, let it fail with original error
}
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const updateStorage = multer.diskStorage({
  destination: BACKUPS_DIR,
  filename: (req, file, cb) => cb(null, 'update_upload_' + Date.now() + '.zip')
});
const updateUpload = multer({
  storage: updateStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.zip') return cb(null, true);
    cb(null, false);
  }
});

function dirSize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  function walk(d) {
    try {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name);
        const st = fs.lstatSync(p);
        if (st.isDirectory()) walk(p);
        else total += st.size;
      }
    } catch {}
  }
  walk(dirPath);
  return total;
}

function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// 鉴权中间件
function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !auth.tokens[token]) {
    return res.json({ code: 401, message: '未登录或登录已过期' });
  }
  req.token = token;
  req.session = auth.tokens[token];
  next();
}

// 修改密码
router.post('/change-password', authRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.json({ code: 400, message: '请输入旧密码和新密码' });
  }
  if (newPassword.length < 6) {
    return res.json({ code: 400, message: '新密码至少6位' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.session.username);
  if (!user) {
    return res.json({ code: 404, message: '用户不存在' });
  }

  if (!auth.verifyPassword(oldPassword, user.password_hash)) {
    return res.json({ code: 400, message: '旧密码不正确' });
  }

  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(salt + ':' + hash, user.id);

  // 清除所有其他会话，保留当前
  for (const [tk, session] of Object.entries(auth.tokens)) {
    if (session.username === user.username && tk !== req.token) {
      delete auth.tokens[tk];
    }
  }

  res.json({ code: 200, message: '密码修改成功' });
});

// 查看活跃会话
router.get('/sessions', authRequired, (req, res) => {
  let list = Object.entries(auth.tokens).map(([tk, s]) => ({
    token: tk === req.token ? '***current***' : tk.slice(0, 8) + '...',
    tokenFull: tk,
    username: s.username,
    name: s.name,
    role: s.role,
    loginTime: new Date(s.createdAt).toLocaleString('zh-CN'),
    isCurrent: tk === req.token,
  }));

  // 会话可见性：superadmin 看全部，admin 排除 superadmin，普通用户只看自己
  if (req.user.role !== 'superadmin') {
    list = list.filter(s => s.role !== 'superadmin');
    if (req.user.role !== 'admin') {
      list = list.filter(s => s.isCurrent);
    }
  }

  res.json({ code: 200, data: list });
});

// 强制下线
router.delete('/sessions/:token', authRequired, (req, res) => {
  const target = req.params.token;
  if (!target || target === req.token) {
    return res.json({ code: 400, message: '不能下线当前会话' });
  }
  const session = auth.tokens[target];
  if (!session) {
    return res.json({ code: 404, message: '会话不存在' });
  }
  // 非 superadmin 不能踢 superadmin
  if (req.user.role !== 'superadmin' && session.role === 'superadmin') {
    return res.json({ code: 403, message: '无权限下线该会话' });
  }
  // 普通用户不能踢任何人
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.json({ code: 403, message: '无权限下线会话' });
  }
  delete auth.tokens[target];
  addLog('warning', 'kick_session', `${req.user.username} 强制下线了 ${session.username} 的会话`, req.user.username, req.ip);
  res.json({ code: 200, message: '已强制下线' });
});

// 获取安全设置
router.get('/settings', authRequired, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM security_settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ code: 200, data: settings });
});

// 更新安全设置
router.put('/settings', authRequired, (req, res) => {
  const { login_max_attempts, login_lockout_minutes, session_timeout_hours } = req.body || {};
  const update = db.prepare(`
    INSERT INTO security_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  if (login_max_attempts !== undefined) update.run('login_max_attempts', String(login_max_attempts));
  if (login_lockout_minutes !== undefined) update.run('login_lockout_minutes', String(login_lockout_minutes));
  if (session_timeout_hours !== undefined) update.run('session_timeout_hours', String(session_timeout_hours));

  res.json({ code: 200, message: '保存成功' });
});

// ---- 用户管理 ----

// 用户列表
router.get('/users', authRequired, (req, res) => {
  const users = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY created_at').all();
  res.json({ code: 200, data: users });
});

// 创建用户
router.post('/users', authRequired, (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name) {
    return res.json({ code: 400, message: '用户名、密码、姓名为必填' });
  }
  if (password.length < 6) {
    return res.json({ code: 400, message: '密码至少6位' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.json({ code: 400, message: '用户名已存在' });
  }

  const id = crypto.randomUUID();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  db.prepare('INSERT INTO users (id, username, password_hash, name, role) VALUES (?,?,?,?,?)')
    .run(id, username, salt + ':' + hash, name, role || 'user');
  res.json({ code: 200, message: '用户创建成功' });
});

// 删除用户
router.delete('/users/:id', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });
  if (user.username === req.session.username) {
    return res.json({ code: 400, message: '不能删除自己' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  // 清除该用户的会话
  for (const [tk, s] of Object.entries(auth.tokens)) {
    if (s.username === user.username) delete auth.tokens[tk];
  }
  res.json({ code: 200, message: '用户已删除' });
});

// 重置用户密码
router.post('/users/:id/reset-password', authRequired, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.json({ code: 400, message: '新密码至少6位' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });

  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(salt + ':' + hash, req.params.id);

  // 清除该用户所有会话
  for (const [tk, s] of Object.entries(auth.tokens)) {
    if (s.username === user.username) delete auth.tokens[tk];
  }
  res.json({ code: 200, message: '密码已重置' });
});

// ---- 系统维护 ----

// 系统概览
router.get('/system-info', authRequired, (req, res) => {
  const dbSize = fs.existsSync(db.name)
    ? fs.statSync(db.name).size : 0;
  const uploadsSize = dirSize(path.join(PROJECT_ROOT, 'uploads'));
  const videosSize = dirSize(path.join(PROJECT_ROOT, 'videos'));
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);

  res.json({
    code: 200,
    data: {
      version: 'v2026.5.7',
      uptime: `${h}h ${m}m ${s}s`,
      dbSize: fmtBytes(dbSize),
      uploadsSize: fmtBytes(uploadsSize),
      videosSize: fmtBytes(videosSize),
      memory: `${Math.round((os.totalmem() - os.freemem()) / 1048576)}MB / ${Math.round(os.totalmem() / 1048576)}MB`,
    }
  });
});

// 创建备份
router.post('/backup', authRequired, (req, res) => {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${ts}.zip`;
    const filePath = path.join(BACKUPS_DIR, filename);
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('[backup] error:', err.message);
      res.json({ code: 500, message: '备份失败: ' + err.message });
    });

    output.on('close', () => {
      res.json({ code: 200, data: { filename, size: fmtBytes(archive.pointer()) } });
    });

    archive.pipe(output);

    // DB 文件
    const dbPath = db.name;
    if (fs.existsSync(dbPath)) archive.file(dbPath, { name: 'internal.db' });

    // .env
    const envPath = path.join(PROJECT_ROOT, '.env');
    if (fs.existsSync(envPath)) archive.file(envPath, { name: '.env' });

    // uploads 目录（压缩整个目录）
    const uploadsPath = path.join(PROJECT_ROOT, 'uploads');
    if (fs.existsSync(uploadsPath)) archive.directory(uploadsPath, 'uploads');

    archive.finalize();
  } catch (err) {
    console.error('[backup] error:', err.message);
    res.json({ code: 500, message: '备份失败' });
  }
});

// 备份列表
router.get('/backups', authRequired, (req, res) => {
  try {
    const list = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const st = fs.statSync(path.join(BACKUPS_DIR, f));
        return { filename: f, size: fmtBytes(st.size), sizeRaw: st.size, createdAt: new Date(st.mtime).toLocaleString('zh-CN') };
      })
      .sort((a, b) => b.sizeRaw - a.sizeRaw || b.createdAt.localeCompare(a.createdAt));
    res.json({ code: 200, data: list });
  } catch { res.json({ code: 200, data: [] }); }
});

// 下载备份
router.get('/backups/:name/download', authRequired, (req, res) => {
  const filePath = path.join(BACKUPS_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.json({ code: 404, message: '备份文件不存在' });
  res.download(filePath);
});

// 删除备份
router.delete('/backups/:name', authRequired, (req, res) => {
  const filePath = path.join(BACKUPS_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.json({ code: 404, message: '备份文件不存在' });
  fs.unlinkSync(filePath);
  res.json({ code: 200, message: '已删除' });
});

// 恢复备份
router.post('/backups/:name/restore', authRequired, (req, res) => {
  const filePath = path.join(BACKUPS_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.json({ code: 404, message: '备份文件不存在' });

  try {
    const zip = new AdmZip(filePath);

    // 先创建恢复前的安全备份（万一恢复出错可以回退）
    const preRestoreBackup = path.join(BACKUPS_DIR, 'pre_restore_' + Date.now() + '.zip');
    const safetyOutput = fs.createWriteStream(preRestoreBackup);
    const safetyArchive = archiver('zip', { zlib: { level: 9 } });
    safetyArchive.pipe(safetyOutput);
    const dbPath = db.name;
    if (fs.existsSync(dbPath)) safetyArchive.file(dbPath, { name: 'internal.db' });
    const uploadsPath = path.join(PROJECT_ROOT, 'uploads');
    if (fs.existsSync(uploadsPath)) safetyArchive.directory(uploadsPath, 'uploads');
    safetyArchive.finalize();

    // 关闭数据库连接
    db.close();

    // 恢复 DB
    const dbEntry = zip.getEntry('internal.db');
    if (dbEntry) {
      zip.extractEntryTo(dbEntry, path.dirname(dbPath), true, true);
    }

    // 恢复 uploads（保持目录结构，跳过 .env）
    const entries = zip.getEntries().filter(e => e.entryName.startsWith('uploads/'));
    for (const entry of entries) {
      zip.extractEntryTo(entry, PROJECT_ROOT, true, true);
    }

    // 恢复完成，退出进程让用户重启
    console.log('[restore] 恢复完成，即将退出进程。请重新启动服务。');
    res.json({ code: 200, message: '恢复成功，请重新启动服务以生效' });

    // 延迟退出，确保响应已发送
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    console.error('[restore] error:', err.message);
    // 如果 DB 还没关闭，尝试重新打开
    try {
      const Database = require('better-sqlite3');
      // db 已无法恢复，提示用户手动处理
    } catch {}
    res.json({ code: 500, message: '恢复失败: ' + err.message });
  }
});

// 离线更新（上传 ZIP）
router.post('/update-offline', authRequired, updateUpload.single('file'), async (req, res) => {
  if (req.session.role !== 'superadmin') {
    try { if (req.file) fs.unlinkSync(req.file.path); } catch {}
    return res.json({ code: 403, message: '仅超级管理员可执行更新' });
  }
  if (!req.file) {
    return res.json({ code: 400, message: '请上传 ZIP 文件' });
  }

  const zipPath = req.file.path;
  let tmpDir = '';

  try {
    // 1. 创建安全备份
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = 'pre_update_' + ts + '.zip';
    const backupPath = path.join(BACKUPS_DIR, backupName);

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', reject);
      output.on('close', resolve);
      archive.pipe(output);

      const backendDir = path.join(PROJECT_ROOT, 'backend');
      const frontendDir = path.join(PROJECT_ROOT, 'frontend');
      if (fs.existsSync(backendDir)) archive.directory(backendDir, 'backend');
      if (fs.existsSync(frontendDir)) archive.directory(frontendDir, 'frontend');

      // 根目录脚本
      for (const f of fs.readdirSync(PROJECT_ROOT)) {
        const full = path.join(PROJECT_ROOT, f);
        try { if (fs.statSync(full).isFile()) archive.file(full, { name: f }); } catch {}
      }

      archive.finalize();
    });
    console.log('[update-offline] safety backup:', backupName);

    // 2. 解压 ZIP 到临时目录，处理 GitHub 顶层目录
    tmpDir = path.join(os.tmpdir(), 'mclaw_update_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);

    // 检测并剥离顶层目录（GitHub ZIP 格式：repo-main/...）
    let srcDir = tmpDir;
    const tmpTop = fs.readdirSync(tmpDir).filter(f => !f.startsWith('.'));
    const dirs = tmpTop.filter(f => fs.statSync(path.join(tmpDir, f)).isDirectory());
    if (dirs.length === 1 && tmpTop.length === 1) {
      srcDir = path.join(tmpDir, dirs[0]);
    }

    // 3. 覆盖文件（排除敏感内容）
    const excludePrefixes = [
      'backend/.env', 'backend/data/', 'backend/uploads/', 'backend/videos/',
      'backend/backups/', 'backend/node_modules/', 'backend/server.log',
      'frontend/node_modules/', 'frontend/dist/',
    ];

    function shouldSkip(rel) {
      const n = rel.replace(/\\/g, '/');
      if (n.startsWith('.git/') || n === '.git') return true;
      return excludePrefixes.some(p => n.startsWith(p));
    }

    function copyRecursive(src, dest, baseLen) {
      for (const name of fs.readdirSync(src)) {
        const srcFull = path.join(src, name);
        const st = fs.statSync(srcFull);
        const rel = srcFull.substring(baseLen);

        if (shouldSkip(rel)) {
          console.log('[update-offline] skip:', rel);
          continue;
        }

        const destFull = path.join(dest, rel);
        if (st.isDirectory()) {
          fs.mkdirSync(destFull, { recursive: true });
          copyRecursive(srcFull, dest, baseLen);
        } else {
          fs.mkdirSync(path.dirname(destFull), { recursive: true });
          fs.copyFileSync(srcFull, destFull);
        }
      }
    }

    copyRecursive(srcDir, PROJECT_ROOT, srcDir.length + 1);
    console.log('[update-offline] files copied');

    // 4. 清理
    fs.unlinkSync(zipPath);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });

    // 5. 安装依赖 + 构建
    console.log('[update-offline] installing backend deps...');
    npmRun('npm install --production', { cwd: path.join(PROJECT_ROOT, 'backend') });
    console.log('[update-offline] installing frontend deps...');
    npmRun('npm install', { cwd: path.join(PROJECT_ROOT, 'frontend') });
    console.log('[update-offline] building frontend...');
    npmRun('npx vite build', { cwd: path.join(PROJECT_ROOT, 'frontend') });

    addLog('success', 'update', '离线升级完成，即将重启', req.session.username, req.ip);
    res.json({ code: 200, message: '离线升级完成，服务即将重启，请稍后刷新页面' });

    setTimeout(() => {
      const { spawn } = require('child_process');
      const serverPath = path.join(PROJECT_ROOT, 'backend', 'server.js');
      const child = spawn('node', [serverPath], {
        cwd: path.join(PROJECT_ROOT, 'backend'),
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      process.exit(0);
    }, 1000);

  } catch (err) {
    console.error('[update-offline] error:', err.message);
    try { if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch {}
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    res.json({ code: 500, message: '离线升级失败: ' + err.message });
  }
});

// 在线更新
const https = require('https');
const { execSync, spawnSync } = require('child_process');

// git 命令走 spawnSync，避免 Windows cmd 引号嵌套问题
function gitRun(args, opts) {
  const r = spawnSync(resolveExe('git'), args, { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 60000, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr?.trim() || `git ${args[0]} 返回 ${r.status}`);
  return r.stdout.trim();
}

// npm/npx 走 execSync（需要 shell 执行 .cmd），继承 Node 目录的 PATH
function npmRun(cmd, opts) {
  const nodeDir = path.dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir};${process.env.PATH || ''}` };
  return execSync(cmd, { stdio: 'pipe', env, ...opts });
}

router.post('/update', authRequired, (req, res) => {
  if (req.session.role !== 'superadmin') {
    return res.json({ code: 403, message: '仅超级管理员可执行更新' });
  }

  try {
    // 1. 记录当前 commit
    let oldCommit = '';
    try { oldCommit = gitRun(['rev-parse', 'HEAD']); } catch {}

    // 2. 解析远程 URL，SSH → HTTPS（公开仓库无需认证）
    let remoteUrl = '';
    try {
      remoteUrl = gitRun(['remote', 'get-url', 'origin']);
    } catch (e) {
      console.error('[update] 获取远程地址失败:', e.message);
      return res.json({ code: 500, message: '更新失败: 无法获取远程仓库地址' });
    }
    remoteUrl = remoteUrl.replace(/^git@github\.com:/, 'https://github.com/');
    console.log('[update] remote:', remoteUrl);

    // 3. git fetch + merge
    console.log('[update] git fetch...');
    gitRun(['fetch', '--depth=1', remoteUrl, 'main']);
    console.log('[update] git merge...');
    const mergeMsg = gitRun(['merge', 'FETCH_HEAD', '--ff-only']);
    console.log('[update] merge:', mergeMsg);

    // 4. 检查是否有更新
    const newCommit = gitRun(['rev-parse', 'HEAD']);
    if (oldCommit === newCommit) {
      return res.json({ code: 200, message: '已是最新版本，无需更新' });
    }

    addLog('info', 'update', `更新 ${oldCommit.slice(0, 7)} → ${newCommit.slice(0, 7)}`, req.session.username, req.ip);

    // 5. 安装依赖 + 构建前端
    console.log('[update] 安装后端依赖...');
    npmRun('npm install --production', { cwd: path.join(PROJECT_ROOT, 'backend') });
    console.log('[update] 构建前端...');
    npmRun('npm install', { cwd: path.join(PROJECT_ROOT, 'frontend') });
    npmRun('npx vite build', { cwd: path.join(PROJECT_ROOT, 'frontend') });
    console.log('[update] 构建完成');

    res.json({ code: 200, message: '更新完成，服务即将重启，请稍后刷新页面' });

    addLog('success', 'update', `更新完成 ${newCommit.slice(0, 7)}，即将重启`, req.session.username, req.ip);

    // 6. 重启
    setTimeout(() => {
      const { spawn } = require('child_process');
      const serverPath = path.join(PROJECT_ROOT, 'backend', 'server.js');
      const child = spawn('node', [serverPath], {
        cwd: path.join(PROJECT_ROOT, 'backend'),
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      process.exit(0);
    }, 1000);

  } catch (err) {
    console.error('[update] 更新失败:', err.message);
    addLog('danger', 'update', '更新失败: ' + err.message, req.session.username, req.ip);
    let msg = err.message || '未知错误';
    if (msg.includes('Permission denied') || msg.includes('could not read')) {
      msg = 'Git 认证失败，请确认已配置仓库访问权限';
    } else if (msg.includes('not a git repository')) {
      msg = '项目目录不是 Git 仓库，无法在线更新';
    }
    res.json({ code: 500, message: '更新失败: ' + msg });
  }
});

module.exports = router;
