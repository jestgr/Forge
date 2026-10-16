// Tiny DOM helpers: element builder, icons, bottom sheets, toast, confirm.

/**
 * Build an element. props: class, text, html, on{Event} handlers, data-*, aria-*, style, any attribute.
 * Children: nodes, strings, numbers, arrays; null/false/undefined are skipped.
 * @param {string} tag
 * @param {Record<string, any>|null} [props]
 * @param {...any} kids
 * @returns {HTMLElement}
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && !k.includes('-') && typeof v !== 'string') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false || kid === true) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

// Stroke icons (24x24 viewBox), drawn inline so they work offline.
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-11',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  back: 'M15 18l-6-6 6-6',
  video: 'M3 6h12v12H3zM15 10l6-4v12l-6-4',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM21 21l-5-5',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  info: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM12 16v-5M12 8h.01',
};

/** @param {keyof typeof PATHS} name */
export function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', PATHS[name]);
  svg.append(p);
  return svg;
}

// ---------- sheets ----------
// Each open sheet pushes a history entry, so the phone's Back button closes
// the top sheet instead of leaving the app.

/** @type {{overlay: HTMLElement, render: () => void, onClose?: () => void}[]} */
const sheets = [];
// history.back() is asynchronous: while our own "back" is in flight, a new
// sheet's history entry is held and pushed once that back has landed.
let pendingBacks = 0;
let heldPushes = 0;

function pushEntry() {
  if (pendingBacks > 0) heldPushes++;
  else history.pushState({ sheet: true }, '');
}

window.addEventListener('popstate', () => {
  if (pendingBacks > 0) {
    pendingBacks--;
    if (pendingBacks === 0) for (; heldPushes > 0; heldPushes--) history.pushState({ sheet: true }, '');
    return;
  }
  const top = sheets.pop();
  if (top) { top.overlay.remove(); top.onClose?.(); }
});

/**
 * Open a bottom sheet. `build(close)` returns the sheet's content; it is called
 * again by `refreshSheets()` (e.g. after data changes).
 * @param {(close: () => void) => Node | Node[]} build
 * @param {{full?: boolean, onClose?: () => void, label?: string}} [opts]
 */
export function openSheet(build, opts = {}) {
  const sheet = h('div', { class: 'sheet' + (opts.full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label || null });
  const overlay = h('div', { class: 'overlay' }, sheet);
  const entry = { overlay, render: () => {}, onClose: opts.onClose };
  const close = () => {
    const i = sheets.indexOf(entry);
    if (i === -1) return;
    sheets.splice(i, 1);
    overlay.remove();
    entry.onClose?.();
    if (heldPushes > 0) { heldPushes--; return; } // its entry was never pushed
    pendingBacks++;
    history.back();
  };
  entry.render = () => {
    const scroll = sheet.scrollTop;
    sheet.replaceChildren(...[opts.full ? null : h('div', { class: 'sheet-grip' }), build(close)].flat().filter(Boolean));
    sheet.scrollTop = scroll;
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  sheets.push(entry);
  pushEntry();
  entry.render();
  document.getElementById('layers').append(overlay);
  return close;
}

export function refreshSheets() { for (const s of sheets) s.render(); }
export function sheetOpen() { return sheets.length > 0; }

/** Standard sheet header: title + close button. */
export function sheetHead(title, close, ...extra) {
  return h('div', { class: 'sheet-head' },
    h('h2', { class: 'grow' }, title),
    ...extra,
    h('button', { class: 'icon-btn sm', 'aria-label': 'Close', onclick: close }, icon('x')));
}

// ---------- toast & confirm ----------
let toastTimer = 0;
export function toast(msg, ms = 2600) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), ms);
}

/**
 * @param {string} title
 * @param {string} body
 * @param {{ok?: string, cancel?: string, danger?: boolean}} [o]
 * @returns {Promise<boolean>}
 */
export function confirmSheet(title, body, o = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v, close) => { answered = true; close(); resolve(v); };
    openSheet((close) => h('div', { class: 'stack' },
      h('h2', null, title),
      body ? h('p', { class: 'muted' }, body) : null,
      h('div', { class: 'grid-2', style: { marginTop: '8px' } },
        h('button', { class: 'btn', onclick: () => done(false, close) }, o.cancel || 'Cancel'),
        h('button', { class: 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'), onclick: () => done(true, close) }, o.ok || 'OK'))),
    { onClose: () => { if (!answered) resolve(false); } });
  });
}

/** Single/multi toggle chips bound to a value. */
export function chips(options, selected, onToggle, cls = 'chip') {
  return options.map(([value, label]) => h('button', {
    type: 'button', class: cls, 'aria-pressed': String(selected.includes(value)),
    onclick: () => onToggle(value),
  }, label));
}
