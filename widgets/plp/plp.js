import { toClassName } from '../../scripts/aem.js';

/**
 * Load widget copy from the widget's local JSON (same name as the script).
 * @param {string} lang - Language key (e.g. en)
 * @returns {Promise<Object>} Copy for that language (flat key-value)
 */
async function loadWidgetCopy(lang) {
  const scriptPath = new URL(import.meta.url).pathname;
  const jsonPath = scriptPath.replace(/\.js$/, '.json');
  const url = `${window.hlx?.codeBasePath || ''}${jsonPath}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return {};
    const data = await resp.json();
    const key = data[lang] ? lang : 'en';
    return data[key] || {};
  } catch (_) {
    return {};
  }
}

/**
 * Hydrate all [data-copy] elements from widget copy.
 * @param {HTMLElement} container - Widget root element
 * @param {Object} copy - Widget copy for the current language
 */
function hydrateCopy(container, copy) {
  container.querySelectorAll('[data-copy]').forEach((el) => {
    const value = copy[el.dataset.copy];
    if (!value) return;
    const target = el.dataset.copyTarget;
    if (target) {
      target.split(',').forEach((attr) => el.setAttribute(attr.trim(), value));
    } else el.textContent = value;
  });
}

/**
 * Fetch JSON from a URL, returning an empty data array on failure.
 * @param {string} url - Full URL to fetch
 * @returns {Promise<Object>}
 */
async function fetchIndexJson(url) {
  const resp = await fetch(url);
  return resp.ok ? resp.json() : { data: [] };
}

/**
 * Derive a human-readable equipment type label from the second path segment.
 * @param {string} path - Content path (e.g. /used-equipment/compact-track-loaders/item-slug)
 * @returns {string} Title-cased type string, or empty string if not derivable
 */
function getEquipmentType(path) {
  if (!path) return '';
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return '';
  return segments[1].split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse a price string to a numeric value.
 * @param {string} str - Price string (e.g. "$409,000")
 * @returns {number|null} Numeric value, or null if not parseable
 */
function parsePrice(str) {
  if (!str) return null;
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : null;
}

/**
 * Populate the equipment filter select with unique types derived from index rows.
 * @param {HTMLSelectElement} select - The equipment filter select element
 * @param {Array<Object>} rows - Raw index rows
 */
function populateEquipmentFilter(select, rows) {
  const types = [...new Set(rows.map((row) => getEquipmentType(row.path)).filter(Boolean))].sort();
  types.forEach((type) => {
    const option = document.createElement('option');
    option.value = toClassName(type);
    option.textContent = type;
    select.appendChild(option);
  });
}

/**
 * Populate the model filter select with unique models, optionally filtered by equipment type.
 * @param {HTMLSelectElement} select - The model filter select element
 * @param {Array<Object>} rows - Raw index rows
 * @param {string} [type] - Equipment type to filter by; empty string shows all
 */
function populateModelFilter(select, rows, type = '') {
  select.innerHTML = '<option value=""></option>';
  const filtered = type
    ? rows.filter((row) => toClassName(getEquipmentType(row.path)) === type)
    : rows;
  const models = [...new Set(filtered.map((row) => row.model).filter(Boolean))].sort();
  models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  });
}

/**
 * Normalize a location string to "Title Case City, STATE" format.
 * @param {string} str - Raw location string (e.g. "salt lake city, ut")
 * @returns {string} Normalized location string
 */
function normalizeLocation(str) {
  if (!str) return str;
  const [city, state] = str.split(',');
  if (!state) return str;
  const normalizedCity = city.trim().split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return `${normalizedCity}, ${state.trim().toUpperCase()}`;
}

/**
 * Create a styled checkbox label element.
 * @param {string} labelText - Visible label text
 * @param {string} [value] - Checkbox value attribute
 * @returns {HTMLLabelElement}
 */
function createCheckbox(labelText, value) {
  const label = document.createElement('label');
  label.append(labelText);
  const input = document.createElement('input');
  input.type = 'checkbox';
  if (value !== undefined) input.value = value;
  const span = document.createElement('span');
  span.className = 'checkbox';
  label.prepend(input, span);
  return label;
}

/**
 * Populate the dealer fieldset with a checkbox per unique location in the index.
 * @param {HTMLFieldSetElement} fieldset - The dealers fieldset element
 * @param {Array<Object>} rows - Raw index rows
 * @param {Object} copy - Widget copy for the current language
 */
function populateDealerFilter(fieldset, rows, copy) {
  const legend = fieldset.querySelector('legend');
  fieldset.innerHTML = '';
  if (legend) fieldset.appendChild(legend);

  const counts = new Map();
  rows.forEach((row) => {
    const loc = normalizeLocation(row.location);
    if (loc && /[a-zA-Z]/.test(loc)) counts.set(loc, (counts.get(loc) ?? 0) + 1);
  });

  const ul = document.createElement('ul');
  fieldset.appendChild(ul);

  const allLabel = createCheckbox(copy.allDealers || 'All Dealers');
  const allInput = allLabel.querySelector('input');
  const allItem = document.createElement('li');
  allItem.appendChild(allLabel);
  ul.appendChild(allItem);

  const locationInputs = [];
  [...counts.keys()].sort().forEach((location) => {
    const label = createCheckbox(`${location} (${counts.get(location)})`, location);
    const input = label.querySelector('input');
    const li = document.createElement('li');
    li.appendChild(label);
    ul.appendChild(li);
    locationInputs.push(input);
  });

  allInput.addEventListener('change', () => {
    locationInputs.forEach((cb) => { cb.checked = allInput.checked; });
  });

  locationInputs.forEach((cb) => {
    cb.addEventListener('change', () => {
      const checkedCount = locationInputs.filter((i) => i.checked).length;
      allInput.checked = checkedCount === locationInputs.length;
      allInput.indeterminate = checkedCount > 0 && checkedCount < locationInputs.length;
    });
  });
}

/**
 * Set min/max bounds and default value on a range input.
 * @param {HTMLInputElement} input - The range input element
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} defaultValue - Initial handle position
 */
function setRangeBounds(input, min, max, defaultValue) {
  input.min = min;
  input.max = max;
  input.value = defaultValue;
  input.setAttribute('aria-valuemin', min);
  input.setAttribute('aria-valuemax', max);
  input.setAttribute('aria-valuenow', defaultValue);
}

/**
 * Bind a range input to its sibling description element, updating on change.
 * @param {HTMLInputElement} input - The range input element
 * @param {Function} [format] - Optional formatter applied to each displayed value
 */
function bindRangeDesc(input, format = (v) => v) {
  const desc = document.getElementById(`${input.id}-desc`);
  if (!desc) return;
  const update = () => {
    desc.textContent = input.value === input.min
      ? format(input.min)
      : `${format(input.min)} – ${format(input.value)}`;
    input.setAttribute('aria-valuenow', input.value);
    const fill = Math.round(((input.value - input.min) / (input.max - input.min)) * 100);
    input.style.setProperty('--fill', `${fill}%`);
  };
  update();
  input.addEventListener('input', update);
}

/**
 * Build and wire all sidebar filters from the index.
 * @param {HTMLElement} widget - Widget container element
 * @param {Array<Object>} rows - Raw index rows
 * @param {Object} copy - Widget copy for the current language
 */
function buildFilters(widget, rows, copy) {
  const equipmentSelect = widget.querySelector('#filter-equipment');
  const modelSelect = widget.querySelector('#filter-model');
  const dealerFieldset = widget.querySelector('#filter-dealer');
  const priceInput = widget.querySelector('#filter-price');
  const yearInput = widget.querySelector('#filter-year');
  const hoursInput = widget.querySelector('#filter-hours');

  populateEquipmentFilter(equipmentSelect, rows);
  populateModelFilter(modelSelect, rows);
  populateDealerFilter(dealerFieldset, rows, copy);

  const prices = rows.map((row) => parsePrice(row.price)).filter((n) => n !== null);
  const years = rows.map((row) => parseInt(row.year, 10)).filter(Number.isFinite);
  const hours = rows.map((row) => parseInt(row.hours, 10)).filter(Number.isFinite);

  if (prices.length && priceInput) {
    const [minPrice, maxPrice] = [Math.min(...prices), Math.max(...prices)];
    setRangeBounds(priceInput, minPrice, maxPrice, maxPrice / 2);
    bindRangeDesc(priceInput, (v) => `$${Number(v).toLocaleString('en-US')}`);
  }
  if (years.length && yearInput) {
    const [minYear, maxYear] = [Math.min(...years), Math.max(...years)];
    setRangeBounds(yearInput, minYear, maxYear, maxYear);
    bindRangeDesc(yearInput);
  }
  if (hours.length && hoursInput) {
    const [minHours, maxHours] = [Math.min(...hours), Math.max(...hours)];
    setRangeBounds(hoursInput, minHours, maxHours, maxHours / 2);
    bindRangeDesc(hoursInput);
  }

  equipmentSelect.addEventListener('change', () => {
    populateModelFilter(modelSelect, rows, equipmentSelect.value);
  });
}

/**
 * Fetch and cache the used-equipment query index.
 * @returns {Promise<Array<Object>>} Raw index rows
 */
async function loadIndex() {
  if (window.plpIndex) return window.plpIndex;

  if (!window.plpIndexPromise) {
    window.plpIndexPromise = (async () => {
      const base = window.hlx?.codeBasePath || '';
      const json = await fetchIndexJson(`${base}/used-equipment/query-index.json`);
      const rows = Array.isArray(json.data) ? json.data : [];
      window.plpIndex = rows;
      return rows;
    })();
  }

  return window.plpIndexPromise;
}

const ITEMS_PER_PAGE = 12;

/**
 * Create a result card element for a single index row.
 * @param {Object} row - Raw index row
 * @returns {HTMLLIElement}
 */
function createResultCard(row) {
  const li = document.createElement('li');
  li.textContent = row.title || row.path;
  return li;
}

/**
 * Render one page of results into the results list.
 * @param {HTMLUListElement} element - .results list element
 * @param {Array<Object>} results - Full result set
 * @param {number} page - Current page (1-based)
 */
function displayResults(element, results, page) {
  element.innerHTML = '';
  const start = (page - 1) * ITEMS_PER_PAGE;
  results.slice(start, start + ITEMS_PER_PAGE)
    .forEach((row) => element.append(createResultCard(row)));
}

/**
 * Render pagination controls into the nav element.
 * @param {HTMLElement} element - Pagination nav element
 * @param {number} totalResults - Total number of results
 * @param {number} page - Current page number (1-based)
 */
function displayPagination(element, totalResults, page) {
  if (!element) return;
  const pageNum = parseInt(page, 10) || 1;
  const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE);
  const prevBtn = element.querySelector('button:first-child');
  const nextBtn = element.querySelector('button:last-child');
  const pagesList = element.querySelector('ol');

  pagesList.innerHTML = '';

  if (totalPages <= 1) {
    element.hidden = true;
    return;
  }

  element.hidden = false;

  prevBtn.disabled = pageNum <= 1;
  if (pageNum > 1) prevBtn.dataset.page = pageNum - 1;
  else delete prevBtn.dataset.page;

  nextBtn.disabled = pageNum >= totalPages;
  if (pageNum < totalPages) nextBtn.dataset.page = pageNum + 1;
  else delete nextBtn.dataset.page;

  const ellipsis = () => {
    const li = document.createElement('li');
    li.classList.add('ellipsis');
    li.setAttribute('aria-hidden', true);
    li.textContent = '…';
    return li;
  };

  const pageItem = (num, current = false) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button';
    btn.textContent = num;
    btn.dataset.page = num;
    if (current) btn.setAttribute('aria-current', 'page');
    li.appendChild(btn);
    return li;
  };

  if (pageNum > 3) {
    pagesList.appendChild(pageItem(1));
    if (pageNum > 4) pagesList.appendChild(ellipsis());
  }
  for (let i = Math.max(1, pageNum - 2); i <= Math.min(totalPages, pageNum + 2); i += 1) {
    pagesList.appendChild(pageItem(i, i === pageNum));
  }
  if (pageNum < totalPages - 2) {
    if (pageNum < totalPages - 3) pagesList.appendChild(ellipsis());
    pagesList.appendChild(pageItem(totalPages));
  }
}

/**
 * Render results and pagination for a given page, updating the result count.
 * @param {HTMLElement} widget - Widget container element
 * @param {Array<Object>} results - Full filtered result set
 * @param {number} page - Current page (1-based)
 */
function renderPage(widget, results, page) {
  const total = results.length;
  const start = total > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
  const end = Math.min(page * ITEMS_PER_PAGE, total);

  widget.querySelector('#result-min').textContent = start;
  widget.querySelector('#result-max').textContent = end;
  widget.querySelector('#result-total').textContent = total;

  displayResults(widget.querySelector('.results'), results, page);
  displayPagination(widget.querySelector('nav.pagination'), total, page);
}

/**
 * Derive inventory category (new/used/rental) from the page pathname.
 * @param {string} pathname - window.location.pathname
 * @returns {string|null}
 */
function getCategoryFromPath(pathname) {
  const segment = pathname.split('/').filter(Boolean)[0] || '';
  if (segment === 'new') return 'new';
  if (segment === 'rental') return 'rental';
  if (segment.startsWith('used')) return 'used';
  return null;
}

/**
 * Decorates the PLP widget.
 * @param {HTMLElement} widget - Widget container element
 */
export default async function decorate(widget) {
  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const copy = await loadWidgetCopy(lang);
  hydrateCopy(widget, copy);

  const index = await loadIndex();
  buildFilters(widget, index, copy);

  const urlParams = new URLSearchParams(window.location.search);
  const equipment = urlParams.get('equipment') || widget.dataset.equipment;
  // eslint-disable-next-line no-console
  console.log('[plp] equipment param:', equipment);
  if (equipment) {
    const equipmentSelect = widget.querySelector('#filter-equipment');
    equipmentSelect.value = equipment;
    equipmentSelect.dispatchEvent(new Event('change'));
  }

  const tabs = [...widget.querySelectorAll('button[role="tab"]')];
  const category = urlParams.get('category') || widget.dataset.category
    || getCategoryFromPath(window.location.pathname);
  if (category) {
    tabs.forEach((tab) => {
      tab.setAttribute('aria-selected', tab.dataset.copy === category ? 'true' : 'false');
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', 'false'));
      tab.setAttribute('aria-selected', 'true');
    });
  });

  let currentPage = 1;
  renderPage(widget, index, currentPage);

  widget.querySelector('nav.pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    currentPage = parseInt(btn.dataset.page, 10);
    renderPage(widget, index, currentPage);
    widget.querySelector('.results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
