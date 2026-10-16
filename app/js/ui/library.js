// Exercise library (phase 3).
import { h } from './dom.js';
import { state } from '../store.js';

export function render(root) {
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'Library')),
    h('p', { class: 'muted' }, `${state.exercises.length} exercises. Editing arrives in phase 3.`));
}
