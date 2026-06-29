/**
 * MClaw 后端混淆构建脚本
 * 用法：node build-obfuscate.js
 * 输出：../dist-backend/
 *
 * 混淆后需配合 npm install --production 安装依赖
 */
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const SRC = __dirname;
const DST = path.join(__dirname, '..', 'dist-backend');

// ── 排除目录（不进 dist）──
const EXCLUDE_DIRS = new Set([
  'node_modules', 'media-crawler', 'auto_douyin',
  'logs', 'browser-profile', 'videos', 'backups',
  '.git', 'dist-backend'
]);

// ── 排除文件模式 ──
const EXCLUDE_FILES = /^_|^test_|\.test\.js$|^build-obfuscate\.js$/;

// ── data 目录中不进 dist 的文件 ──
const EXCLUDE_DATA = new Set(['internal.db', 'internal.db-wal', 'internal.db-shm']);

// ── 混淆选项 ──
const OB_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 3,
  target: 'node',
  // 保持模块导出不变，确保跨文件引用不被破坏
  renameGlobals: false,
  // 不混淆 require / module.exports / __dirname 等
  reservedStrings: [
    'require', 'module', 'exports', '__dirname', '__filename',
    'process', 'console', 'Buffer', 'JSON'
  ],
  // 不混淆特定变量名（DB 表名、路由路径等）
  identifierNamesGenerator: 'mangled',
  // 不添加自防御代码（会引起 Node.js 兼容问题）
  selfDefending: false,
  // 调试保护：禁止 console.log 输出文件名
  debugProtection: false,
};

let obfuscatedCount = 0;
let copiedCount = 0;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function shouldExcludeDir(name) {
  return EXCLUDE_DIRS.has(name) || name.startsWith('.');
}

function shouldExcludeFile(name) {
  return EXCLUDE_FILES.test(name);
}

function obfuscateFile(srcPath, dstPath) {
  const code = fs.readFileSync(srcPath, 'utf8');
  let result;
  try {
    result = JavaScriptObfuscator.obfuscate(code, OB_OPTIONS);
  } catch (err) {
    console.warn(`  ⚠ 混淆失败，直接复制: ${path.relative(SRC, srcPath)} — ${err.message}`);
    fs.copyFileSync(srcPath, dstPath);
    return;
  }
  fs.writeFileSync(dstPath, result.getObfuscatedCode(), 'utf8');
  obfuscatedCount++;
  const saved = ((1 - dstPath.length / srcPath.length) * 100).toFixed(0); // not accurate, but indicative
  process.stdout.write(`  ✓ ${path.relative(SRC, srcPath)}\n`);
}

function copyFile(srcPath, dstPath) {
  fs.copyFileSync(srcPath, dstPath);
  copiedCount++;
}

function buildDir(srcDir, dstDir) {
  ensureDir(dstDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      if (shouldExcludeDir(entry.name)) continue;
      buildDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      if (shouldExcludeFile(entry.name)) continue;
      // 排除旧数据库文件
      if (srcDir.includes('data') && EXCLUDE_DATA.has(entry.name)) continue;

      if (entry.name.endsWith('.js')) {
        obfuscateFile(srcPath, dstPath);
      } else {
        copyFile(srcPath, dstPath);
      }
    }
  }
}

// ── 入口 ──
console.log(`\n🔧 MClaw 后端混淆构建\n   源: ${SRC}\n   目标: ${DST}\n`);

// 清理旧输出
if (fs.existsSync(DST)) {
  fs.rmSync(DST, { recursive: true, force: true });
}

buildDir(SRC, DST);

// 确保 data 目录存在（部署时需要）
ensureDir(path.join(DST, 'data'));
ensureDir(path.join(DST, 'uploads'));
ensureDir(path.join(DST, 'logs'));

console.log(`\n✅ 完成！混淆 ${obfuscatedCount} 个 JS 文件，复制 ${copiedCount} 个非 JS 文件`);
console.log(`   输出目录: ${DST}`);
console.log(`   部署前请执行: cd dist-backend && npm install --production\n`);
