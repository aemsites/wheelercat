const DEALER_LOCATIONS_URL = '/dealer-locations.json';
const ITEMS_PER_PAGE = 12;
const SEARCH_DEBOUNCE_MS = 150;

const EQUIPMENT_FILTERS = [
  {
    id: 'machines',
    copyKey: 'equipmentMachines',
    divisions: ['Machines'],
    codes: ['MACH'],
  },
  {
    id: 'electric-power',
    copyKey: 'equipmentElectricPower',
    divisions: ['Electric Power Generation'],
    codes: ['POWER', 'RENG', 'RHVY'],
  },
  {
    id: 'industrial-rail',
    copyKey: 'equipmentIndustrialRail',
    divisions: ['Industrial Engines'],
    codes: ['ENGT', 'ENGTM', 'CMENG', 'ISDF'],
  },
  {
    id: 'oil-gas',
    copyKey: 'equipmentOilGas',
    divisions: ['Oil & Gas Engines'],
    codes: ['OILGS'],
  },
  {
    id: 'marine',
    copyKey: 'equipmentMarine',
    divisions: [],
    codes: [],
  },
  {
    id: 'vocational-trucks',
    copyKey: 'equipmentVocationalTrucks',
    divisions: ['On Highway Trucks'],
    codes: ['ONHSV'],
  },
  {
    id: 'on-highway-engines',
    copyKey: 'equipmentOnHighwayEngines',
    divisions: ['Truck Engines'],
    codes: ['TEPSF'],
  },
];

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
 * @param {HTMLElement} container - .locations root element
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
 * Convert an ALL CAPS string to title case.
 * @param {string} str - Input string
 * @returns {string}
 */
function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a full street address from location fields.
 * @param {Object} row - Raw dealer location row
 * @returns {string}
 */
function formatStreetAddress(row) {
  const parts = [row.streetAddress1, row.streetAddress2].filter(Boolean);
  return parts.join(', ');
}

/**
 * Format city, state, and postal code.
 * @param {Object} row - Raw dealer location row
 * @returns {string}
 */
function formatCityStateZip(row) {
  const city = toTitleCase(row.city || '');
  const state = toTitleCase(row.state || '');
  const zip = (row.postalCode || '').trim();
  const cityState = [city, state].filter(Boolean).join(', ');
  return [cityState, zip].filter(Boolean).join(' ');
}

/**
 * Normalize a single dealer location from the sheet JSON.
 * @param {Object} row - Raw row from dealer-locations.json
 * @returns {Object} Normalized location item
 */
function normalizeLocation(row) {
  const street = formatStreetAddress(row);
  const cityStateZip = formatCityStateZip(row);
  const address = [street, cityStateZip].filter(Boolean).join(', ');
  const agreementTypeCodes = (row.agreementTypeCodes || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  return {
    id: (row.dealerLocationId || '').trim(),
    dealerName: (row.dealerName || '').trim(),
    name: toTitleCase(row.dealerLocationName || ''),
    type: (row.type || '').trim(),
    street,
    cityStateZip,
    address,
    city: toTitleCase(row.city || ''),
    state: toTitleCase(row.state || ''),
    postalCode: (row.postalCode || '').trim(),
    phone: (row.phone || row.generalInfo || '').trim(),
    email: (row.email || '').trim(),
    webSite: (row.webSite || '').trim(),
    storeDivisions: (row.storeDivisions || '').trim(),
    agreementTypeCodes,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/**
 * Fetch and cache dealer locations.
 * @returns {Promise<Array<Object>>}
 */
async function loadDealerLocations() {
  if (window.dealerLocationsIndex) {
    return window.dealerLocationsIndex;
  }

  if (!window.dealerLocationsIndexPromise) {
    window.dealerLocationsIndexPromise = (async () => {
      const base = window.hlx?.codeBasePath || '';
      const resp = await fetch(`${base}${DEALER_LOCATIONS_URL}`);
      const json = resp.ok ? await resp.json() : { data: [] };
      const rows = Array.isArray(json.data) ? json.data : [];
      const items = rows.map(normalizeLocation);
      window.dealerLocationsIndex = items;
      return items;
    })();
  }

  return window.dealerLocationsIndexPromise;
}

/**
 * Remove diacritical marks for accent-insensitive matching.
 * @param {string} str - Input string
 * @returns {string}
 */
function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Normalize string for search: lowercase and remove accents.
 * @param {string} str - Input string
 * @returns {string}
 */
function normalizeForSearch(str) {
  return removeAccents((str || '').toLowerCase());
}

/**
 * Split a search string into normalized terms.
 * @param {string} searchTerm - Raw user input
 * @returns {string[]}
 */
function parseSearchTerms(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return [];
  return searchTerm.trim().split(/\s+/).map((term) => normalizeForSearch(term)).filter(Boolean);
}

/**
 * Original (display) terms from a search string.
 * @param {string} searchTerm - Raw user input
 * @returns {string[]}
 */
function parseDisplayTerms(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return [];
  return searchTerm.trim().split(/\s+/).filter(Boolean);
}

/**
 * Searchable fields for a location item.
 * @param {Object} item - Normalized location item
 * @returns {string[]}
 */
function getSearchableFields(item) {
  return [
    item.name,
    item.dealerName,
    item.type,
    item.street,
    item.city,
    item.state,
    item.postalCode,
    item.cityStateZip,
    item.address,
    item.phone,
    item.email,
    item.storeDivisions,
  ];
}

/**
 * Whether a single normalized term matches any searchable field on an item.
 * @param {Object} item - Normalized location item
 * @param {string} termNorm - Normalized search term
 * @returns {boolean}
 */
function termMatchesItem(item, termNorm) {
  return getSearchableFields(item).some((field) => normalizeForSearch(field || '').includes(termNorm));
}

/**
 * Whether a location matches the selected location type filter.
 * @param {Object} item - Normalized location item
 * @param {string} locationType - Filter value
 * @returns {boolean}
 */
function matchesLocationType(item, locationType) {
  if (!locationType || locationType === 'all') return true;

  const codes = item.agreementTypeCodes || [];
  const divisions = (item.storeDivisions || '').toLowerCase();
  const hasCode = (code) => codes.includes(code);
  const hasDivision = (division) => divisions.includes(division.toLowerCase());

  switch (locationType) {
    case 'sales':
      return hasCode('MACH') || hasCode('ONHSV')
        || hasDivision('Machines') || hasDivision('On Highway Trucks');
    case 'parts-services':
      return hasCode('MACH') || hasCode('POWER') || hasCode('RENG') || hasCode('RHVY')
        || hasCode('ENGT') || hasCode('ENGTM') || hasCode('CMENG') || hasCode('OILGS')
        || hasDivision('Machines') || hasDivision('Electric Power Generation')
        || hasDivision('Industrial Engines') || hasDivision('Oil & Gas Engines')
        || hasDivision('Truck Engines');
    case 'rental':
      return hasCode('RMACH') || hasCode('RRETL') || hasDivision('Cat Rentals');
    default:
      return true;
  }
}

/**
 * Whether a location matches any selected equipment type filter.
 * @param {Object} item - Normalized location item
 * @param {string[]} equipmentTypes - Selected equipment filter ids
 * @returns {boolean}
 */
function matchesEquipmentTypes(item, equipmentTypes) {
  if (!equipmentTypes.length) return true;

  const codes = item.agreementTypeCodes || [];
  const divisions = (item.storeDivisions || '').toLowerCase();

  return equipmentTypes.some((typeId) => {
    const config = EQUIPMENT_FILTERS.find((filter) => filter.id === typeId);
    if (!config) return false;
    return config.codes.some((code) => codes.includes(code))
      || config.divisions.some((division) => divisions.includes(division.toLowerCase()));
  });
}

/**
 * Apply location and equipment filters to a result set.
 * @param {Array<Object>} results - Search results
 * @param {Object} filters - Active filter state
 * @returns {Array<Object>}
 */
function filterByOptions(results, filters = {}) {
  const locationType = filters.locationType || 'all';
  const equipmentTypes = filters.equipmentTypes || [];
  return results.filter((item) => matchesLocationType(item, locationType)
    && matchesEquipmentTypes(item, equipmentTypes));
}

/**
 * Create a styled checkbox label element.
 * @param {string} labelText - Visible label text
 * @param {string} [value] - Checkbox value attribute
 * @returns {HTMLLabelElement}
 */
function createCheckbox(labelText, value) {
  const label = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'checkbox';
  if (value !== undefined) input.value = value;
  const indicator = document.createElement('span');
  indicator.className = 'checkbox';
  indicator.setAttribute('aria-hidden', 'true');
  label.append(input, indicator, text);
  return label;
}

/**
 * Populate equipment type checkboxes and wire all/individual behavior.
 * @param {HTMLElement} container - .locations root
 * @param {Object} copy - Widget copy
 */
function buildEquipmentFilter(container, copy) {
  const list = container.querySelector('#equipment-options');
  if (!list) return;

  const allItem = document.createElement('li');
  const allLabel = createCheckbox(copy.allEquipmentTypes || 'All Equipment Types');
  const allInput = allLabel.querySelector('input');
  allInput.checked = true;
  allItem.appendChild(allLabel);
  list.appendChild(allItem);

  const equipmentInputs = [];
  EQUIPMENT_FILTERS.forEach((filter) => {
    const item = document.createElement('li');
    const label = createCheckbox(copy[filter.copyKey] || filter.id, filter.id);
    const input = label.querySelector('input');
    item.appendChild(label);
    list.appendChild(item);
    equipmentInputs.push(input);
  });

  allInput.addEventListener('change', () => {
    equipmentInputs.forEach((input) => { input.checked = allInput.checked; });
  });

  equipmentInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const checkedCount = equipmentInputs.filter((cb) => cb.checked).length;
      if (checkedCount === 0) {
        allInput.checked = true;
        allInput.indeterminate = false;
        equipmentInputs.forEach((cb) => { cb.checked = true; });
        return;
      }
      allInput.checked = checkedCount === equipmentInputs.length;
      allInput.indeterminate = checkedCount > 0 && checkedCount < equipmentInputs.length;
    });
  });
}

/**
 * Read active filter state from the filter panel controls.
 * @param {HTMLElement} container - .locations root
 * @returns {{ locationType: string, equipmentTypes: string[] }}
 */
function getFilterState(container) {
  const locationType = container.querySelector('input[name="location-type"]:checked')?.value || 'all';
  const allEquipmentInput = container.querySelector('#equipment-options input:not([value])');
  const allActive = allEquipmentInput?.checked && !allEquipmentInput.indeterminate;
  const equipmentTypes = allActive ? [] : [...container.querySelectorAll(
    '#equipment-options input[type="checkbox"][value]',
  )].filter((input) => input.checked).map((input) => input.value);

  return { locationType, equipmentTypes };
}

/**
 * Whether any non-default filters are active.
 * @param {{ locationType: string, equipmentTypes: string[] }} filters
 * @returns {boolean}
 */
function hasActiveFilters(filters) {
  return filters.locationType !== 'all' || filters.equipmentTypes.length > 0;
}

/**
 * Reset all filter controls to defaults.
 * @param {HTMLElement} container - .locations root
 */
function clearFilters(container) {
  const allLocation = container.querySelector('input[name="location-type"][value="all"]');
  if (allLocation) allLocation.checked = true;

  const allEquipment = container.querySelector('#equipment-options input:not([value])');
  const equipmentInputs = [...container.querySelectorAll('#equipment-options input[type="checkbox"][value]')];
  if (allEquipment) {
    allEquipment.checked = true;
    allEquipment.indeterminate = false;
  }
  equipmentInputs.forEach((input) => { input.checked = true; });
}

/**
 * Restore filter controls from a saved config object.
 * @param {HTMLElement} container - .locations root
 * @param {Object} config - Saved filter config
 */
function applyFilterConfig(container, config = {}) {
  clearFilters(container);

  if (config.locationType) {
    const locationInput = container.querySelector(
      `input[name="location-type"][value="${CSS.escape(config.locationType)}"]`,
    );
    if (locationInput) locationInput.checked = true;
  }

  const equipmentTypes = (config.equipment || config.equipmentTypes || [])
    .filter(Boolean);
  if (!equipmentTypes.length) return;

  const allEquipment = container.querySelector('#equipment-options input:not([value])');
  const equipmentInputs = [...container.querySelectorAll('#equipment-options input[type="checkbox"][value]')];
  if (allEquipment) allEquipment.checked = false;
  equipmentInputs.forEach((input) => {
    input.checked = equipmentTypes.includes(input.value);
  });
  const checkedCount = equipmentInputs.filter((input) => input.checked).length;
  if (allEquipment) {
    allEquipment.checked = checkedCount === equipmentInputs.length;
    allEquipment.indeterminate = checkedCount > 0 && checkedCount < equipmentInputs.length;
  }
}

/**
 * Update the filter toggle active state.
 * @param {HTMLElement} container - .locations root
 * @param {{ locationType: string, equipmentTypes: string[] }} filters
 */
function updateFilterToggleState(container, filters) {
  const toggle = container.querySelector('#filter-toggle');
  if (!toggle) return;
  toggle.classList.toggle('active', hasActiveFilters(filters));
}

/**
 * Wire filter dropdown open/close behavior.
 * @param {HTMLElement} container - .locations root
 */
function buildFilterMenu(container) {
  const toggle = container.querySelector('#filter-toggle');
  const panel = container.querySelector('#filter-panel');
  if (!toggle || !panel) return;

  const closePanel = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  const openPanel = () => {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  document.addEventListener('click', (e) => {
    if (container.querySelector('.filter-menu')?.contains(e.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });
}

/**
 * Filter locations by search term (accent-insensitive).
 * @param {Array<Object>} index - Normalized locations
 * @param {string} searchTerm - Search string
 * @returns {Array<Object>}
 */
function filterBySearch(index, searchTerm) {
  if (!searchTerm || !searchTerm.trim()) {
    return index.map((item) => ({ ...item, searchTerm: '', searchTerms: [] }));
  }

  const terms = parseSearchTerms(searchTerm);
  const displayTerms = parseDisplayTerms(searchTerm);

  return index.filter((item) => terms.every((term) => termMatchesItem(item, term)))
    .map((item) => ({
      ...item,
      searchTerm: searchTerm.trim().toLowerCase(),
      searchTerms: displayTerms,
    }));
}

/**
 * Sort key for a single term against an item.
 * @param {Object} item - Normalized location item
 * @param {string} termNorm - Normalized search term
 * @returns {number[]}
 */
function getTermSortKey(item, termNorm) {
  const nameNorm = normalizeForSearch(item.name || '');
  const cityNorm = normalizeForSearch(item.city || '');
  const stateNorm = normalizeForSearch(item.state || '');
  const dealerNorm = normalizeForSearch(item.dealerName || '');
  const addressNorm = normalizeForSearch(item.address || '');
  const divisionsNorm = normalizeForSearch(item.storeDivisions || '');
  const nameIdx = nameNorm.indexOf(termNorm);
  const cityIdx = cityNorm.indexOf(termNorm);
  const stateIdx = stateNorm.indexOf(termNorm);
  const dealerIdx = dealerNorm.indexOf(termNorm);
  const addressIdx = addressNorm.indexOf(termNorm);
  const divisionsIdx = divisionsNorm.indexOf(termNorm);
  if (nameIdx !== -1) return [0, nameIdx];
  if (cityIdx !== -1) return [1, cityIdx];
  if (stateIdx !== -1) return [2, stateIdx];
  if (dealerIdx !== -1) return [3, dealerIdx];
  if (addressIdx !== -1) return [4, addressIdx];
  if (divisionsIdx !== -1) return [5, divisionsIdx];
  return [6, Number.MAX_SAFE_INTEGER];
}

/**
 * Combined relevance sort key for multiple terms.
 * @param {Object} item - Normalized location item
 * @param {string[]} terms - Normalized search terms
 * @returns {number[]}
 */
function getMultiTermSortKey(item, terms) {
  return terms.flatMap((term) => getTermSortKey(item, term));
}

/**
 * Sort by relevance: name before city before state, etc.
 * @param {Array<Object>} results - Filtered results
 * @param {string} searchTerm - Search string
 */
function sortByRelevance(results, searchTerm) {
  if (!searchTerm || !searchTerm.trim()) {
    results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return;
  }

  const terms = parseSearchTerms(searchTerm);
  results.sort((a, b) => {
    const keyA = getMultiTermSortKey(a, terms);
    const keyB = getMultiTermSortKey(b, terms);
    const len = Math.max(keyA.length, keyB.length);
    for (let i = 0; i < len; i += 1) {
      const diff = (keyA[i] ?? 0) - (keyB[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * Build a map from normalized index to original string index.
 * @param {string} original - Original text
 * @returns {number[]} normalizedIndex → originalIndex
 */
function getNormalizedToOriginalMap(original) {
  const map = [];
  for (let i = 0; i < original.length; i += 1) {
    const norm = removeAccents(original[i]);
    for (let j = 0; j < norm.length; j += 1) map.push(i);
  }
  return map;
}

/**
 * Escape a plain-text string for safe insertion into HTML.
 * @param {string} str - Raw string
 * @returns {string}
 */
function escapeHTML(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/**
 * Highlight matching substrings in text for multiple search terms.
 * @param {string} text - Full text
 * @param {string[]} terms - Terms to highlight
 * @returns {string}
 */
function highlightTerms(text, terms) {
  if (!text || !terms?.length) return escapeHTML(text);

  const intervals = [];
  terms.forEach((term) => {
    const termNorm = normalizeForSearch(term);
    if (!termNorm) return;
    const textNorm = normalizeForSearch(text);
    const map = getNormalizedToOriginalMap(text);
    let start = 0;
    while (start < textNorm.length) {
      const idx = textNorm.indexOf(termNorm, start);
      if (idx === -1) break;
      const origStart = map[idx];
      const endIdx = idx + termNorm.length - 1;
      const origEnd = endIdx < map.length ? map[endIdx] + 1 : text.length;
      intervals.push([origStart, origEnd]);
      start = idx + termNorm.length;
    }
  });

  if (!intervals.length) return escapeHTML(text);

  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i += 1) {
    const last = merged[merged.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      merged.push(intervals[i]);
    }
  }

  let result = '';
  let pos = 0;
  merged.forEach(([start, end]) => {
    result += escapeHTML(text.substring(pos, start));
    result += `<mark>${escapeHTML(text.substring(start, end))}</mark>`;
    pos = end;
  });
  result += escapeHTML(text.substring(pos));
  return result;
}

/**
 * Get a human-readable type label.
 * @param {string} type - Raw type code
 * @param {Object} copy - Widget copy
 * @returns {string}
 */
function getTypeLabel(type, copy) {
  const labels = {
    Main: copy.typeMain || 'Main',
    Branch: copy.typeBranch || 'Branch',
    TEPS: copy.typeTeps || 'Truck Engine Partner',
    ISD: copy.typeIsd || 'Industrial Dealer',
  };
  return labels[type] || type;
}

/**
 * Get CSS class for a location type badge.
 * @param {string} type - Raw type code
 * @returns {string}
 */
function getTypeClass(type) {
  if (type === 'Main') return 'main';
  return type.toLowerCase();
}

/**
 * Build a Google Maps directions URL for a location.
 * @param {Object} item - Normalized location item
 * @returns {string}
 */
function getDirectionsUrl(item) {
  const lat = parseFloat(item.latitude);
  const lng = parseFloat(item.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`;
}

/**
 * Build a tel: href from a phone string.
 * @param {string} phone - Phone number
 * @returns {string}
 */
function getPhoneHref(phone) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `tel:+1${digits}` : `tel:+${digits}`;
}

/**
 * Build an https URL from a website string.
 * @param {string} site - Website value
 * @returns {string}
 */
function getWebsiteHref(site) {
  if (!site) return '';
  return site.startsWith('http') ? site : `https://${site}`;
}

/**
 * Create a result card for the locations list.
 * @param {Object} item - Normalized location item with searchTerms
 * @param {Object} copy - Widget copy
 * @returns {HTMLElement}
 */
function createResultCard(item, copy = {}) {
  const li = document.createElement('li');
  li.className = 'result';

  const body = document.createElement('div');
  body.className = 'body-wrapper';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const heading = document.createElement('h2');
  const titleText = toTitleCase(item.dealerName || '');
  heading.innerHTML = item.searchTerms?.length
    ? highlightTerms(titleText, item.searchTerms)
    : escapeHTML(titleText);
  titleRow.appendChild(heading);

  if (item.type) {
    const badge = document.createElement('span');
    badge.className = `badge ${getTypeClass(item.type)}`;
    badge.textContent = getTypeLabel(item.type, copy);
    titleRow.appendChild(badge);
  }
  body.appendChild(titleRow);

  if (item.name) {
    const location = document.createElement('p');
    location.className = 'location-name';
    location.innerHTML = item.searchTerms?.length
      ? highlightTerms(item.name, item.searchTerms)
      : escapeHTML(item.name);
    body.appendChild(location);
  }

  if (item.address) {
    const address = document.createElement('p');
    address.className = 'address';
    address.innerHTML = item.searchTerms?.length
      ? highlightTerms(item.address, item.searchTerms)
      : escapeHTML(item.address);
    body.appendChild(address);
  }

  if (item.storeDivisions) {
    const services = document.createElement('p');
    services.className = 'meta';
    const label = copy.services || 'Services';
    const text = `${label}: ${item.storeDivisions}`;
    services.innerHTML = item.searchTerms?.length
      ? `${escapeHTML(`${label}: `)}${highlightTerms(item.storeDivisions, item.searchTerms)}`
      : escapeHTML(text);
    body.appendChild(services);
  }

  const contact = document.createElement('ul');
  contact.className = 'contact';

  if (item.phone) {
    const phoneHref = getPhoneHref(item.phone);
    if (phoneHref) {
      const phoneItem = document.createElement('li');
      const phoneLink = document.createElement('a');
      phoneLink.href = phoneHref;
      phoneLink.textContent = `${copy.call || 'Call'} ${item.phone}`;
      phoneItem.appendChild(phoneLink);
      contact.appendChild(phoneItem);
    }
  }

  if (item.email) {
    const emailItem = document.createElement('li');
    const emailLink = document.createElement('a');
    emailLink.href = `mailto:${item.email}`;
    emailLink.textContent = copy.email || 'Email';
    emailItem.appendChild(emailLink);
    contact.appendChild(emailItem);
  }

  if (item.webSite) {
    const siteItem = document.createElement('li');
    const siteLink = document.createElement('a');
    siteLink.href = getWebsiteHref(item.webSite);
    siteLink.target = '_blank';
    siteLink.rel = 'noopener noreferrer';
    siteLink.textContent = copy.website || 'Website';
    siteItem.appendChild(siteLink);
    contact.appendChild(siteItem);
  }

  if (contact.children.length) body.appendChild(contact);
  li.appendChild(body);

  const footer = document.createElement('footer');
  const buttonWrapper = document.createElement('p');
  buttonWrapper.className = 'button-wrapper';
  const button = document.createElement('a');
  button.href = getDirectionsUrl(item);
  button.className = 'button primary';
  button.target = '_blank';
  button.rel = 'noopener noreferrer';
  button.textContent = copy.getDirections || 'Get Directions';
  button.setAttribute('aria-label', `${copy.getDirections || 'Get Directions'} – ${titleText}`);
  buttonWrapper.appendChild(button);
  footer.appendChild(buttonWrapper);
  li.appendChild(footer);

  return li;
}

/**
 * Read filter config from URL query params.
 * @returns {Object}
 */
function getConfigFromURL() {
  const params = new URLSearchParams(window.location.search);
  const config = {};
  params.forEach((value, key) => {
    if (key === 'equipment') {
      if (!config.equipment) config.equipment = [];
      config.equipment.push(value);
      return;
    }
    config[key] = value;
  });
  return config;
}

/**
 * Update URL with current filter state.
 * @param {Object} filterConfig - Current filter values
 */
function updateURL(filterConfig) {
  const params = new URLSearchParams();
  Object.keys(filterConfig).forEach((key) => {
    if (key === 'page' && filterConfig[key] === 1) return;
    const val = filterConfig[key];
    if (Array.isArray(val)) {
      val.forEach((item) => {
        if (item) params.append(key, item);
      });
      return;
    }
    if (val && (typeof val !== 'string' || val.trim())) {
      if (key === 'locationType' && val === 'all') return;
      if (key !== 'page' || val !== 1) params.set(key, val);
    }
  });
  const newURL = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  window.history.pushState({ filterConfig }, '', newURL);
}

/**
 * Run a filtered, sorted search against the index.
 * @param {string} searchTerm - Raw user input
 * @param {Object} filters - Active filter state
 * @returns {Promise<Array<Object>>}
 */
async function searchLocations(searchTerm, filters = {}) {
  const index = await loadDealerLocations();
  const query = (searchTerm || '').trim();
  const searched = query ? filterBySearch(index, query) : index.map((item) => ({
    ...item,
    searchTerm: '',
    searchTerms: [],
  }));
  const results = filterByOptions(searched, filters);
  sortByRelevance(results, query);
  return results;
}

/**
 * Render one page of results into the list element.
 * @param {HTMLElement} element - .results list element
 * @param {Array<Object>} results - Full filtered result set
 * @param {number} page - Page number (1-based)
 * @param {Object} copy - Widget copy
 */
function displayResults(element, results, page, copy) {
  element.innerHTML = '';
  const start = (page - 1) * ITEMS_PER_PAGE;
  results.slice(start, start + ITEMS_PER_PAGE)
    .forEach((item) => element.append(createResultCard(item, copy)));
}

/**
 * Render pagination controls into the nav element.
 * @param {HTMLElement} element - .pagination nav element
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
 * Wire search, pagination, and URL state to the container.
 * @param {HTMLElement} container - .locations root
 * @param {Object} config - Initial config
 * @param {Object} copy - Widget copy
 */
function buildLocationsFiltering(container, config = {}, copy = {}) {
  let currentPage = 1;
  let debounceTimer;

  const searchElement = container.querySelector('#location-search');
  const resultsElement = container.querySelector('.results');
  const infoElement = container.querySelector('.info');
  const paginationElement = container.querySelector('.pagination');
  const promptElement = container.querySelector('.locations-prompt');
  const noResultsElement = container.querySelector('.no-results');
  const clearAllButton = container.querySelector('.clear-all');

  buildEquipmentFilter(container, copy);
  buildFilterMenu(container);

  const showEmptyState = () => {
    resultsElement.innerHTML = '';
    if (paginationElement) {
      paginationElement.querySelector('ol').innerHTML = '';
      paginationElement.hidden = true;
    }
    if (infoElement) infoElement.hidden = true;
    if (noResultsElement) noResultsElement.hidden = true;
    if (promptElement) promptElement.hidden = false;
  };

  const createFilterConfig = (resetPage = true) => {
    const filters = getFilterState(container);
    const filterConfig = {
      ...config,
      search: searchElement.value,
      locationType: filters.locationType,
      equipment: filters.equipmentTypes,
      page: resetPage ? 1 : currentPage,
    };
    if (resetPage) currentPage = 1;
    return filterConfig;
  };

  const runSearch = async (filterConfig = config, updateURLState = true) => {
    const query = (filterConfig.search || '').trim();
    const filters = {
      locationType: filterConfig.locationType || 'all',
      equipmentTypes: filterConfig.equipment || filterConfig.equipmentTypes || [],
    };
    updateFilterToggleState(container, filters);

    if (!query && !hasActiveFilters(filters)) {
      showEmptyState();
      if (updateURLState) {
        updateURL({
          search: '',
          locationType: 'all',
          equipment: [],
          page: 1,
        });
      }
      return;
    }

    if (promptElement) promptElement.hidden = true;
    const results = await searchLocations(query, filters);

    const page = parseInt(filterConfig.page, 10) || 1;
    currentPage = page;

    const totalResults = results.length;
    const startNum = totalResults > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
    const endNum = Math.min(page * ITEMS_PER_PAGE, totalResults);

    const hasResults = totalResults > 0;
    if (infoElement) infoElement.hidden = !hasResults;
    if (noResultsElement) noResultsElement.hidden = hasResults;
    container.querySelector('#results-count').textContent = totalResults;
    container.querySelector('#results-start').textContent = startNum;
    container.querySelector('#results-end').textContent = endNum;

    displayResults(resultsElement, results, page, copy);
    if (page > 1) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    displayPagination(paginationElement, totalResults, page);

    if (updateURLState) updateURL(filterConfig);
  };

  const scheduleSearch = (resetPage = true) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(createFilterConfig(resetPage)), SEARCH_DEBOUNCE_MS);
  };

  searchElement.addEventListener('input', () => scheduleSearch(true));
  searchElement.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      runSearch(createFilterConfig(true));
    }
  });

  const form = container.querySelector('.toolbar form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(debounceTimer);
      runSearch(createFilterConfig(true));
    });
  }

  container.querySelectorAll('#filter-location-type input, #equipment-options input')
    .forEach((input) => {
      input.addEventListener('change', () => scheduleSearch(true));
    });

  if (clearAllButton) {
    clearAllButton.addEventListener('click', () => {
      clearFilters(container);
      scheduleSearch(true);
    });
  }

  if (paginationElement) {
    paginationElement.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      currentPage = parseInt(btn.dataset.page, 10);
      runSearch(createFilterConfig(false));
    });
  }

  const urlConfig = getConfigFromURL();
  const initialConfig = {
    ...config,
    ...urlConfig,
    equipment: urlConfig.equipment || [],
  };
  if (urlConfig.page) currentPage = parseInt(urlConfig.page, 10);
  if (urlConfig.search) searchElement.value = urlConfig.search;
  applyFilterConfig(container, initialConfig);

  loadDealerLocations();

  if (initialConfig.search?.trim() || hasActiveFilters({
    locationType: initialConfig.locationType || 'all',
    equipmentTypes: initialConfig.equipment || [],
  })) {
    runSearch(initialConfig);
  } else {
    showEmptyState();
  }

  window.addEventListener('popstate', (e) => {
    if (e.state?.filterConfig) {
      const saved = e.state.filterConfig;
      if (saved.search !== undefined) searchElement.value = saved.search || '';
      if (saved.page) currentPage = parseInt(saved.page, 10);
      applyFilterConfig(container, saved);
      runSearch(saved, false);
    }
  });
}

/**
 * Decorates the dealer locations widget.
 * @param {HTMLElement} widget - Widget container element
 */
export default async function decorate(widget) {
  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const copy = await loadWidgetCopy(lang);

  hydrateCopy(widget, copy);
  buildLocationsFiltering(widget, {}, copy);
}

export { loadDealerLocations, filterBySearch, searchLocations };
