export function createCommands({ dialog, input, results, trigger, commands }) {
  const render = () => {
    const query = input.value.trim().toLowerCase(); const items = commands(query).filter((item) => !query || item.searchResult || `${item.label} ${item.hint || ''}`.toLowerCase().includes(query)); results.replaceChildren();
    if (!items.length) { const empty = document.createElement('p'); empty.className = 'tree-empty'; empty.textContent = '没有匹配的命令或报表'; results.append(empty); return; }
    items.forEach((item, index) => { const button = document.createElement('button'); button.className = `command-item${index === 0 ? ' active' : ''}`; const label = document.createElement('span'); label.textContent = item.label; const hint = document.createElement('small'); hint.textContent = item.hint || ''; button.append(label, hint); button.addEventListener('click', () => { dialog.close(); item.run(); }); results.append(button); });
  };
  const open = () => { render(); dialog.showModal(); input.value = ''; input.focus(); };
  trigger.addEventListener('click', open); input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') results.querySelector('.command-item')?.click(); });
  document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); } if (event.key === 'Escape' && dialog.open) dialog.close(); });
}
