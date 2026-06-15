const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const multer = require('multer');
const crypto = require('crypto');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const TABLE_CONFIGS = require('./io-configs');

function getDb() {
  return require('../db');
}

// 获取模板列（排除 templateExclude 的列）
function getTemplateColumns(config) {
  return config.columns.filter(c => !c.templateExclude);
}

// 生成模板 Excel Buffer
function generateTemplate(config) {
  const cols = getTemplateColumns(config);
  const headers = cols.map(c => c.header);
  const example = cols.map(c => {
    if (c.field === 'clock_type') return 'in';
    if (c.field === 'status') return 'active';
    if (c.field === 'enabled') return 1;
    return '示例';
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = cols.map(c => ({ wch: c.width || 15 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 导出数据 Excel Buffer
function generateExport(config, rows) {
  const cols = config.columns;
  const headers = cols.map(c => c.header);
  const data = [headers];
  for (const row of rows) {
    data.push(cols.map(c => {
      let val = row[c.field];
      if (val === null || val === undefined) return '';
      return val;
    }));
  }
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = cols.map(c => ({ wch: c.width || 15 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 解析上传的 Excel，返回对象数组
function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// FK 解析：将 display 值转为 key 值
function resolveFK(db, fkConfig, displayValue) {
  if (!displayValue || String(displayValue).trim() === '') return null;
  const val = String(displayValue).trim();
  const row = db.prepare(
    `SELECT ${fkConfig.key} FROM ${fkConfig.table} WHERE ${fkConfig.display} = ?`
  ).get(val);
  return row ? row[fkConfig.key] : null;
}

// 反向 FK：将 key 值转为 display 值（用于导出）
function reverseFK(db, fkConfig, keyValue) {
  if (!keyValue) return '';
  const row = db.prepare(
    `SELECT ${fkConfig.display} FROM ${fkConfig.table} WHERE ${fkConfig.key} = ?`
  ).get(keyValue);
  return row ? row[fkConfig.display] : '';
}

// 特殊值转换（如 clock_type）
function transformImportValue(field, value) {
  if (field === 'clock_type') {
    const v = String(value).trim();
    if (v === '上班' || v === '签到' || v === 'in') return 'in';
    if (v === '下班' || v === '签退' || v === 'out') return 'out';
    return v;
  }
  return value;
}

// ====================== 路由 ======================

// 下载导入模板
router.get('/:key/template', (req, res) => {
  const config = TABLE_CONFIGS[req.params.key];
  if (!config) return res.status(404).json({ code: 404, message: '未知的导出配置: ' + req.params.key });
  const buf = generateTemplate(config);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(req.params.key + '_模板.xlsx')}`,
  });
  res.send(buf);
});

// 导出全部数据
router.get('/:key/export', (req, res) => {
  const config = TABLE_CONFIGS[req.params.key];
  if (!config) return res.status(404).json({ code: 404, message: '未知的导出配置: ' + req.params.key });

  const db = getDb();
  let rows;

  // 考勤月报特殊处理
  if (req.params.key === 'attendance_monthly') {
    const { year, month } = req.query;
    const y = year || new Date().getFullYear();
    const m = month || (new Date().getMonth() + 1);
    const prefix = `${y}-${String(m).padStart(2, '0')}`;
    const records = db.prepare(`
      SELECT e.name AS employee_name, cr.clock_type, cr.clock_time
      FROM clock_records cr JOIN employees e ON cr.employee_id = e.id
      WHERE cr.clock_time LIKE ? ORDER BY e.name, cr.clock_time
    `).all(`${prefix}%`);

    const map = {};
    for (const r of records) {
      if (!map[r.employee_name]) map[r.employee_name] = { employee_name: r.employee_name, in_times: [], out_times: [] };
      if (r.clock_type === 'in') map[r.employee_name].in_times.push(r.clock_time);
      else map[r.employee_name].out_times.push(r.clock_time);
    }
    const data = [['员工', '上班打卡', '下班打卡']];
    for (const v of Object.values(map)) {
      data.push([v.employee_name, v.in_times.join('; '), v.out_times.join('; ')]);
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('考勤月报_' + prefix + '.xlsx')}`,
    });
    return res.send(buf);
  }

  // 查询数据
  try {
    rows = db.prepare(`SELECT * FROM ${config.table} ORDER BY created_at DESC`).all();
  } catch (e) {
    // 尝试不带 created_at
    try { rows = db.prepare(`SELECT * FROM ${config.table}`).all(); } catch (e2) {
      return res.status(500).json({ code: 500, message: '查询失败: ' + e2.message });
    }
  }

  // 解析 FK 显示值
  for (const col of config.columns) {
    if (col.fk) {
      for (const row of rows) {
        row[col.field] = reverseFK(db, col.fk, row[col.field]);
      }
    }
  }

  const buf = generateExport(config, rows);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(req.params.key + '_数据.xlsx')}`,
  });
  res.send(buf);
});

// 导入解析（上传文件 → 返回预览数据）
router.post('/:key/import', upload.single('file'), (req, res) => {
  const config = TABLE_CONFIGS[req.params.key];
  if (!config) return res.status(404).json({ code: 404, message: '未知的导入配置: ' + req.params.key });
  if (config.exportOnly) return res.status(400).json({ code: 400, message: '该模块仅支持导出' });
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' });

  const db = getDb();
  const cols = getTemplateColumns(config);
  let rawRows;

  try {
    rawRows = parseExcel(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ code: 400, message: '文件解析失败: ' + e.message });
  }

  if (rawRows.length === 0) {
    return res.json({ code: 200, data: { columns: cols.map(c => ({ field: c.field, header: c.header })), rows: [], validCount: 0 } });
  }

  // 建立列映射：Excel 表头 → config 字段
  const headerMap = {};
  for (const col of cols) {
    headerMap[col.header] = col;
  }

  const previewRows = [];
  let validCount = 0;

  for (const rawRow of rawRows) {
    const preview = { _valid: true, _errors: [], _data: {} };
    for (const col of cols) {
      let val = rawRow[col.header];
      if (val === undefined || val === '') val = '';
      val = transformImportValue(col.field, val);

      if (col.required && String(val).trim() === '') {
        preview._valid = false;
        preview._errors.push(`"${col.header}"为必填`);
      }

      // FK 解析
      if (col.fk && String(val).trim() !== '') {
        const resolved = resolveFK(db, col.fk, val);
        if (resolved) {
          preview._data[col.field] = resolved;
          preview._data[`_${col.field}_display`] = String(val).trim();
        } else {
          preview._valid = false;
          preview._errors.push(`"${col.header}"值"${val}"未找到匹配记录`);
          preview._data[col.field] = '';
        }
      } else {
        preview._data[col.field] = String(val).trim();
      }
    }
    if (preview._valid) validCount++;
    previewRows.push(preview);
  }

  res.json({
    code: 200,
    data: {
      columns: cols.map(c => ({ field: c.field, header: c.header })),
      rows: previewRows,
      validCount,
      total: previewRows.length,
    },
  });
});

// 批量导入
router.post('/:key/batch', (req, res) => {
  const config = TABLE_CONFIGS[req.params.key];
  if (!config) return res.status(404).json({ code: 404, message: '未知的导入配置: ' + req.params.key });
  if (config.exportOnly) return res.status(400).json({ code: 400, message: '该模块仅支持导出' });

  const { rows } = req.body || {};
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ code: 400, message: '没有可导入的数据' });
  }

  const db = getDb();
  const cols = getTemplateColumns(config);
  let imported = 0;
  const errors = [];

  const insertStmt = db.prepare(`
    INSERT INTO ${config.table} (id, ${cols.map(c => c.field).join(', ')}, created_at)
    VALUES (?, ${cols.map(() => '?').join(', ')}, datetime('now','localtime'))
  `);

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const rowData = rows[i];
      try {
        const id = crypto.randomUUID();
        const values = cols.map(c => {
          let val = rowData[c.field];
          if (val === undefined || val === null) return '';
          return val;
        });
        insertStmt.run(id, ...values);
        imported++;
      } catch (e) {
        errors.push(`第${i + 1}行: ${e.message}`);
      }
    }
  });

  try {
    tx();
  } catch (e) {
    return res.status(500).json({ code: 500, message: '批量导入失败: ' + e.message });
  }

  // FAQ 导入后重建索引
  if (req.params.key === 'faq') {
    try { require('../agents/vector-search').invalidate(); } catch {}
  }

  res.json({
    code: 200,
    data: {
      imported,
      total: rows.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
});

module.exports = router;
