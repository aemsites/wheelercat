import { toClassName, createOptimizedPicture, decorateIcons } from '../../scripts/aem.js';

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
  const allText = select.options[0]?.text || '';
  select.innerHTML = `<option value="">${allText}</option>`;
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
 * Count unique normalized dealer locations across index rows.
 * @param {Array<Object>} rows - Raw index rows
 * @returns {Map<string, number>} Location string → item count
 */
function countLocations(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    const loc = normalizeLocation(row.location);
    if (loc && /[a-zA-Z]/.test(loc)) counts.set(loc, (counts.get(loc) ?? 0) + 1);
  });
  return counts;
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

  const counts = countLocations(rows);

  const ul = document.createElement('ul');
  fieldset.appendChild(ul);

  const allLabel = createCheckbox(copy.allDealers || 'All Dealers');
  const allInput = allLabel.querySelector('input');
  allInput.checked = true;
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
      const enabled = locationInputs.filter((i) => !i.disabled);
      const checkedCount = enabled.filter((i) => i.checked).length;
      if (checkedCount === 0) {
        allInput.checked = true;
        allInput.indeterminate = false;
        allInput.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      allInput.checked = checkedCount === enabled.length;
      allInput.indeterminate = checkedCount > 0 && checkedCount < enabled.length;
    });
  });

  allInput.dispatchEvent(new Event('change'));
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
 * Bind a range input to its sibling description element, updating on input.
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

const ITEMS_PER_PAGE = 12;

/**
 * Format an hours value for display.
 * @param {string} value - Raw hours value from the index
 * @param {Object} copy - Widget copy for the current language
 * @returns {string}
 */
function formatHours(value, copy) {
  if (!value || value === 'N/A') return '';
  const num = String(value).replace(/,/g, '');
  if (/^\d+$/.test(num)) {
    return `${Number(num).toLocaleString('en-US')} ${copy.hoursSuffix || 'hrs'}`;
  }
  return value;
}

/**
 * Create a result card element for a single index row.
 * @param {Object} row - Raw index row
 * @param {Object} [copy={}] - Widget copy for the current language
 * @returns {HTMLLIElement}
 */
function createResultCard(row, copy = {}) {
  const li = document.createElement('li');
  li.className = 'result';

  const mediaWrapper = document.createElement('div');
  mediaWrapper.className = 'media-wrapper';
  if (row.image) {
    mediaWrapper.appendChild(createOptimizedPicture(row.image, row.title || '', false, [{ width: 750 }]));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    mediaWrapper.appendChild(placeholder);
  }
  if (row.year) {
    const yearBadge = document.createElement('span');
    yearBadge.className = 'badge year';
    yearBadge.textContent = row.year;
    mediaWrapper.appendChild(yearBadge);
  }
  const usedBadge = document.createElement('span');
  usedBadge.className = 'badge used';
  const usedIcon = document.createElement('span');
  usedIcon.className = 'icon icon-certified-used';
  usedBadge.appendChild(usedIcon);
  mediaWrapper.appendChild(usedBadge);
  decorateIcons(mediaWrapper);
  li.appendChild(mediaWrapper);

  const body = document.createElement('div');
  body.className = 'body-wrapper';

  const typeLabel = getEquipmentType(row.path);
  if (typeLabel) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow type';
    eyebrow.textContent = typeLabel;
    body.appendChild(eyebrow);
  }

  if (row.title) {
    const heading = document.createElement('h2');
    if (typeLabel) heading.dataset.eyebrow = typeLabel;
    heading.textContent = row.title;
    body.appendChild(heading);
  }

  const formattedHours = formatHours(row.hours, copy);
  if (row.serialNum || formattedHours) {
    const metaList = document.createElement('ul');
    metaList.className = 'meta';
    if (row.serialNum) {
      const snItem = document.createElement('li');
      snItem.textContent = `${copy.serialNumber || 'S/N'}: ${row.serialNum}`;
      metaList.appendChild(snItem);
    }
    if (formattedHours) {
      const hoursItem = document.createElement('li');
      hoursItem.textContent = formattedHours;
      metaList.appendChild(hoursItem);
    }
    body.appendChild(metaList);
  }

  li.appendChild(body);

  const footer = document.createElement('footer');

  if (row.price) {
    const priceMeta = document.createElement('p');
    priceMeta.className = 'meta';
    priceMeta.textContent = copy.price || 'Price';
    footer.appendChild(priceMeta);

    const priceEl = document.createElement('p');
    priceEl.className = 'price';
    priceEl.textContent = row.price;
    footer.appendChild(priceEl);

    footer.appendChild(document.createElement('hr'));
  }

  if (row.location) {
    const locationEl = document.createElement('p');
    locationEl.className = 'meta location';
    locationEl.textContent = normalizeLocation(row.location);
    footer.appendChild(locationEl);
  }

  const buttonLabel = copy.viewDetails || 'View Details';
  const buttonWrapper = document.createElement('p');
  buttonWrapper.className = 'button-wrapper';
  const button = document.createElement('a');
  button.href = row.path || '#';
  button.className = 'button primary';
  button.textContent = buttonLabel;
  button.setAttribute('aria-label', `${buttonLabel} – ${row.title || ''}`);
  buttonWrapper.appendChild(button);
  footer.appendChild(buttonWrapper);

  li.appendChild(footer);
  return li;
}

/**
 * Render one page of results into the results list.
 * @param {HTMLElement} widget - Widget container element
 * @param {Array<Object>} results - Full result set
 * @param {number} page - Current page (1-based)
 */
function displayResults(widget, results, page) {
  const element = widget.querySelector('.results');
  const copy = widget.plpCopy || {};
  element.innerHTML = '';
  const start = (page - 1) * ITEMS_PER_PAGE;
  results.slice(start, start + ITEMS_PER_PAGE)
    .forEach((row) => element.append(createResultCard(row, copy)));
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

  displayResults(widget, results, page);
  displayPagination(widget.querySelector('.pagination'), total, page);
}

/**
 * Read the current state of all sidebar filter controls.
 * @param {HTMLElement} widget - Widget container element
 * @returns {Object} Current filter state
 */
function getFilterState(widget) {
  const equipmentSelect = widget.querySelector('#filter-equipment');
  const modelSelect = widget.querySelector('#filter-model');
  const priceInput = widget.querySelector('#filter-price');
  const yearInput = widget.querySelector('#filter-year');
  const hoursInput = widget.querySelector('#filter-hours');
  const allDealerInput = widget.querySelector('#filter-dealer input:not([value])');
  const allActive = allDealerInput && allDealerInput.checked && !allDealerInput.indeterminate;
  const dealerCheckboxes = allActive ? [] : [...widget.querySelectorAll(
    '#filter-dealer input[type="checkbox"]',
  )];
  const checkedDealers = dealerCheckboxes.filter(
    (cb) => cb.hasAttribute('value') && cb.checked && !cb.disabled,
  );
  return {
    equipment: equipmentSelect?.value || '',
    model: modelSelect?.value || '',
    maxPrice: priceInput ? parseFloat(priceInput.value) : Infinity,
    maxYear: yearInput ? parseFloat(yearInput.value) : Infinity,
    maxHours: hoursInput ? parseFloat(hoursInput.value) : Infinity,
    dealers: new Set(checkedDealers.map((cb) => cb.value)),
  };
}

/**
 * Test whether a row passes equipment, model, and range filters.
 * @param {Object} row - Raw index row
 * @param {Object} state - Filter state from getFilterState
 * @returns {boolean}
 */
function matchesFilters(row, state) {
  if (state.equipment && toClassName(getEquipmentType(row.path)) !== state.equipment) return false;
  if (state.model && row.model !== state.model) return false;
  const price = parsePrice(row.price);
  if (Number.isFinite(state.maxPrice) && price !== null && price > state.maxPrice) return false;
  const year = parseInt(row.year, 10);
  if (Number.isFinite(state.maxYear) && Number.isFinite(year) && year > state.maxYear) return false;
  const hours = parseInt(row.hours, 10);
  if (Number.isFinite(state.maxHours) && Number.isFinite(hours) && hours > state.maxHours) {
    return false;
  }
  return true;
}

/**
 * Compute [min, max] bounds from a value array, expanding when all values are equal.
 * @param {Array<number>} values - Numeric values to derive bounds from
 * @param {boolean} [isYear=false] - Year ranges expand max to next calendar year instead of 0
 * @returns {[number, number]}
 */
function computeBounds(values, isYear = false) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    if (isYear) return [min, new Date().getFullYear() + 1];
    return [0, max];
  }
  return [min, max];
}

/**
 * Recompute range bounds from a new base row set.
 * @param {HTMLElement} widget - Widget container element
 * @param {Array<Object>} baseRows - Rows to derive bounds from
 * @param {boolean} [reset=false] - If true, reset handle to max; otherwise clamp current value
 */
function recomputeBounds(widget, baseRows, reset = false) {
  const priceInput = widget.querySelector('#filter-price');
  const yearInput = widget.querySelector('#filter-year');
  const hoursInput = widget.querySelector('#filter-hours');

  const prices = baseRows.map((r) => parsePrice(r.price)).filter((n) => n !== null);
  const years = baseRows.map((r) => parseInt(r.year, 10)).filter(Number.isFinite);
  const hours = baseRows.map((r) => parseInt(r.hours, 10)).filter(Number.isFinite);

  const clamp = (input, min, max) => Math.min(max, Math.max(min, parseFloat(input.value)));
  const val = (input, min, max) => (reset ? max : clamp(input, min, max));

  if (prices.length && priceInput) {
    const [min, max] = computeBounds(prices);
    setRangeBounds(priceInput, min, max, val(priceInput, min, max));
    priceInput.dispatchEvent(new Event('input'));
  }
  if (years.length && yearInput) {
    const [min, max] = computeBounds(years, true);
    setRangeBounds(yearInput, min, max, val(yearInput, min, max));
    yearInput.dispatchEvent(new Event('input'));
  }
  if (hours.length && hoursInput) {
    const [min, max] = computeBounds(hours);
    setRangeBounds(hoursInput, min, max, val(hoursInput, min, max));
    hoursInput.dispatchEvent(new Event('input'));
  }
}

/**
 * Update dealer checkbox counts and disabled states in place from a row set.
 * @param {HTMLElement} widget - Widget container element
 * @param {Array<Object>} rows - Rows to count dealers from
 */
function recomputeDealers(widget, rows) {
  const fieldset = widget.querySelector('#filter-dealer');
  if (!fieldset) return;

  const counts = countLocations(rows);

  fieldset.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    if (!input.hasAttribute('value')) return;
    const count = counts.get(input.value) ?? 0;
    input.disabled = count === 0;
    if (count === 0) input.checked = false;
    const li = input.closest('li');
    if (li) li.style.order = count === 0 ? '1' : '';
    const label = input.closest('label');
    if (label) label.lastChild.textContent = `${input.value} (${count})`;
  });

  const allInput = fieldset.querySelector('input:not([value])');
  if (allInput) {
    const locationInputs = [...fieldset.querySelectorAll('input[type="checkbox"]')]
      .filter((i) => i.hasAttribute('value'));
    const enabled = locationInputs.filter((i) => !i.disabled);
    const checkedEnabled = enabled.filter((i) => i.checked).length;
    allInput.checked = checkedEnabled === 0 || checkedEnabled === enabled.length;
    allInput.indeterminate = checkedEnabled > 0 && checkedEnabled < enabled.length;
  }
}

/**
 * Serialize active filter state to URL query params.
 * @param {HTMLElement} widget - Widget container element
 */
function updateURL(widget) {
  const state = getFilterState(widget);
  const interaction = widget.plpInteraction || new Set();
  const priceInput = widget.querySelector('#filter-price');
  const yearInput = widget.querySelector('#filter-year');
  const equipmentSelect = widget.querySelector('#filter-equipment');

  const params = new URLSearchParams();
  if (interaction.has('equipment') && equipmentSelect?.value && !equipmentSelect.hasAttribute('data-readonly')) {
    params.set('equipment', equipmentSelect.value);
  }
  if (interaction.has('model') && state.model) params.set('model', state.model);
  if (interaction.has('price') && priceInput && parseFloat(priceInput.value) < parseFloat(priceInput.max)) {
    params.set('price', priceInput.value);
  }
  if (interaction.has('year') && yearInput && parseFloat(yearInput.value) < parseFloat(yearInput.max)) {
    params.set('year', yearInput.value);
  }
  if (interaction.has('dealer')) state.dealers.forEach((dealer) => params.append('dealer', dealer));

  const newURL = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  window.history.pushState({}, '', newURL);
}

/**
 * Apply all active filters, update dynamic UI, and rerender the first page.
 * @param {HTMLElement} widget - Widget container element
 * @param {Array<Object>} rows - Full index rows
 * @param {boolean} [pushState=false] - If true, push filter state to URL
 */
function applyFilters(widget, rows, pushState = false) {
  const state = getFilterState(widget);
  // Pre-dealer pass so recomputeDealers sees counts before the dealer filter narrows results.
  const preDealer = rows.filter((row) => matchesFilters(row, state));
  recomputeDealers(widget, preDealer);
  const filtered = state.dealers.size > 0
    ? preDealer.filter((row) => state.dealers.has(normalizeLocation(row.location)))
    : preDealer;
  widget.plpResults = filtered;
  renderPage(widget, filtered, 1);
  if (pushState && !widget.plpHydrating) updateURL(widget);
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
    const [minPrice, maxPrice] = computeBounds(prices);
    setRangeBounds(priceInput, minPrice, maxPrice, maxPrice);
    bindRangeDesc(priceInput, (v) => `$${Number(v).toLocaleString('en-US')}`);
  }
  if (years.length && yearInput) {
    const [minYear, maxYear] = computeBounds(years, true);
    setRangeBounds(yearInput, minYear, maxYear, maxYear);
    bindRangeDesc(yearInput);
  }
  if (hours.length && hoursInput) {
    const [minHours, maxHours] = computeBounds(hours);
    setRangeBounds(hoursInput, minHours, maxHours, maxHours);
    bindRangeDesc(hoursInput);
  }

  equipmentSelect.addEventListener('change', (e) => {
    if (e.isTrusted) widget.plpInteraction.add('equipment');
    populateModelFilter(modelSelect, rows, equipmentSelect.value);
    const base = equipmentSelect.value
      ? rows.filter((r) => toClassName(getEquipmentType(r.path)) === equipmentSelect.value)
      : rows;
    recomputeBounds(widget, base, true);
    applyFilters(widget, rows, true);
  });

  modelSelect.addEventListener('change', (e) => {
    if (e.isTrusted) widget.plpInteraction.add('model');
    const base = rows.filter((r) => {
      const type = toClassName(getEquipmentType(r.path));
      if (equipmentSelect.value && type !== equipmentSelect.value) return false;
      if (modelSelect.value && r.model !== modelSelect.value) return false;
      return true;
    });
    recomputeBounds(widget, base);
    applyFilters(widget, rows, true);
  });

  if (priceInput) {
    priceInput.addEventListener('change', (e) => {
      if (e.isTrusted) widget.plpInteraction.add('price');
      applyFilters(widget, rows, true);
    });
  }
  if (yearInput) {
    yearInput.addEventListener('change', (e) => {
      if (e.isTrusted) widget.plpInteraction.add('year');
      applyFilters(widget, rows, true);
    });
  }
  if (hoursInput) hoursInput.addEventListener('change', () => applyFilters(widget, rows, true));

  dealerFieldset.addEventListener('change', (e) => {
    if (e.isTrusted) widget.plpInteraction.add('dealer');
    applyFilters(widget, rows, true);
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
  widget.plpCopy = copy;

  const index = await loadIndex();
  widget.plpResults = index;
  widget.plpInteraction = new Set();
  buildFilters(widget, index, copy);

  const urlParams = new URLSearchParams(window.location.search);
  widget.plpHydrating = true;

  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const pathEquipment = pathSegments[0] === 'used-equipment' ? pathSegments[1] : null;
  const equipment = pathEquipment || urlParams.get('equipment') || widget.dataset.equipment;
  if (equipment) {
    const equipmentSelect = widget.querySelector('#filter-equipment');
    equipmentSelect.value = equipment;
    if (pathEquipment && equipmentSelect.value) {
      equipmentSelect.dataset.readonly = '';
      equipmentSelect.addEventListener('keydown', (e) => e.preventDefault());
    }
    equipmentSelect.dispatchEvent(new Event('change'));
  }

  const modelParam = urlParams.get('model') || widget.dataset.model;
  if (modelParam) {
    const modelSelect = widget.querySelector('#filter-model');
    modelSelect.value = modelParam;
    modelSelect.dispatchEvent(new Event('change'));
  }

  const priceInput = widget.querySelector('#filter-price');
  const priceParam = urlParams.get('price') || widget.dataset.price;
  if (priceParam && priceInput) {
    priceInput.value = priceParam;
    priceInput.dispatchEvent(new Event('input'));
    priceInput.dispatchEvent(new Event('change'));
  }

  const yearInput = widget.querySelector('#filter-year');
  const yearParam = urlParams.get('year') || widget.dataset.year;
  if (yearParam && yearInput) {
    yearInput.value = yearParam;
    yearInput.dispatchEvent(new Event('input'));
    yearInput.dispatchEvent(new Event('change'));
  }

  let dealerParams = urlParams.getAll('dealer');
  if (!dealerParams.length && widget.dataset.dealer) dealerParams = [widget.dataset.dealer];
  if (dealerParams.length > 0) {
    const allDealerInput = widget.querySelector('#filter-dealer input:not([value])');
    if (allDealerInput) {
      allDealerInput.checked = false;
      allDealerInput.dispatchEvent(new Event('change'));
      const checkedInputs = dealerParams.map((dealer) => {
        const selector = `#filter-dealer input[value="${CSS.escape(dealer)}"]`;
        return widget.querySelector(selector);
      }).filter(Boolean);
      checkedInputs.forEach((input) => { input.checked = true; });
      if (checkedInputs.length > 0) {
        const lastChecked = checkedInputs[checkedInputs.length - 1];
        lastChecked.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
  widget.plpHydrating = false;

  // Filters restored from URL params count as interacted so a subsequent user interaction
  // doesn't silently drop them from the URL. Dataset-sourced values are not marked.
  if (urlParams.get('equipment')) widget.plpInteraction.add('equipment');
  if (urlParams.get('model')) widget.plpInteraction.add('model');
  if (urlParams.get('price')) widget.plpInteraction.add('price');
  if (urlParams.get('year')) widget.plpInteraction.add('year');
  if (urlParams.getAll('dealer').length) widget.plpInteraction.add('dealer');

  const tabs = [...widget.querySelectorAll('button[role="tab"]')];
  const category = urlParams.get('category') || widget.dataset.category
    || getCategoryFromPath(window.location.pathname);
  if (category) {
    tabs.forEach((tab) => {
      tab.setAttribute('aria-selected', tab.dataset.copy === category ? 'true' : 'false');
    });
  }

  tabs.forEach((tab) => {
    tab.disabled = tab.getAttribute('aria-selected') !== 'true';
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.setAttribute('aria-selected', 'false');
        t.disabled = true;
      });
      tab.setAttribute('aria-selected', 'true');
      tab.disabled = false;
    });
  });

  let currentPage = 1;
  renderPage(widget, widget.plpResults, currentPage);

  widget.querySelector('.pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    currentPage = parseInt(btn.dataset.page, 10);
    renderPage(widget, widget.plpResults, currentPage);
    widget.querySelector('.results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
