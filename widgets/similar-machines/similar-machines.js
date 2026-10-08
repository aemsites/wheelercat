import { getMetadata, loadCSS } from '../../scripts/aem.js';
import { loadUsedEquipmentIndex, parsePrice } from '../../scripts/scripts.js';
import { createEquipmentCard } from '../../blocks/cards/cards.js';

/**
 * Load the section heading and existing PLP card copy.
 * @param {string} lang - Document language
 * @returns {Promise<Object>} Combined localized widget copy
 */
async function loadWidgetCopy(lang) {
  const responses = await Promise.all([
    fetch(new URL('./similar-machines.json', import.meta.url)),
    fetch(new URL('../plp/plp.json', import.meta.url)),
  ]);
  if (responses.some((response) => !response.ok)) return {};
  const dictionaries = await Promise.all(responses.map((response) => response.json()));
  return Object.assign({}, ...dictionaries.map((data) => data[lang] || data.en || {}));
}

/**
 * Normalize a content path for category matching and self-exclusion.
 * @param {string} path - Content URL or path
 * @returns {string} Pathname without trailing slashes
 */
function normalizePath(path) {
  return new URL(path, window.location.href).pathname.replace(/\/+$/, '');
}

/**
 * Select up to four same-category machines without mutating the shared index.
 * @param {Object[]} rows - Cached used-equipment index
 * @param {Object} context - Current path, category, model, and price
 * @returns {Object[]} Ranked, distinct recommendation rows
 */
export function selectSimilarMachines(rows, context) {
  const seen = new Set();
  const currentPrice = parsePrice(context.price);
  return rows.filter((row) => {
    if (!row.path || !row.path.startsWith('/used-equipment/')) return false;
    const path = normalizePath(row.path);
    const segments = path.split('/').filter(Boolean);
    if (segments.length !== 3 || segments[1] !== context.equipment
      || path === context.path || seen.has(path)) return false;
    seen.add(path);
    return true;
  }).sort((left, right) => {
    const leftModel = context.model && left.model === context.model ? 0 : 1;
    const rightModel = context.model && right.model === context.model ? 0 : 1;
    if (leftModel !== rightModel) return leftModel - rightModel;
    const leftPrice = parsePrice(left.price);
    const rightPrice = parsePrice(right.price);
    if (leftPrice === null) return rightPrice === null ? 0 : 1;
    if (rightPrice === null) return -1;
    if (currentPrice === null) return 0;
    return Math.abs(leftPrice - currentPrice) - Math.abs(rightPrice - currentPrice);
  }).slice(0, 4);
}

/**
 * Decorate recommendations after the used PDP's critical section has loaded.
 * @param {HTMLElement} widget - Widget root
 */
export default async function decorate(widget) {
  widget.hidden = true;
  const path = normalizePath(window.location.pathname);
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'used-equipment' || segments.length !== 3) return;
  try {
    const lang = (document.documentElement.lang || 'en').split('-')[0];
    const [rows, copy] = await Promise.all([loadUsedEquipmentIndex(), loadWidgetCopy(lang)]);
    if (!copy.heading || !copy.viewDetails) return;
    const current = rows.find((row) => row.path && normalizePath(row.path) === path);
    const context = {
      path,
      equipment: segments[1],
      model: widget.dataset.model || (current && current.model) || getMetadata('model'),
      price: (current && current.price) || getMetadata('price'),
    };
    const machines = selectSimilarMachines(rows, context);
    if (!machines.length) return;
    await loadCSS(`${window.hlx.codeBasePath}/blocks/cards/cards.css`);
    widget.querySelector('[data-copy="heading"]').textContent = copy.heading;
    const cards = widget.querySelector('.cards');
    cards.classList.add(`cols-${machines.length}`);
    cards.querySelector('ul').append(...machines.map((row) => createEquipmentCard(row, copy, 3)));
    widget.hidden = false;
  } catch (_) {
    widget.hidden = true;
  }
}
