// Minimal browser stand-in for UI smoke tests (just enough DOM, history,
// storage and IndexedDB for Forge's screens). Not a real browser.

class ClassList {
  constructor(el) { this.el = el; }
  get list() { return (this.el.className || '').split(/\s+/).filter(Boolean); }
  add(...c) { this.el.className = [...new Set([...this.list, ...c])].join(' '); }
  remove(...c) { this.el.className = this.list.filter((x) => !c.includes(x)).join(' '); }
  contains(c) { return this.list.includes(c); }
  toggle(c, force) { const on = force ?? !this.contains(c); if (on) this.add(c); else this.remove(c); return on; }
}

class Node {
  constructor() { this.childNodes = []; this.parentNode = null; this.listeners = {}; }
  get parentElement() { return this.parentNode; }
  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes.filter((n) => n instanceof Element); }
  get childElementCount() { return this.children.length; }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new Text(n) : n;
      node.parentNode?.removeChild(node);
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  removeChild(n) { this.childNodes = this.childNodes.filter((x) => x !== n); n.parentNode = null; }
  replaceChildren(...nodes) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; this.append(...nodes); }
  remove() { this.parentNode?.removeChild(this); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  dispatch(type, extra = {}) {
    const ev = { type, target: this, currentTarget: this, stopPropagation() {}, preventDefault() {}, ...extra };
    for (const fn of this.listeners[type] || []) fn(ev);
    return ev;
  }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
}
class Text extends Node { constructor(t) { super(); this.data = t; } get textContent() { return this.data; } set textContent(v) { this.data = v; } }

class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.className = '';
    this.style = { setProperty() {} };
    this.classList = new ClassList(this);
    this.value = '';
    this.files = null;
    this.scrollTop = 0;
    this.type = '';
    this.href = '';
    this.disabled = false;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'value') this.value = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  set innerHTML(v) { this.replaceChildren(new Text(String(v))); }
  click() { this.dispatch('click'); }
  focus() {}
  querySelectorAll(sel) { return all(this).filter((e) => matches(e, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function all(root) { return root.children.flatMap((c) => [c, ...all(c)]); }
function matches(e, sel) {
  if (sel.startsWith('.')) return sel.slice(1).split('.').every((c) => e.classList.contains(c));
  if (sel.startsWith('#')) return e.attributes.id === sel.slice(1);
  return e.tagName === sel.toUpperCase();
}

/** Find elements whose text includes `text` (buttons, links…). */
export function byText(root, text, tag = null) {
  return all(root).filter((e) => (!tag || e.tagName === tag.toUpperCase()) && e.textContent.includes(text));
}

// ---------- fake IndexedDB (in memory, async like the real one) ----------
function fakeIndexedDB() {
  const dbs = {};
  const later = (fn) => setTimeout(fn, 0);
  return {
    open(name) {
      const req = {};
      later(() => {
        const fresh = !dbs[name];
        const stores = dbs[name] ||= {};
        const db = {
          objectStoreNames: { contains: (s) => !!stores[s] },
          createObjectStore(s, { keyPath }) { stores[s] = { keyPath, rows: new Map() }; },
          transaction(names) {
            const tx = {};
            tx.objectStore = (s) => {
              const st = stores[s];
              return {
                getAll() { const r = {}; later(() => { r.result = [...st.rows.values()].map((x) => structuredClone(x)); r.onsuccess?.(); }); return r; },
                put(v) { st.rows.set(v[st.keyPath], structuredClone(v)); },
                delete(k) { st.rows.delete(k); },
                clear() { st.rows.clear(); },
              };
            };
            later(() => tx.oncomplete?.());
            return tx;
          },
        };
        req.result = db;
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

/** @param {{ path?: string, localData?: Record<string, string> }} [o] */
export function installFakeDom({ path = '/Forge/preview/', localData = {} } = {}) {
  const body = new Element('body');
  const html = new Element('html');
  const byId = {};
  for (const id of ['app', 'screen', 'session-bar', 'nav', 'layers']) { const e = new Element('div'); e.setAttribute('id', id); byId[id] = e; body.append(e); }
  const winListeners = {};
  /** @type {Record<string, string>} */
  const store = { ...localData };
  const loc = { hash: '', pathname: path, reload() {} };
  const g = /** @type {any} */ (globalThis);
  g.Node = Node;
  g.document = {
    body, documentElement: html, hidden: false,
    createElement: (t) => new Element(t),
    createElementNS: (_ns, t) => new Element(t),
    createTextNode: (t) => new Text(t),
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    addEventListener() {},
  };
  const hist = [];
  g.history = {
    pushState(s) { hist.push(s); },
    back() { hist.pop(); setTimeout(() => (winListeners.popstate || []).forEach((f) => f({})), 0); },
  };
  g.window = g;
  g.addEventListener = (t, fn) => { (winListeners[t] ||= []).push(fn); };
  g.scrollTo = () => {};
  g.scrollY = 0;
  Object.defineProperty(g, 'location', { value: loc, configurable: true, writable: true });
  g.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  Object.defineProperty(g, 'navigator', { value: { storage: null, vibrate: () => true }, configurable: true, writable: true });
  g.indexedDB = fakeIndexedDB();
  g.URL.createObjectURL = () => 'blob:x';
  g.URL.revokeObjectURL = () => {};
  g.setHash = (h) => { loc.hash = h; (winListeners.hashchange || []).forEach((f) => f({})); };
  return { body, byId, localStorage: store };
}

export const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
