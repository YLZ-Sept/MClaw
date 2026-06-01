const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'pptx');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── 主题 ──
const THEMES = {
  business: {
    bg: 'FFFFFF', primary: '1B365D', secondary: '2D5F8A', accent: 'C4973B',
    light: 'F2F4F7', text: '2D3748', muted: '718096', white: 'FFFFFF',
    chartColors: ['1B365D', 'C4973B', '2D5F8A', '8B9DAF', 'D4A84B'],
    font: 'Microsoft YaHei'
  },
  modern: {
    bg: 'FFFFFF', primary: '3B1F78', secondary: '5B3FB8', accent: 'E85D75',
    light: 'F6F4FC', text: '1A1333', muted: '8E8CA0', white: 'FFFFFF',
    chartColors: ['3B1F78', 'E85D75', '5B3FB8', 'F4A060', '48B5A0'],
    font: 'Microsoft YaHei'
  },
  tech: {
    bg: '0D1117', primary: '1A2332', secondary: '21262D', accent: '58A6FF',
    light: '161B22', text: 'E6EDF3', muted: '8B949E', white: 'FFFFFF',
    chartColors: ['58A6FF', '3FB950', 'F0883E', 'BC8CFF', 'F85149'],
    font: 'Microsoft YaHei'
  },
  minimal: {
    bg: 'FFFFFF', primary: '111111', secondary: '333333', accent: 'E53935',
    light: 'F5F5F5', text: '1A1A1A', muted: '888888', white: 'FFFFFF',
    chartColors: ['111111', 'E53935', '666666', 'CC3333', '999999'],
    font: 'Microsoft YaHei'
  }
};

// ── 通用组件 ──

function addPageNum(slide, theme, num, total) {
  if (num === 1 || num === total) return;
  slide.addText(`${num} / ${total}`, {
    x: 8.3, y: 5.15, w: 1.3, h: 0.3,
    fontSize: 7, color: theme.muted, align: 'right', fontFace: theme.font
  });
}

function addTopBar(slide, theme, heading) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.045, fill: { color: theme.accent } });
  slide.addText(heading, {
    x: 0.65, y: 0.2, w: 8.5, h: 0.6,
    fontSize: 20, bold: true, color: theme.primary, fontFace: theme.font
  });
  slide.addShape('rect', { x: 0.65, y: 0.78, w: 0.9, h: 0.035, fill: { color: theme.accent } });
}

// ── 封面 ──
function renderCover(slide, data, theme) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: 5.63, fill: { color: theme.primary } });
  // 右侧大块装饰
  slide.addShape('rect', { x: 6.2, y: -0.8, w: 5, h: 7.2, fill: { color: theme.secondary }, rotate: 15 });
  // 底部色条
  slide.addShape('rect', { x: 0, y: 5.1, w: 10, h: 0.53, fill: { color: theme.accent } });
  // 标题
  slide.addText(data.title || '', {
    x: 1.0, y: 0.9, w: 5.4, h: 1.2,
    fontSize: 36, bold: true, color: theme.white, fontFace: theme.font, valign: 'bottom'
  });
  // 分隔短线
  slide.addShape('rect', { x: 1.0, y: 2.2, w: 0.7, h: 0.04, fill: { color: theme.accent } });
  // 副标题
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 1.0, y: 2.35, w: 5.4, h: 0.65,
      fontSize: 16, color: theme.accent, fontFace: theme.font, valign: 'top'
    });
  }
  // 演讲者 + 日期
  const meta = [];
  if (data.speaker) meta.push(data.speaker);
  if (data.date) meta.push(data.date);
  else meta.push(new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }));
  slide.addText(meta.join('    '), {
    x: 1.0, y: 4.15, w: 5, h: 0.5,
    fontSize: 11, color: theme.muted, fontFace: theme.font
  });
  // 图标
  if (data.icon) {
    slide.addText(data.icon, {
      x: 0.4, y: 3.6, w: 1, h: 0.7,
      fontSize: 34, align: 'center', color: theme.accent
    });
  }
}

// ── 章节过渡 ──
function renderSection(slide, data, theme) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: 5.63, fill: { color: theme.light } });
  // 左侧大色块
  slide.addShape('rect', { x: 0, y: 0, w: 0.12, h: 5.63, fill: { color: theme.accent } });
  const heading = data.heading || '';
  const numMatch = heading.match(/^(\d+)[\.\、\s]/);
  if (numMatch) {
    slide.addText(numMatch[1], {
      x: 0.6, y: 1.5, w: 1.6, h: 1.2,
      fontSize: 52, bold: true, color: theme.accent, fontFace: theme.font, align: 'right', valign: 'middle'
    });
    slide.addText(heading.replace(/^\d+[\.\、\s]/, ''), {
      x: 2.4, y: 1.8, w: 6.8, h: 2,
      fontSize: 28, bold: true, color: theme.primary, fontFace: theme.font, valign: 'middle'
    });
  } else {
    slide.addText(heading, {
      x: 0.8, y: 1.8, w: 8.4, h: 2,
      fontSize: 30, bold: true, color: theme.primary, fontFace: theme.font, valign: 'middle'
    });
  }
  // 底部装饰线
  slide.addShape('rect', { x: 0.12, y: 5.5, w: 9.76, h: 0.13, fill: { color: theme.primary } });
}

// ── 正文 ──
function renderContent(slide, data, theme) {
  addTopBar(slide, theme, data.heading || '');
  slide.addText(data.body || '', {
    x: 0.65, y: 1.1, w: 8.7, h: 4.0,
    fontSize: 13.5, color: theme.text, fontFace: theme.font, valign: 'top',
    lineSpacing: 28, paraSpaceAfter: 10
  });
}

// ── 要点列表 ──
function renderBullets(slide, data, theme) {
  addTopBar(slide, theme, data.heading || '');
  const items = data.items || [];
  const count = items.length;
  const startY = 1.1;
  const availH = 4.2;
  const itemH = Math.min(0.6, availH / count);

  items.forEach((item, i) => {
    const y = startY + i * itemH;
    slide.addShape('ellipse', {
      x: 0.85, y: y + itemH / 2 - 0.06, w: 0.14, h: 0.14,
      fill: { color: theme.accent }
    });
    slide.addText(item, {
      x: 1.2, y, w: 8.2, h: itemH,
      fontSize: 14, color: theme.text, fontFace: theme.font, valign: 'middle'
    });
  });
}

// ── 双列对比 ──
function renderTwoCol(slide, data, theme) {
  addTopBar(slide, theme, data.heading || '');
  const left = data.left || {};
  const right = data.right || {};

  slide.addShape('rect', { x: 4.95, y: 1.1, w: 0.02, h: 3.9, fill: { color: 'DDDDDD' } });

  const renderCol = (col, x) => {
    if (col.heading) {
      slide.addText(col.heading, {
        x, y: 1.1, w: 3.8, h: 0.5,
        fontSize: 15, bold: true, color: theme.accent, fontFace: theme.font
      });
    }
    (col.items || []).forEach((item, i) => {
      const y = 1.75 + i * 0.56;
      slide.addShape('ellipse', {
        x: x + 0.12, y: y + 0.18, w: 0.1, h: 0.1,
        fill: { color: theme.accent }
      });
      slide.addText(item, {
        x: x + 0.38, y, w: 3.4, h: 0.56,
        fontSize: 13, color: theme.text, fontFace: theme.font, valign: 'middle'
      });
    });
  };
  renderCol(left, 0.65);
  renderCol(right, 5.2);
}

// ── 图表 ──
const CHART_TYPE_MAP = {
  bar: 'bar', line: 'line', pie: 'pie', doughnut: 'doughnut',
  radar: 'radar', area: 'area'
};

function renderChart(slide, data, theme) {
  addTopBar(slide, theme, data.heading || '');
  const chartType = CHART_TYPE_MAP[data.chart_type] || 'bar';
  const categories = data.categories || [];
  const seriesData = (data.series || []).map((s, i) => ({
    name: s.name || `系列${i + 1}`,
    labels: categories,
    values: s.values || []
  }));

  const isPie = chartType === 'pie' || chartType === 'doughnut';
  const chartColors = theme.chartColors;

  const chartOpts = {
    x: 0.5, y: 1.1, w: 9, h: 3.9,
    showLegend: data.show_legend !== false,
    legendPos: 'b',
    legendFontSize: 8.5,
    legendColor: theme.muted,
    catAxisLabelColor: theme.muted,
    catAxisLabelFontSize: 8,
    valAxisLabelColor: theme.muted,
    valAxisLabelFontSize: 8,
    valGridLine: { color: 'E8E8E8', size: 0.5 },
    catGridLine: { style: 'none' },
    dataBorder: { color: 'FFFFFF', size: 1.5 },
    chartColors,
    ...(isPie ? {
      showPercent: true,
      dataLabelColor: theme.text,
      dataLabelFontSize: 10,
      showValue: true,
    } : {
      showValue: true,
      dataLabelPosition: chartType === 'bar' ? 'outEnd' : 't',
      dataLabelColor: theme.text,
      dataLabelFontSize: 9,
      valAxisFormatCode: '#,##0',
    }),
  };

  slide.addChart(chartType.toUpperCase(), seriesData, chartOpts);
}

// ── 表格 ──
function renderTable(slide, data, theme) {
  addTopBar(slide, theme, data.heading || '');
  const headers = data.headers || [];
  const rows = data.rows || [];

  const colCount = headers.length || (rows[0] ? rows[0].length : 2);
  const colW = 8.6 / colCount;

  const allRows = headers.length ? [headers.map(h => ({
    text: h, options: {
      bold: true, color: theme.white, fill: { color: theme.primary },
      fontSize: 11, fontFace: theme.font, align: 'center', valign: 'middle'
    }
  }))] : [];

  rows.forEach((row, ri) => {
    allRows.push(row.map(cell => ({
      text: String(cell),
      options: {
        fontSize: 10.5, fontFace: theme.font, color: theme.text,
        fill: { color: ri % 2 === 0 ? theme.bg : theme.light },
        align: 'left', valign: 'middle'
      }
    })));
  });

  const rowH = Math.min(0.42, 3.6 / allRows.length);
  slide.addTable(allRows, {
    x: 0.7, y: 1.1, w: 8.6,
    border: { type: 'solid', pt: 0.5, color: 'E0E0E0' },
    colW: headers.map(() => colW),
    rowH,
    autoPage: true
  });
}

// ── 时间线 ── (NEW)
function renderTimeline(slide, data, theme) {
  addTopBar(slide, theme, data.heading || '');

  const milestones = data.milestones || [];
  const count = milestones.length;
  if (count === 0) return;

  // 横向主线
  const lineY = 3.2;
  const startX = 0.7, endX = 9.3;
  slide.addShape('rect', { x: startX, y: lineY, w: endX - startX, h: 0.03, fill: { color: theme.accent } });

  milestones.forEach((m, i) => {
    const x = startX + (endX - startX) * (i / (count - 1));
    // 节点圆
    slide.addShape('ellipse', {
      x: x - 0.14, y: lineY - 0.125, w: 0.28, h: 0.28,
      fill: { color: theme.accent }
    });
    // 日期标签
    slide.addText(m.date || '', {
      x: x - 0.8, y: lineY - 0.9, w: 1.6, h: 0.35,
      fontSize: 9, bold: true, color: theme.accent, fontFace: theme.font, align: 'center'
    });
    // 标题 — 交替上下
    const above = i % 2 === 0;
    const titleY = above ? lineY - 1.4 : lineY + 0.45;
    slide.addText(m.title || '', {
      x: x - 0.9, y: titleY, w: 1.8, h: 0.35,
      fontSize: 11, bold: true, color: theme.primary, fontFace: theme.font, align: 'center'
    });
    // 描述
    if (m.desc) {
      const descY = above ? titleY + 0.35 : titleY + 0.35;
      slide.addText(m.desc, {
        x: x - 0.9, y: descY, w: 1.8, h: 0.6,
        fontSize: 8, color: theme.muted, fontFace: theme.font, align: 'center', lineSpacing: 12
      });
    }
    // 竖线连接到节点
    const connTop = above ? titleY + 0.35 + (m.desc ? 0.6 : 0) : lineY + 0.28;
    const connBot = above ? lineY - 0.28 : titleY;
    slide.addShape('rect', { x: x - 0.015, y: Math.min(connTop, connBot), w: 0.03, h: Math.abs(connBot - connTop), fill: { color: theme.accent } });
  });
}

// ── 引用页 ──
function renderQuote(slide, data, theme) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: 5.63, fill: { color: theme.primary } });
  slide.addText('"', {
    x: 0.6, y: 0.2, w: 2, h: 2,
    fontSize: 80, color: theme.accent, fontFace: 'Georgia', valign: 'top'
  });
  slide.addText(data.quote || '', {
    x: 1.5, y: 1.4, w: 7.2, h: 2.5,
    fontSize: 21, color: theme.white, fontFace: theme.font, valign: 'middle',
    lineSpacing: 38
  });
  if (data.author) {
    slide.addShape('rect', { x: 1.5, y: 4.1, w: 0.5, h: 0.03, fill: { color: theme.accent } });
    slide.addText(data.author, {
      x: 2.2, y: 3.95, w: 5, h: 0.4,
      fontSize: 12, color: theme.accent, fontFace: theme.font
    });
  }
}

// ── 图+文 ──
function renderImageText(slide, data, theme) {
  addTopBar(slide, theme, data.heading || '');
  slide.addText(data.body || '', {
    x: 0.65, y: 1.1, w: 5.2, h: 4.0,
    fontSize: 13, color: theme.text, fontFace: theme.font, valign: 'top',
    lineSpacing: 26
  });
  slide.addShape('rect', {
    x: 6.2, y: 1.1, w: 3.3, h: 3.6,
    fill: { color: theme.light }, rectRadius: 0.06
  });
  if (data.icon) {
    slide.addText(data.icon, {
      x: 6.2, y: 1.1, w: 3.3, h: 2.5,
      fontSize: 44, align: 'center', valign: 'middle', color: theme.accent
    });
  }
  if (data.emphasis) {
    slide.addText(data.emphasis, {
      x: 6.4, y: 3.0, w: 2.9, h: 1.1,
      fontSize: 13, bold: true, color: theme.primary, fontFace: theme.font,
      align: 'center', valign: 'top'
    });
  }
  if (data.image_url) {
    slide.addImage({ path: data.image_url, x: 6.2, y: 1.1, w: 3.3, h: 3.6 });
  }
}

// ── 结束页 ──
function renderEnding(slide, data, theme) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: 5.63, fill: { color: theme.primary } });
  slide.addShape('rect', { x: 3.5, y: 5.15, w: 3, h: 0.04, fill: { color: theme.accent } });
  slide.addText(data.text || '谢谢', {
    x: 1, y: 1.2, w: 8, h: 2.2,
    fontSize: 48, bold: true, color: theme.white, fontFace: theme.font, align: 'center', valign: 'middle'
  });
  if (data.subtext) {
    slide.addText(data.subtext, {
      x: 1, y: 3.2, w: 8, h: 0.8,
      fontSize: 14, color: theme.accent, fontFace: theme.font, align: 'center'
    });
  }
  slide.addText('感谢聆听  ·  欢迎提问', {
    x: 1, y: 4.2, w: 8, h: 0.5,
    fontSize: 11, color: theme.muted, fontFace: theme.font, align: 'center'
  });
}

// ── 布局注册表 ──
const RENDERERS = {
  cover: renderCover,
  section: renderSection,
  content: renderContent,
  bullets: renderBullets,
  two_col: renderTwoCol,
  chart: renderChart,
  table: renderTable,
  timeline: renderTimeline,
  quote: renderQuote,
  image_text: renderImageText,
  ending: renderEnding
};

function generatePPTX(params) {
  const { theme: themeName, slides } = params;
  const theme = THEMES[themeName] || THEMES.business;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 10, height: 5.63 });
  pptx.layout = 'WIDE';
  pptx.author = 'MClaw';
  pptx.title = (slides.find(s => s.title) || {}).title || '演示文稿';

  const total = slides.length;
  slides.forEach((slideData, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: theme.bg };
    const render = RENDERERS[slideData.layout];
    if (render) render(slide, slideData, theme);
    addPageNum(slide, theme, i + 1, total);
  });

  const filename = `${randomUUID()}.pptx`;
  const filepath = path.join(OUTPUT_DIR, filename);
  return pptx.writeFile({ fileName: filepath }).then(() => ({ filename, filepath }));
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

module.exports = { generatePPTX, THEMES };
