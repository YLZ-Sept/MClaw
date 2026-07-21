// Data Export Plugin — 数据导出为 CSV/JSON
const fs = require('fs');
const path = require('path');

const manifest = {
  name: 'data-export',
  version: '0.2.0',
  description: '数据导出工具: 审计日志/工具指标/记忆导出为 CSV 或 JSON',

  tools: [
    {
      name: 'export_data',
      description: '导出系统数据（审计日志、工具指标、Agent 记忆）为 CSV 或 JSON 文件',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: '数据类型: audit|metrics|memory' },
          format: { type: 'string', description: '导出格式: csv|json', default: 'csv' },
          agent_id: { type: 'string', description: 'Agent ID（仅 memory 需要）' }
        },
        required: ['type']
      },
      handler: async (args) => {
        const exportType = args.type;
        const format = args.format || 'csv';
        const exportDir = path.join(__dirname, '..', 'data', 'exports');
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

        let rows = [];
        let filename = '';

        if (exportType === 'audit') {
          const { queryAudit } = require('../services/audit');
          rows = queryAudit({ limit: 5000 });
          filename = `audit_${_dateStr()}.${format}`;
        } else if (exportType === 'metrics') {
          const { recent } = require('../services/tool-metrics');
          rows = recent(5000);
          filename = `metrics_${_dateStr()}.${format}`;
        } else if (exportType === 'memory') {
          const { readMemoryFile } = require('../services/memory');
          const agentId = args.agent_id || 'internal-agent';
          rows = [{ agentId, content: readMemoryFile(agentId) }];
          filename = `memory_${agentId}_${_dateStr()}.${format}`;
        } else {
          return { error: `不支持的数据类型: ${exportType}。支持: audit, metrics, memory` };
        }

        const filePath = path.join(exportDir, filename);
        let content = '';

        if (format === 'csv' && rows.length > 0) {
          const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
          content = '﻿' + keys.join(',') + '\n'; // BOM for Excel
          content += rows.map(r => keys.map(k => {
            const v = r[k];
            if (v === null || v === undefined) return '';
            const s = String(v).replace(/"/g, '""');
            return s.includes(',') || s.includes('\n') ? `"${s}"` : s;
          }).join(',')).join('\n');
        } else {
          content = JSON.stringify(rows, null, 2);
        }

        fs.writeFileSync(filePath, content, 'utf8');
        const stat = fs.statSync(filePath);

        return {
          success: true,
          type: exportType,
          format,
          filename,
          path: filePath,
          rows: rows.length,
          size: Math.round(stat.size / 1024) + ' KB'
        };
      }
    }
  ]
};

function _dateStr() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
}

module.exports = { manifest };
