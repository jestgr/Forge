// Today: weekly goals + start buttons (filled in phase 4–6).
import { h } from './dom.js';

export function render(root) {
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'Forge')),
    h('div', { class: 'card stack' },
      h('h2', null, 'New Forge is being built'),
      h('p', { class: 'muted' }, 'This is the preview shell (phase 1). Workouts arrive in later phases.')));
}
