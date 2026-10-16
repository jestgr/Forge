// History + calendar (phase 6).
import { h } from './dom.js';
import { state } from '../store.js';

export function render(root) {
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'History')),
    h('p', { class: 'muted' }, `${state.sessions.length} sessions saved.`));
}
