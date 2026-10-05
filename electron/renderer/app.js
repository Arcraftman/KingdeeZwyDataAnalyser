const api = window.financeDesktop;
const navItems = [
  ['overview', '财务总览'],
  ['利润表', '利润表'], ['资产负债表', '资产负债表'], ['现金流量表', '现金流量表'],
  ['科目余额', '科目余额'], ['凭证明细', '凭证明细'], ['出纳账', '出纳账'],
  ['往来余额', '往来余额'], ['月度趋势', '月度趋势'], ['年度分析数据', '年度分析数据'],
  ['刷新信息', '刷新信息'], ['公司列表', '公司列表'],
];
const state = { sheets: new Map(), active: 'overview', month: '' };
const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const svgNS = 'http://www.w3.org/2000/svg';

function notice(message, isError = false) {
  const box = $('notice');
  box.textContent = message;
  box.className = message ? 'notice visible' + (isError ? ' error' : '') : 'notice';
}

function setBusy(value) {
  $('refresh').disabled = value;
  $('refresh').textContent = value ? '正在读取…' : '刷新数据';
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function parseSnapshot(payload) {
  if (!payload || payload.schema !== '2' ||
      payload.company !== $('company').value ||
      payload.month !== $('month').value ||
      !payload.sheets || typeof payload.sheets !== 'object' ||
      Array.isArray(payload.sheets)) {
    throw new Error('财务快照版本、账套或月份与请求不符');
  }
  const sheets = new Map(Object.entries(payload.sheets));
  for (const [name, rows] of sheets) {
    if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row))) {
      throw new Error('财务快照工作表格式无效：' + name);
    }
  }
  const info = sheets.get('刷新信息');
  if (!info) throw new Error('财务快照缺少刷新信息');
  const fields = new Map(info.slice(4).map((row) => [row[0], row[1]]));
  if (fields.get('schema') !== '2' ||
      fields.get('company') !== payload.company ||
      fields.get('month') !== payload.month) {
    throw new Error('财务快照内容与请求不符');
  }
  return sheets;
}

function renderNavigation() {
  const navigation = $('navigation');
  for (const [key, label] of navItems) {
    const button = element('button', label);
    button.type = 'button';
    button.dataset.key = key;
    button.addEventListener('click', () => selectView(key));
    navigation.append(button);
  }
}

function selectView(key) {
  state.active = key;
  for (const button of $('navigation').children) {
    button.classList.toggle('active', button.dataset.key === key);
  }
  const overview = key === 'overview';
  $('overview').classList.toggle('hidden', !overview);
  $('report-view').classList.toggle('hidden', overview);
  $('page-title').textContent = overview ? '财务总览' : key;
  $('page-subtitle').textContent = overview ? '当前账套的经营情况与月度趋势。' : '查看本次刷新取得的原始报表数据。';
  if (overview) renderOverview();
  else renderReport();
}

function metricValue(category) {
  const rows = state.sheets.get('利润表') || [];
  const values = rows.slice(4).filter((row) => row[5] === category && typeof row[2] === 'number');
  return values.length ? values.reduce((sum, row) => sum + row[2], 0) : null;
}

function renderOverview() {
  const cards = $('metric-cards');
  cards.replaceChildren();
  const info = new Map((state.sheets.get('刷新信息') || []).slice(4).map((row) => [row[0], row[1]]));
  const metrics = [
    ['营业收入', metricValue('营业收入'), '元'],
    ['营业成本', metricValue('营业成本'), '元'],
    ['净利润', metricValue('净利润'), '元'],
    ['凭证数量', info.get('voucher_count') ?? null, '张'],
  ];
  for (const [label, value, unit] of metrics) {
    const card = element('div', undefined, 'card');
    card.append(element('div', label, 'label'));
    const line = element('div', value === null ? '—' : money.format(value), 'value');
    line.append(element('span', unit, 'unit'));
    card.append(line);
    cards.append(card);
  }
  $('period-pill').textContent = state.month || '未选择月份';
  $('snapshot-note').textContent = info.get('company_name')
    ? info.get('company_name') + ' · ' + state.month
    : '登录并刷新后显示指标。';
  renderTrend();
}

function svgNode(name, attrs = {}) {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function renderTrend() {
  const host = $('trend-chart');
  host.replaceChildren();
  const rows = (state.sheets.get('月度趋势') || []).slice(4);
  const months = [...new Set(rows.map((row) => row[0]).filter(Boolean))].sort();
  if (!months.length) {
    host.className = 'chart-empty';
    host.textContent = '暂无月度趋势数据';
    return;
  }
  host.className = '';
  const series = [
    ['营业收入', '#17a58c'], ['营业成本', '#5795df'], ['净利润', '#e2a558'],
  ];
  const values = series.map(([category]) => months.map((month) =>
    rows.filter((row) => row[0] === month && row[4] === category && typeof row[3] === 'number')
      .reduce((sum, row) => sum + row[3], 0)
  ));
  const all = values.flat();
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const width = 1000, height = 260, left = 58, right = 28, top = 18, bottom = 42;
  const x = (index) => left + index * (width - left - right) / Math.max(1, months.length - 1);
  const y = (value) => top + (max - value) * (height - top - bottom) / (max - min || 1);
  const svg = svgNode('svg', { viewBox: '0 0 1000 260', class: 'chart-svg', role: 'img', 'aria-label': '月度利润趋势' });
  for (let tick = 0; tick <= 4; tick++) {
    const value = min + (max - min) * tick / 4;
    const yy = y(value);
    svg.append(svgNode('line', { x1: left, y1: yy, x2: width - right, y2: yy, stroke: '#e9eef3' }));
    const label = svgNode('text', { x: left - 8, y: yy + 4, 'text-anchor': 'end', fill: '#91a0ae', 'font-size': 11 });
    label.textContent = Math.abs(value) >= 10000 ? (value / 10000).toFixed(0) + '万' : value.toFixed(0);
    svg.append(label);
  }
  months.forEach((month, index) => {
    const label = svgNode('text', { x: x(index), y: height - 10, 'text-anchor': 'middle', fill: '#91a0ae', 'font-size': 11 });
    label.textContent = month.slice(5) + '月';
    svg.append(label);
  });
  series.forEach(([, color], index) => {
    const points = values[index].map((value, i) => x(i) + ',' + y(value)).join(' ');
    svg.append(svgNode('polyline', { points, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    values[index].forEach((value, i) => svg.append(svgNode('circle', { cx: x(i), cy: y(value), r: 3.5, fill: color })));
  });
  host.append(svg);
}

function renderReport() {
  const rows = state.sheets.get(state.active) || [];
  $('report-title').textContent = state.active;
  $('report-note').textContent = rows[1]?.[0] || '刷新数据后显示报表。';
  const headers = rows[3] || [];
  const term = $('filter').value.trim().toLowerCase();
  const data = rows.slice(4).filter((row) => !term || row.some((value) => String(value ?? '').toLowerCase().includes(term)));
  $('row-count').textContent = Math.max(rows.length - 4, 0) + ' 行';
  $('display-count').textContent = data.length > 500 ? '显示前 500 行，请使用搜索缩小范围' : '显示 ' + data.length + ' 行';
  const table = $('report-table');
  table.replaceChildren();
  if (!headers.length) {
    const tr = element('tr');
    const td = element('td', '尚无数据，先选择账套和月份并刷新。', 'empty-row');
    tr.append(td);
    table.append(tr);
    return;
  }
  const head = element('thead');
  const heading = element('tr');
  headers.forEach((name) => heading.append(element('th', String(name ?? ''))));
  head.append(heading);
  table.append(head);
  const body = element('tbody');
  for (const row of data.slice(0, 500)) {
    const tr = element('tr');
    headers.forEach((_, column) => {
      const value = row[column];
      tr.append(element('td', typeof value === 'number' ? money.format(value) : String(value ?? ''), typeof value === 'number' ? 'number' : ''));
    });
    body.append(tr);
  }
  table.append(body);
}

async function updateStatus() {
  const result = await api.status();
  const status = $('service-status');
  status.classList.toggle('online', result.available && result.desktopReady);
  status.lastElementChild.textContent = !result.available ? '本地服务未连接'
    : result.desktopReady ? '本地服务已连接' : '服务版本较旧，请重启';
}

async function loadCompanies() {
  const companies = await api.companies();
  const select = $('company');
  const previous = select.value;
  select.replaceChildren(element('option', companies.length ? '选择账套' : '请先登录账无忧'));
  select.firstChild.value = '';
  companies.forEach(({ key, name }) => {
    const option = element('option', name + ' · ' + key);
    option.value = key;
    select.append(option);
  });
  if (companies.some((row) => row.key === previous)) select.value = previous;
  else if (companies.length === 1) select.value = companies[0].key;
}

async function refresh() {
  const company = $('company').value;
  const month = $('month').value;
  if (!company || !month) {
    notice('请先选择账套和月份。', true);
    return;
  }
  setBusy(true);
  notice('正在读取并核对财务数据，完成前会保留当前显示。');
  try {
    const payload = await api.snapshot(company, month);
    const sheets = parseSnapshot(payload);
    state.sheets = sheets;
    state.month = month;
    $('filter').value = '';
    selectView(state.active);
    notice('刷新完成。数据仅来自已授权账套的只读接口。');
    await updateStatus();
  } catch (error) {
    notice('刷新失败，保留上次数据：' + error.message, true);
  } finally {
    setBusy(false);
  }
}

async function init() {
  renderNavigation();
  const now = new Date();
  $('month').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  selectView('overview');
  $('refresh').addEventListener('click', refresh);
  $('filter').addEventListener('input', renderReport);
  $('login').addEventListener('click', async () => {
    try {
      await api.login();
      notice('登录窗口已打开。完成网页登录后，返回这里选择账套并刷新。');
      setTimeout(() => { updateStatus().catch(() => {}); loadCompanies().catch(() => {}); }, 15000);
    } catch (error) { notice(error.message, true); }
  });
  $('start-service').addEventListener('click', async () => {
    try {
      await api.startService();
      notice('已请求启动本地服务，请稍候。');
      setTimeout(() => { updateStatus().catch(() => {}); loadCompanies().catch(() => {}); }, 1500);
    } catch (error) { notice(error.message, true); }
  });
  try {
    await updateStatus();
    await loadCompanies();
  } catch (error) {
    notice(error.message, true);
  }
}

init();
