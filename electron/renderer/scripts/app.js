import { renderCharts } from '../components/charts.js';
import { createWorkspace } from '../components/workspace.js';
import { createCommands } from '../components/commands.js';

const $ = (selector) => document.querySelector(selector);
const company = $('#company'); const month = $('#month'); const refresh = $('#refresh'); const login = $('#open-login');
const progress = $('#login-progress'); const message = $('#message'); const empty = $('#empty-state');
const views = { overview: $('#overview-view'), report: $('#report-view'), recent: $('#recent-view'), settings: $('#settings-view') };
let snapshot; let restoreTimer; month.value = new Date().toISOString().slice(0, 7);
const preferences = JSON.parse(localStorage.getItem('preferences') || '{"autoRestore":true,"showInspector":true}');
$('#auto-restore').checked = preferences.autoRestore !== false; $('#show-inspector').checked = preferences.showInspector !== false; $('#inspector').hidden = preferences.showInspector === false;

const workspace = createWorkspace({ tree: $('#report-tree'), tabs: $('#tab-strip'), table: $('#table'), title: $('#report-title'), note: $('#report-note'), rowCount: $('#row-count'), selection: $('#inspector-selection'), onOpen: show });
const money = (value) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value) || 0);
const sheetRows = (name) => snapshot?.sheets?.[name] || [];
function setMessage(value, error = false) { message.textContent = value; message.classList.toggle('error', error); }
function setProgress(value, label, detail) { progress.hidden = false; $('#progress-value').style.width = `${value}%`; $('#progress-label').textContent = label; $('#progress-detail').textContent = detail; }
function setState(running) { $('#service-state').textContent = running ? '已连接' : '未连接'; $('#service-state').classList.toggle('offline', !running); $('#bottom-status').textContent = running ? '● 已连接账无忧本机服务' : '● 本机服务未连接'; $('#sidebar-connection').textContent = running ? '已连接 · 本机只读' : '未连接'; $('#inspector-status').textContent = running ? '本机服务已连接，所有远端访问均为只读。' : '本机服务未运行。'; }
function show(name) {
  Object.values(views).forEach((view) => { view.hidden = true; }); let key = name;
  if (name === 'overview') views.overview.hidden = false; else if (name === 'recent') views.recent.hidden = false; else if (name === 'settings') views.settings.hidden = false; else { views.report.hidden = false; key = 'reports'; }
  empty.hidden = Boolean(snapshot) || ['recent', 'settings'].includes(name); $('#inspector-view').textContent = name; $('#breadcrumb').textContent = `财务工作台 / ${name}`; $('#view-title').textContent = name === 'overview' ? '财务分析' : name;
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === key));
}
function metric(category) { return sheetRows('利润表').slice(4).filter((row) => String(row[5] || '') === category).reduce((sum, row) => sum + (Number(row[2]) || 0), 0); }
function renderOverview() {
  const cash = sheetRows('出纳账').slice(4).filter((row) => String(row[12] || '') !== '内部划转'); const auxiliary = sheetRows('往来余额').slice(4);
  const inflow = cash.reduce((sum, row) => sum + (Number(row[8]) || 0), 0); const outflow = cash.reduce((sum, row) => sum + (Number(row[9]) || 0), 0);
  const values = [['营业收入', metric('营业收入')], ['营业成本', metric('营业成本')], ['净利润', metric('净利润')], ['凭证分录', `${Math.max(0, sheetRows('凭证明细').length - 4)} 条`]];
  $('#summary').replaceChildren(...values.map(([label, value]) => { const card = document.createElement('article'); const span = document.createElement('span'); const strong = document.createElement('strong'); span.textContent = label; strong.textContent = typeof value === 'number' ? money(value) : value; card.append(span, strong); return card; }));
  const receivable = auxiliary.filter((row) => row[0] === '应收').reduce((sum, row) => sum + (Number(row[8]) || 0) - (Number(row[9]) || 0), 0); const payable = auxiliary.filter((row) => row[0] === '应付').reduce((sum, row) => sum + (Number(row[9]) || 0) - (Number(row[8]) || 0), 0);
  const metrics = [['现金流入', inflow], ['现金流出', outflow], ['现金净流入', inflow - outflow], ['应收净额', receivable], ['应付净额', payable]];
  $('#metrics').replaceChildren(...metrics.map(([label, value]) => { const card = document.createElement('article'); const span = document.createElement('span'); const strong = document.createElement('strong'); span.textContent = label; strong.textContent = money(value); card.append(span, strong); return card; }));
  $('#dashboard-month').textContent = `${snapshot.month} · 人民币元`; renderCharts($('#charts'), sheetRows);
}
function saveRecent() { const values = JSON.parse(localStorage.getItem('recentAnalyses') || '[]'); const item = { company: company.value, name: company.selectedOptions[0]?.textContent || company.value, month: month.value, at: new Date().toISOString() }; localStorage.setItem('recentAnalyses', JSON.stringify([item, ...values.filter((row) => row.company !== item.company || row.month !== item.month)].slice(0, 12))); renderRecents(); }
function renderRecents() { const values = JSON.parse(localStorage.getItem('recentAnalyses') || '[]'); $('#recent-list').replaceChildren(...values.map((item) => { const row = document.createElement('button'); row.className = 'recent-item'; const label = document.createElement('span'); label.textContent = item.name; const date = document.createElement('small'); date.textContent = `${item.month} · ${new Date(item.at).toLocaleString('zh-CN')}`; row.append(label, date); row.addEventListener('click', () => { company.value = item.company; month.value = item.month; refresh.click(); }); return row; })); }
function acceptSnapshot(value) { snapshot = value; const count = workspace.setSnapshot(value); $('#report-count').textContent = count; renderOverview(); workspace.open('overview'); $('#empty-state').hidden = true; $('#inspector-company').textContent = company.selectedOptions[0]?.textContent || value.company; $('#inspector-month').textContent = value.month; $('#refreshed-at').textContent = `刷新于 ${new Date(value.refreshed_at).toLocaleString('zh-CN')}`; $('#bottom-refreshed').textContent = $('#refreshed-at').textContent; saveRecent(); }
async function loadCompanies() { const result = await window.desktop.companies(); const items = Array.isArray(result.companies) ? result.companies : []; company.replaceChildren(...items.map((item) => { const option = document.createElement('option'); option.value = item.key; option.textContent = `${item.name} (${item.key})`; return option; })); company.disabled = !items.length; refresh.disabled = !items.length; $('#sidebar-company').textContent = items[0]?.name || '账无忧'; return items.length; }
async function restore() { setProgress(15, '正在检查本地登录状态', '优先复用有效账套会话'); const result = await window.desktop.restoreSession(); if (!result.restored) { setProgress(100, '需要登录账无忧', '完成一次授权后将自动恢复'); setMessage('登录状态不可用，请登录账无忧。'); return; } setProgress(85, '登录状态已恢复', '正在加载账套'); setState(true); await loadCompanies(); setProgress(100, '准备就绪', '账套会话有效'); setTimeout(() => { progress.hidden = true; }, 700); setMessage('请选择月份并刷新数据。'); }

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { const view = button.dataset.view; if (view === 'overview') workspace.open('overview'); else if (view === 'reports') { const first = workspace.reportNames()[0]; if (first) workspace.open(first); else show('reports'); } else show(view); if (view === 'recent') renderRecents(); }));
$('#new-analysis').addEventListener('click', () => { workspace.open('overview'); month.focus(); });
login.addEventListener('click', async () => { await window.desktop.openLogin(); setProgress(50, '等待登录完成', '授权成功后自动继续'); clearInterval(restoreTimer); restoreTimer = setInterval(async () => { const result = await window.desktop.restoreSession(); if (result.restored) { clearInterval(restoreTimer); await restore(); } }, 2000); });
refresh.addEventListener('click', async () => { refresh.disabled = true; document.body.classList.add('loading'); setMessage('正在读取并核对财务数据…'); try { acceptSnapshot(await window.desktop.refresh(company.value, month.value)); setMessage('数据已刷新。'); } catch (error) { setMessage(String(error), true); } finally { refresh.disabled = false; document.body.classList.remove('loading'); } });
company.addEventListener('change', () => { const label = company.selectedOptions[0]?.textContent || '账无忧'; $('#sidebar-company').textContent = label.replace(/\s*\(company_\d+\)$/, ''); $('#inspector-company').textContent = label; }); $('#table-search').addEventListener('input', (event) => workspace.filter(event.target.value)); $('#pin-tab').addEventListener('click', (event) => { event.currentTarget.textContent = workspace.pin() ? '★' : '☆'; });
function savePreferences() { localStorage.setItem('preferences', JSON.stringify({ autoRestore: $('#auto-restore').checked, showInspector: $('#show-inspector').checked })); }
$('#auto-restore').addEventListener('change', savePreferences); $('#show-inspector').addEventListener('change', (event) => { $('#inspector').hidden = !event.target.checked; savePreferences(); }); $('#clear-recents').addEventListener('click', () => { localStorage.removeItem('recentAnalyses'); renderRecents(); });
createCommands({ dialog: $('#command-palette'), input: $('#command-input'), results: $('#command-results'), trigger: $('#command-trigger'), commands: (query) => {
  const base = [{ label: '刷新当前分析', hint: 'Ctrl R', run: () => refresh.click() }, { label: '打开概览', run: () => workspace.open('overview') }, { label: '打开最近分析', run: () => show('recent') }, { label: '打开设置', run: () => show('settings') }, ...workspace.reportNames().map((name) => ({ label: `打开 ${name}`, hint: '报表', run: () => workspace.open(name) }))];
  if (!query || !snapshot) return base;
  const matches = [];
  for (const [name, rows] of Object.entries(snapshot.sheets)) {
    const headers = rows[3] || [];
    rows.slice(4).forEach((row, index) => { if (matches.length >= 20 || !row.some((cell) => String(cell ?? '').toLowerCase().includes(query))) return; const preview = row.map((cell, column) => `${headers[column] || column + 1}: ${cell ?? ''}`).slice(0, 3).join(' · '); matches.push({ label: `${name} · 第 ${index + 1} 行`, hint: preview, searchResult: true, run: () => { workspace.open(name); $('#table-search').value = query; workspace.filter(query); } }); });
  }
  return [...base, ...matches];
} });
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') { event.preventDefault(); refresh.click(); } });
show('overview'); renderRecents();
if ($('#auto-restore').checked) restore().catch((error) => { setState(false); setProgress(100, '恢复失败', '请重新登录'); setMessage(String(error), true); });
else { setProgress(100, '自动恢复已关闭', '可在设置中重新开启'); setMessage('点击“登录账无忧”或在设置中开启自动恢复。'); }
