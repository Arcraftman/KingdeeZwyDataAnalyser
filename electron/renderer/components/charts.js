const svgNS = 'http://www.w3.org/2000/svg';
const number = (value) => Number(value) || 0;
const money = (value) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(number(value));

function chart(title, description, rows, definitions, style = 'line', percent = false) {
  const card = document.createElement('section'); card.className = 'chart-card';
  const heading = document.createElement('div'); const h3 = document.createElement('h3'); const note = document.createElement('p');
  h3.textContent = title; note.textContent = description; heading.append(h3, note);
  const container = document.createElement('div'); container.className = 'trend'; card.append(heading, container);
  const values = definitions.flatMap((item) => rows.map((row) => Number(row[item.key]))).filter(Number.isFinite);
  if (!rows.length || !values.length) { container.textContent = '暂无可绘制数据'; return card; }
  const width = 650; const height = 220; const left = 62; const right = 16; const top = 27; const bottom = 35;
  const min = Math.min(0, ...values); const max = Math.max(0, ...values); const span = max - min || 1;
  const x = (index) => left + (width - left - right) * (rows.length === 1 ? .5 : index / (rows.length - 1));
  const y = (value) => top + (max - value) * (height - top - bottom) / span;
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const add = (tag, attrs, content) => { const node = document.createElementNS(svgNS, tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); if (content !== undefined) node.textContent = content; svg.append(node); };
  const colors = ['#2563eb', '#d97706', '#059669'];
  for (let tick = 0; tick <= 4; tick += 1) { const value = min + span * tick / 4; const py = y(value); add('line', { x1: left, x2: width - right, y1: py, y2: py, class: 'grid' }); add('text', { x: 1, y: py + 4 }, percent ? `${(value * 100).toFixed(0)}%` : money(value)); }
  add('line', { x1: left, x2: width - right, y1: y(0), y2: y(0), class: 'axis' });
  rows.forEach((row, index) => add('text', { x: x(index), y: height - 11, 'text-anchor': 'middle' }, `${row.month.slice(5)}月`));
  definitions.forEach((definition, seriesIndex) => {
    const color = colors[seriesIndex % colors.length]; const valid = rows.map((row, index) => ({ index, value: Number(row[definition.key]) })).filter((point) => Number.isFinite(point.value));
    if (style === 'bar') { const step = (width - left - right) / Math.max(rows.length, 1); const barWidth = Math.max(3, step / (definitions.length + 1)); valid.forEach((point) => { const zero = y(0); const py = y(point.value); add('rect', { x: x(point.index) - step / 2 + barWidth * (seriesIndex + .5), y: Math.min(py, zero), width: barWidth, height: Math.abs(zero - py), fill: color }); }); }
    else add('polyline', { points: valid.map((point) => `${x(point.index)},${y(point.value)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5 });
    const lx = left + seriesIndex * 112; add('line', { x1: lx, x2: lx + 14, y1: 10, y2: 10, stroke: color, class: 'legend-dot' }); add('text', { x: lx + 19, y: 14 }, definition.name);
  });
  container.append(svg); return card;
}

export function renderCharts(container, sheetRows) {
  const rows = sheetRows('月度趋势').slice(4); const grouped = new Map();
  for (const row of rows) {
    const month = String(row[0] || ''); if (!grouped.has(month)) grouped.set(month, { month });
    const item = grouped.get(month); const label = String(row[2] || ''); const category = String(row[4] || ''); const value = number(row[3]);
    if (category) item[category] = number(item[category]) + value;
    for (const key of ['销售费用', '管理费用', '财务费用']) if (label.includes(key)) item[key] = number(item[key]) + value;
  }
  const data = [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({ ...row, 毛利润: number(row.营业收入) - number(row.营业成本), 期间费用: number(row.销售费用) + number(row.管理费用) + number(row.财务费用) }));
  let revenue = 0; let profit = 0;
  const cumulative = data.map((row) => ({ ...row, 累计收入: revenue += number(row.营业收入), 累计净利润: profit += number(row.净利润) }));
  const rates = data.map((row, index) => ({ ...row, 毛利率: row.营业收入 ? row.毛利润 / row.营业收入 : null, 净利率: row.营业收入 ? number(row.净利润) / row.营业收入 : null, 费用率: row.营业收入 ? row.期间费用 / row.营业收入 : null, 收入环比: index && data[index - 1].营业收入 > 0 ? row.营业收入 / data[index - 1].营业收入 - 1 : null }));
  container.replaceChildren(
    chart('收入与营业成本', '按月金额', data, [{ key: '营业收入', name: '营业收入' }, { key: '营业成本', name: '营业成本' }], 'bar'),
    chart('毛利润与净利润', '月度利润走势', data, [{ key: '毛利润', name: '毛利润' }, { key: '净利润', name: '净利润' }]),
    chart('期间费用构成', '销售、管理、财务费用', data, [{ key: '销售费用', name: '销售费用' }, { key: '管理费用', name: '管理费用' }, { key: '财务费用', name: '财务费用' }], 'bar'),
    chart('经营比率', '毛利率、净利率、费用率', rates, [{ key: '毛利率', name: '毛利率' }, { key: '净利率', name: '净利率' }, { key: '费用率', name: '费用率' }], 'line', true),
    chart('累计收入与净利润', '年初至当前期间', cumulative, [{ key: '累计收入', name: '累计收入' }, { key: '累计净利润', name: '累计净利润' }]),
    chart('收入环比', '本月相对上月', rates, [{ key: '收入环比', name: '收入环比' }], 'bar', true),
  );
}
