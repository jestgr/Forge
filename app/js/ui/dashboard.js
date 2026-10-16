// Today: start buttons (weekly goals are added in phase 6).
import { h, icon } from './dom.js';
import { openStartSheet } from './session.js';

export function render(root) {
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'Forge')),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-primary btn-big', onclick: openStartSheet }, icon('play'), 'Begin next session')));
}
