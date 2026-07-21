// 极简测试运行器 — 无外部依赖，纯 Node.js
const path = require('path');
const fs = require('fs');

const tests = [];
let passed = 0;
let failed = 0;
const failures = [];

global.test = function (name, fn) {
  tests.push({ name, fn, file: _currentFile });
};

global.assert = {
  equal(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  deepEqual(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg || `deep equal failed`); },
  ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); },
  throws(fn, msg) { try { fn(); throw new Error(msg || 'expected throw'); } catch (e) { if (e.message === (msg || 'expected throw')) throw e; } },
  isNull(v, msg) { if (v !== null && v !== undefined) throw new Error(msg || `expected null, got ${v}`); },
  includes(str, sub, msg) { if (!str.includes(sub)) throw new Error(msg || `expected "${sub}" in "${str.slice(0, 80)}"`); },
  gt(a, b, msg) { if (!(a > b)) throw new Error(msg || `expected ${a} > ${b}`); },
  gte(a, b, msg) { if (!(a >= b)) throw new Error(msg || `expected ${a} >= ${b}`); }
};

let _currentFile = '';

async function runFile(filePath) {
  _currentFile = path.basename(filePath);
  const startLen = tests.length;
  require(filePath);
  const fileTests = tests.slice(startLen);

  console.log(`\n${_currentFile}:`);
  for (const t of fileTests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${t.name}`);
      console.log(`    ${e.message}`);
      failed++;
      failures.push({ file: _currentFile, name: t.name, error: e.message });
    }
  }
}

(async () => {
  console.log('MClaw Tests\n' + '='.repeat(50));

  const testDir = __dirname;
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();

  for (const f of files) {
    await runFile(path.join(testDir, f));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  ${passed} passed, ${failed} failed, ${tests.length} total`);

  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ${f.file} > ${f.name}: ${f.error}`));
  }

  process.exit(failed > 0 ? 1 : 0);
})();
