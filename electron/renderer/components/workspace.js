const text = (value) => value === null || value === undefined ? '' : String(value);

export function createWorkspace({ tree, tabs, table, title, note, rowCount, selection, onOpen }) {
  const opened = new Map([['overview', { name: '概览', pinned: true }]]); let current = 'overview'; let snapshot; let query = '';
  for (const name of JSON.parse(localStorage.getItem('pinnedReports') || '[]')) opened.set(name, { name, pinned: true });
  const persistPins = () => localStorage.setItem('pinnedReports', JSON.stringify([...opened].filter(([key, item]) => key !== 'overview' && item.pinned).map(([key]) => key)));

  function rows(name) { return snapshot?.sheets?.[name] || []; }
  function drawTree() {
    tree.replaceChildren(); const names = Object.keys(snapshot?.sheets || {});
    for (const name of names) { const button = document.createElement('button'); button.textContent = name; button.dataset.report = name; button.classList.toggle('active', current === name); button.addEventListener('click', () => open(name)); tree.append(button); }
    return names.length;
  }
  function drawTabs() {
    tabs.replaceChildren();
    for (const [key, item] of opened) { const button = document.createElement('button'); button.className = `tab${key === current ? ' active' : ''}${item.pinned ? ' pinned' : ''}`; button.dataset.tab = key; const label = document.createElement('span'); label.textContent = item.name; const close = document.createElement('i'); close.textContent = item.pinned ? '●' : '×'; button.append(label, close); label.addEventListener('click', () => open(key)); close.addEventListener('click', (event) => { event.stopPropagation(); if (item.pinned) return; opened.delete(key); if (current === key) current = 'overview'; drawTabs(); onOpen(current); }); tabs.append(button); }
  }
  function renderTable(name) {
    const source = rows(name); const headers = source[3] || []; const bodyRows = source.slice(4).filter((row) => !query || row.some((cell) => text(cell).toLowerCase().includes(query)));
    title.textContent = name; note.textContent = text(source[1]?.[0]); rowCount.textContent = `${bodyRows.length} 行`; table.replaceChildren();
    const headerRow = document.createElement('tr'); headers.forEach((value) => { const th = document.createElement('th'); th.textContent = text(value); headerRow.append(th); }); const thead = document.createElement('thead'); thead.append(headerRow);
    const tbody = document.createElement('tbody'); bodyRows.forEach((row) => { const tr = document.createElement('tr'); row.forEach((value) => { const td = document.createElement('td'); td.textContent = text(value); tr.append(td); }); tr.addEventListener('click', () => { tbody.querySelectorAll('tr').forEach((item) => item.classList.remove('selected')); tr.classList.add('selected'); selection.replaceChildren(...row.map((value, index) => { const line = document.createElement('span'); const key = document.createElement('b'); key.textContent = `${headers[index] || index + 1}：`; line.append(key, text(value)); return line; })); }); tbody.append(tr); });
    table.append(thead, tbody);
  }
  function open(name) { current = name; if (name !== 'overview' && !opened.has(name)) opened.set(name, { name, pinned: false }); drawTree(); drawTabs(); onOpen(name); if (snapshot && name !== 'overview') renderTable(name); }
  return { setSnapshot(value) { snapshot = value; for (const key of [...opened.keys()]) if (key !== 'overview' && !value.sheets[key]) opened.delete(key); const count = drawTree(); drawTabs(); return count; }, open, current: () => current, rows, filter(value) { query = value.trim().toLowerCase(); if (current !== 'overview') renderTable(current); }, pin() { const item = opened.get(current); if (item) item.pinned = !item.pinned; persistPins(); drawTabs(); return Boolean(item?.pinned); }, reportNames: () => Object.keys(snapshot?.sheets || {}) };
}
