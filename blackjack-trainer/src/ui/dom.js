// Minimal DOM helpers: h() builds elements, svg() builds SVG nodes.

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function applyProps(el, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' && 'value' in el) el.value = value;
    else if (key === 'checked' && 'checked' in el) el.checked = !!value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

export function replace(container, ...children) {
  container.replaceChildren();
  append(container, children);
  return container;
}

export function pct(p, digits = 1) {
  if (p === null || p === undefined || Number.isNaN(p)) return '–';
  return `${(p * 100).toFixed(digits)}%`;
}

export function chipsText(n) {
  const v = Math.round(n * 10) / 10;
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
}

let toastTimer = null;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

/** Step label used for the numbered parts of a practice round. */
export function stepLabel(n, text) {
  return h('span', { class: 'step' }, h('b', null, String(n)), text);
}
