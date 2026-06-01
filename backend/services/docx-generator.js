const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
  AlignmentType, BorderStyle, WidthType, ShadingType, ImageRun } = require('docx');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'docx');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * params: {
 *   title: '文档标题',
 *   author: 'MClaw',
 *   sections: [{
 *     heading: '章节标题',
 *     level: 1,         // 1-3
 *     paragraphs: ['段落文字', '段落2'],
 *     bullets: ['要点1', '要点2'],
 *     table: { headers: [...], rows: [[...]] }
 *   }],
 *   footer: '页脚文字'
 * }
 */
function generateDocx(params) {
  const { title, author, sections, footer } = params;

  const children = [];

  // 大标题
  children.push(new Paragraph({
    text: title || '文档',
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 }
  }));

  // 分隔线
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '1B365D', space: 8 } },
    spacing: { after: 400 }
  }));

  // 各章节
  for (const section of sections || []) {
    const level = section.level || 1;
    const headingLevel = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;

    // 章节标题
    children.push(new Paragraph({
      text: section.heading || '',
      heading: headingLevel,
      spacing: { before: 300, after: 150 }
    }));

    // 段落
    for (const para of section.paragraphs || []) {
      children.push(new Paragraph({
        children: [new TextRun({ text: para, size: 22, font: 'Microsoft YaHei' })],
        spacing: { after: 120, line: 360 }
      }));
    }

    // 要点
    for (const bullet of section.bullets || []) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `• ${bullet}`, size: 22, font: 'Microsoft YaHei' })],
        spacing: { after: 80 },
        indent: { left: 600 }
      }));
    }

    // 表格
    if (section.table) {
      const headers = section.table.headers || [];
      const rows = section.table.rows || [];

      const tableRows = [];
      if (headers.length) {
        tableRows.push(new TableRow({
          tableHeader: true,
          children: headers.map(h => new TableCell({
            shading: { type: ShadingType.SOLID, color: '1B365D' },
            children: [new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20, font: 'Microsoft YaHei' })],
              alignment: AlignmentType.CENTER
            })]
          }))
        }));
      }

      for (const row of rows) {
        tableRows.push(new TableRow({
          children: row.map(cell => new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: String(cell || ''), size: 20, font: 'Microsoft YaHei' })]
            })]
          }))
        }));
      }

      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows
      }));
    }
  }

  // 页脚
  if (footer) {
    children.push(new Paragraph({
      text: footer,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 8 } }
    }));
  }

  const doc = new Document({
    creator: author || 'MClaw',
    title: title || 'MClaw Document',
    sections: [{ children }]
  });

  const filename = `${randomUUID()}.docx`;
  const filepath = path.join(OUTPUT_DIR, filename);
  return Packer.toBuffer(doc).then(buffer => {
    fs.writeFileSync(filepath, buffer);
    return { filename, filepath };
  });
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

module.exports = { generateDocx };
