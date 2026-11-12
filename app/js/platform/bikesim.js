// Bike simulator (Settings → Bike simulator): a stand-in for the native EchelonBike plugin with the same
// methods and events. It sends real Echelon packets, so decoding, live view, chart and saving are all
// exercised without the bike — also in the browser. "Simulate dropout" tests reconnecting.
import { echelonCommand } from '../core/bike.js';

const RESISTANCES = [10, 14, 18, 22, 14];

/** @param {{ tickMs?: number }} [o] tickMs = real milliseconds per simulated second (tests use a small one). */
export function createBikeSim({ tickMs = 1000 } = {}) {
  /** @type {Record<string, Set<Function>>} */
  const listeners = { data: new Set(), state: new Set() };
  const emit = (/** @type {string} */ ev, /** @type {any} */ e) => listeners[ev]?.forEach((fn) => fn(e));
  let connected = false;
  let streaming = false;
  let timer = /** @type {any} */ (null);
  // The "console": counts from its own start and keeps counting through a dropout, like the real bike.
  let sec = 0;
  let dist100 = 0; // 0.01 km
  let resistance = RESISTANCES[0];

  function step() {
    sec++;
    const stopped = sec % 180 >= 170; // a 10-second pause every 3 minutes
    const cadence = stopped ? 0 : Math.round(82 + 8 * Math.sin(sec / 20) + (Math.random() * 4 - 2));
    dist100 += (cadence * 0.3) / 3600 * 100; // ~0.3 km/h per rpm
    const r = RESISTANCES[Math.floor(sec / 45) % RESISTANCES.length];
    if (!streaming) return;
    if (r !== resistance) { resistance = r; emit('data', { value: [...echelonCommand(0xd2, [r])] }); }
    const d = Math.floor(dist100);
    emit('data', { value: [...echelonCommand(0xd1, [sec >> 8, sec & 0xff, d >>> 24, (d >> 16) & 0xff, (d >> 8) & 0xff, d & 0xff, 0, cadence, 0])] });
  }

  return {
    name: 'ECH-SIM',
    async addListener(/** @type {string} */ ev, /** @type {Function} */ fn) {
      listeners[ev]?.add(fn);
      return { remove: async () => { listeners[ev]?.delete(fn); } };
    },
    async connect() {
      emit('state', { state: 'scanning' });
      await new Promise((r) => setTimeout(r, Math.min(300, tickMs)));
      connected = true;
      emit('state', { state: 'connected', name: 'ECH-SIM' });
      if (!timer) timer = setInterval(step, tickMs);
      return { name: 'ECH-SIM' };
    },
    async write(/** @type {{ value: number[] }} */ o) {
      if (!connected) throw new Error('Not connected');
      if (o.value[1] === 0xb0) { streaming = true; emit('data', { value: [...echelonCommand(0xd2, [resistance])] }); }
    },
    async disconnect() {
      connected = false;
      streaming = false;
      clearInterval(timer);
      timer = null;
    },
    /** Pretend the Bluetooth link dropped (the console keeps counting). */
    drop() {
      connected = false;
      streaming = false;
      emit('state', { state: 'disconnected', error: 'simulated dropout' });
    },
  };
}
