const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'excel');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * params: {
 *   sheets: [{
 *     name: 'Sheet1',
 *     title: '报表标题',
 *     subtitle: '副标题',
 *     columns: [{ header: '列名', key: 'field', width: 15 }],
 *     rows: [{ field1: 'v1', field2: 'v2' }],
 *     merges: [{ startRow, startCol, endRow, endCol }],
 *     chart: { type: 'bar', title: '图表标题', categories: [...], series: [{name, values}] }
 *   }],
 *   author: 'MClaw'
 * }
 */
function generateExcel(params) {
  const { sheets, author } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = author || 'MClaw';

  for (const sheetDef of sheets || []) {
    const ws = workbook.addWorksheet(sheetDef.name || 'Sheet1', {
      properties: { tabColor: { argb: sheetDef.tabColor || 'FF1B365D' } }
    });

    // 列定义
    if (sheetDef.columns) {
      ws.columns = sheetDef.columns.map(c => ({
        header: c.header || c.title || '',
        key: c.key || c.header || '',
        width: c.width || 15,
        style: { font: { name: 'Microsoft YaHei', size: 11 }, alignment: { vertical: 'middle', horizontal: c.align || 'left' } }
      }));
    }

    let currentRow = 1;

    // 标题行
    if (sheetDef.title) {
      ws.mergeCells(currentRow, 1, currentRow, (sheetDef.columns || []).length || 5);
      const titleCell = ws.getCell(currentRow, 1);
      titleCell.value = sheetDef.title;
      titleCell.font = { name: 'Microsoft YaHei', size: 18, bold: true, color: { argb: 'FF1B365D' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } };
      ws.getRow(currentRow).height = 36;
      currentRow += 2;
    }

    // 副标题
    if (sheetDef.subtitle) {
      ws.mergeCells(currentRow, 1, currentRow, (sheetDef.columns || []).length || 5);
      const subCell = ws.getCell(currentRow, 1);
      subCell.value = sheetDef.subtitle;
      subCell.font = { name: 'Microsoft YaHei', size: 11, color: { argb: 'FF718096' } };
      subCell.alignment = { vertical: 'middle', horizontal: 'center' };
      currentRow += 2;
    }

    const headerRow = currentRow;

    // 设置表头样式
    if (sheetDef.columns) {
      for (let c = 1; c <= sheetDef.columns.length; c++) {
        const cell = ws.getCell(headerRow, c);
        cell.font = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF2D5F8A' } },
          bottom: { style: 'thin', color: { argb: 'FF2D5F8A' } },
          left: { style: 'thin', color: { argb: 'FF2D5F8A' } },
          right: { style: 'thin', color: { argb: 'FF2D5F8A' } }
        };
      }
      ws.getRow(headerRow).height = 28;
      currentRow = headerRow + 1;
    }

    // 数据行
    const dataStartRow = currentRow;
    for (const row of sheetDef.rows || []) {
      if (sheetDef.columns) {
        for (let c = 0; c < sheetDef.columns.length; c++) {
          const key = sheetDef.columns[c].key || sheetDef.columns[c].header;
          const cell = ws.getCell(currentRow, c + 1);
          cell.value = row[key] !== undefined ? row[key] : '';
          cell.font = { name: 'Microsoft YaHei', size: 10.5 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
          // 斑马纹
          if ((currentRow - dataStartRow) % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FB' } };
          }
          // 数值右对齐
          if (typeof row[key] === 'number') {
            cell.alignment = { horizontal: 'right' };
          }
        }
      }
      ws.getRow(currentRow).height = 24;
      currentRow++;
    }

    const dataEndRow = currentRow - 1;

    // 合并单元格
    for (const m of sheetDef.merges || []) {
      try { ws.mergeCells(m.startRow, m.startCol, m.endRow, m.endCol); } catch {}
    }
  }

  const filename = `${randomUUID()}.xlsx`;
  const filepath = path.join(OUTPUT_DIR, filename);
  return workbook.xlsx.writeFile(filepath).then(() => ({ filename, filepath }));
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

module.exports = { generateExcel };
