// IndexedDB wrapper. One database, five stores, small promise helpers.
// The preview copy (/Forge/preview/) uses its own database so it never
// touches real data.

export const STORES = ['exercises', 'sessions', 'daily', 'plans', 'settings'];
const KEYS = { exercises: 'id', sessions: 'id', daily: 'date', plans: 'id', settings: 'key' };
const SCHEMA = 1;

export function dbName() {
  return /\/preview\//.test(location.pathname) ? 'forge-preview' : 'forge';
}

/** @type {Promise<IDBDatabase> | null} */
let opening = null;

export function openDb(name = dbName()) {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, SCHEMA);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: KEYS[s] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is blocked by another open Forge tab.'));
  });
  return opening;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

/** @param {string} store */
export async function getAll(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} store @param {any[]} items */
export async function putMany(store, items) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const it of items) os.put(it);
  return done(tx);
}

/** @param {string} store @param {any} item */
export function put(store, item) { return putMany(store, [item]); }

/** @param {string} store @param {IDBValidKey} key */
export async function del(store, key) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

/**
 * Replace the contents of all stores in one transaction (used by Restore).
 * @param {Record<string, any[]>} data
 */
export async function replaceAll(data) {
  const db = await openDb();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    os.clear();
    for (const it of data[s] || []) os.put(it);
  }
  return done(tx);
}

/** Ask the browser not to evict our data under storage pressure. */
export async function persist() {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch { return false; }
}
