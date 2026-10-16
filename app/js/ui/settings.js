// Settings: backup / restore, goals, plan, about.
import { h } from './dom.js';
import { state } from '../store.js';
import { VERSION } from '../version.js';
import { dbName } from '../platform/db.js';

export function render(root) {
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'Settings')),
    h('div', { class: 'card stack' },
      h('h3', null, 'About'),
      h('p', { class: 'muted small' }, `Version ${VERSION} · database “${dbName()}”`),
      h('p', { class: 'muted small' }, state.settings.persisted
        ? 'Storage is protected from automatic clean-up.'
        : 'Storage may be cleared by the browser if the phone runs low on space — keep backups.')));
}
