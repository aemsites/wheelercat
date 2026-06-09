/**
 * Load widget copy from the widget's local JSON (same name as the script).
 * @param {string} lang - Language key (e.g. en)
 * @returns {Promise<Object>} Copy for that language (flat key-value)
 */
async function loadWidgetCopy(lang) {
  const scriptPath = new URL(import.meta.url).pathname;
  const jsonPath = scriptPath.replace(/\.js$/, '.json');
  const url = `${window.hlx?.codeBasePath || ''}${jsonPath}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const key = data[lang] ? lang : 'en';
  return data[key] || {};
}

/**
 * Determine equipment category from content path.
 * @param {string} path - Content path from the query index (e.g. /new/cat-320/index)
 * @returns {'new'|'used'|null}
 */
function getCategoryFromPath(path) {
  if (!path) return null;
  if (path.startsWith('/used-equipment/')) return 'used';
  if (path.startsWith('/new/')) return 'new';
  return null;
}

/**
 * Normalize a single item from the site query index.
 * @param {Object} row - Raw row from the site query-index.json
 * @returns {Object} Normalized search item
 */
function normalizeQueryItem(row) {
  const path = row.path || row.url || '';
  return {
    path,
    title: (row.title || '').trim(),
    description: (row.description || '').trim(),
    image: row.image || '',
    category: getCategoryFromPath(path),
  };
}

/**
 * Normalize a single item from the used equipment query index.
 * @param {Object} row - Raw row from used-equipment/query-index.json
 * @returns {Object} Normalized search item
 */
function normalizeUsedEquipmentItem(row) {
  const path = row.path || row.url || '';
  return {
    path,
    title: (row.title || '').trim(),
    description: (row.description || '').trim(),
    image: row.image || '',
    category: 'used',
    model: (row.model || '').trim(),
    location: (row.location || '').trim(),
    hours: (row.hours || '').trim(),
    price: (row.price || '').trim(),
  };
}

/**
 * Fetch JSON from a path, returning an empty data array on failure.
 * @param {string} url - Full URL to fetch
 * @returns {Promise<Object>}
 */
async function fetchIndexJson(url) {
  const resp = await fetch(url);
  return resp.ok ? resp.json() : { data: [] };
}

/**
 * Merge site and used-equipment indexes, deduping by path with used-equipment precedence.
 * @param {Array<Object>} siteRows - Rows from query-index.json
 * @param {Array<Object>} usedRows - Rows from used-equipment/query-index.json
 * @returns {Array<Object>}
 */
function mergeSearchIndexes(siteRows, usedRows) {
  const byPath = new Map();
  siteRows.forEach((row) => {
    const item = normalizeQueryItem(row);
    if (item.path) byPath.set(item.path, item);
  });
  usedRows.forEach((row) => {
    const item = normalizeUsedEquipmentItem(row);
    if (item.path) byPath.set(item.path, item);
  });
  return [...byPath.values()];
}

/**
 * Fetch and merge query indexes.
 * @returns {Promise<Array<Object>>} Normalized items
 */
async function loadSearchIndex() {
  if (window.searchResultsIndex) {
    return window.searchResultsIndex;
  }

  if (!window.searchResultsIndexPromise) {
    window.searchResultsIndexPromise = (async () => {
      const base = window.hlx?.codeBasePath || '';
      const [siteJson, usedJson] = await Promise.all([
        fetchIndexJson(`${base}/query-index.json`),
        fetchIndexJson(`${base}/used-equipment/query-index.json`),
      ]);

      const siteRows = Array.isArray(siteJson.data) ? siteJson.data : [];
      const usedRows = Array.isArray(usedJson.data) ? usedJson.data : [];
      const items = mergeSearchIndexes(siteRows, usedRows);

      window.searchResultsIndex = items;
      return items;
    })();
  }

  return window.searchResultsIndexPromise;
}

/**
 * Remove diacritical marks for accent-insensitive matching.
 * @param {string} str - Input string, possibly containing accented characters
 * @returns {string}
 */
function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Normalize string for search: lowercase and remove accents.
 * @param {string} str - Input string to normalize
 * @returns {string}
 */
function normalizeForSearch(str) {
  return removeAccents((str || '').toLowerCase());
}

/**
 * Split a search string into normalized terms.
 * @param {string} searchTerm - Raw user input from the search field
 * @returns {string[]}
 */
function parseSearchTerms(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return [];
  return searchTerm.trim().split(/\s+/).map((term) => normalizeForSearch(term)).filter(Boolean);
}

/**
 * Original (display) terms from a search string.
 * @param {string} searchTerm - Raw user input from the search field
 * @returns {string[]}
 */
function parseDisplayTerms(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return [];
  return searchTerm.trim().split(/\s+/).filter(Boolean);
}

/**
 * Whether a single normalized term matches any searchable field on an item.
 * @param {Object} item - Normalized search item
 * @param {string} termNorm - Normalized (lowercase, no accents) search term
 * @returns {boolean}
 */
function termMatchesItem(item, termNorm) {
  const fields = [item.title, item.description, item.model, item.location];
  return fields.some((field) => normalizeForSearch(field || '').includes(termNorm));
}

/**
 * Filter index by search term (accent-insensitive).
 * Multiple words are treated as separate terms; all must match.
 * @param {Array<Object>} index - Normalized items
 * @param {string} searchTerm - Search string
 * @returns {Array<Object>} Filtered items with match info
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
 * Whether an item has a real OG image (not the default placeholder).
 * @param {Object} item - Normalized search item
 * @returns {boolean}
 */
function hasOgImage(item) {
  const image = item?.image?.trim();
  if (!image || !image.startsWith('https://')) return false;
  if (image.toLowerCase().startsWith('data:')) return false;
  return !image.includes('default-meta-image');
}

/**
 * Sort key for a single term against an item.
 * @param {Object} item - Normalized search item
 * @param {string} termNorm - Normalized search term to score against
 * @returns {number[]}
 */
function getTermSortKey(item, termNorm) {
  const titleNorm = normalizeForSearch(item.title || '');
  const modelNorm = normalizeForSearch(item.model || '');
  const descNorm = normalizeForSearch(item.description || '');
  const locationNorm = normalizeForSearch(item.location || '');
  const titleIdx = titleNorm.indexOf(termNorm);
  const modelIdx = modelNorm.indexOf(termNorm);
  const descIdx = descNorm.indexOf(termNorm);
  const locationIdx = locationNorm.indexOf(termNorm);
  if (titleIdx !== -1) return [0, titleIdx];
  if (modelIdx !== -1) return [1, modelIdx];
  if (descIdx !== -1) return [2, descIdx];
  if (locationIdx !== -1) return [3, locationIdx];
  return [4, Number.MAX_SAFE_INTEGER];
}

/**
 * Combined relevance sort key for multiple terms.
 * @param {Object} item - Normalized search item
 * @param {string[]} terms - Normalized search terms
 * @returns {number[]}
 */
function getMultiTermSortKey(item, terms) {
  return terms.flatMap((term) => getTermSortKey(item, term));
}

/**
 * Sort by relevance: title match before description match.
 * Items with an OG image rank before those without.
 * @param {Array<Object>} results - Filtered results (with searchTerm set)
 * @param {string} searchTerm - Normalized search term (lowercase)
 */
function sortByRelevance(results, searchTerm) {
  const imageRank = (item) => (hasOgImage(item) ? 0 : 1);

  if (!searchTerm || !searchTerm.trim()) {
    results.sort((a, b) => imageRank(a) - imageRank(b));
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
    return imageRank(a) - imageRank(b);
  });
}

/**
 * Append image optimization query params to a URL.
 * @param {string} url - Image URL (path or full URL)
 * @returns {string}
 */
function addImageParams(url) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  const IMAGE_QUERY_PARAMS = 'width=750&format=webply&optimize=medium';
  return `${url}${sep}${IMAGE_QUERY_PARAMS}`;
}

/**
 * Get relative image path from URL.
 * @param {string} imageUrl - Absolute or relative URL
 * @returns {string}
 */
function getRelativeImagePath(imageUrl) {
  if (!imageUrl) return '';
  try {
    const url = new URL(imageUrl, window.location.origin);
    return url.pathname + url.search;
  } catch {
    return imageUrl;
  }
}

/**
 * Whether the URL is usable as a result card image.
 * @param {string} url - Raw URL string from the search index
 * @returns {boolean}
 */
function isUsableImageUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  const s = url.trim().toLowerCase();
  if (s.startsWith('data:')) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return Boolean(parsed);
  } catch {
    return false;
  }
}

/**
 * Get image src for a result card. Query index: only https:// URLs.
 * @param {Object} item - Normalized search item
 * @returns {string}
 */
function getResultImageSrc(item) {
  if (!item?.image || !isUsableImageUrl(item.image)) return '';
  if (!item.image.trim().startsWith('https://')) return '';
  return addImageParams(getRelativeImagePath(item.image));
}

/**
 * Get a compact image src for autocomplete items.
 * @param {Object} item - Normalized search item
 * @returns {string}
 */
function getAutocompleteImageSrc(item) {
  if (!hasOgImage(item)) return '';
  const path = getRelativeImagePath(item.image);
  const sep = path.includes('?') ? '&' : '?';
  const AUTOCOMPLETE_IMAGE_PARAMS = 'width=120&height=90&format=webply&optimize=medium';
  return `${path}${sep}${AUTOCOMPLETE_IMAGE_PARAMS}`;
}

/* highlight */

/**
 * Build a map from normalized index to original string index.
 * @param {string} original - Original (un-normalized) text
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
 * @param {string} str - Raw string from external data
 * @returns {string} HTML-safe string
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
 * @returns {string} HTML with highlight spans
 */
function highlightTerms(text, terms) {
  if (!text || !terms?.length) return text;

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
    result += `<span class="highlight">${escapeHTML(text.substring(start, end))}</span>`;
    pos = end;
  });
  result += escapeHTML(text.substring(pos));
  return result;
}

/**
 * Format hours for display.
 * @param {string} value - Raw hours value from the search index
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
 * Create a spec row for used equipment cards.
 * @param {string} label - Display label (e.g. "Model")
 * @param {string} value - Spec value from the search item
 * @param {string[]} searchTerms - Active search terms for highlight
 * @param {string} className - CSS class(es) for the wrapper div
 * @returns {HTMLElement|null}
 */
function createSpec(label, value, searchTerms, className = 'spec') {
  if (!value) return null;
  const wrap = document.createElement('div');
  wrap.className = className;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.innerHTML = searchTerms?.length ? highlightTerms(value, searchTerms) : escapeHTML(value);
  wrap.append(dt, dd);
  return wrap;
}

/**
 * Create used equipment specs block.
 * @param {Object} item - Normalized used equipment search item
 * @param {Object} copy - Widget copy for the current language
 * @returns {HTMLElement|null}
 */
function createUsedEquipmentSpecs(item, copy) {
  const specs = [
    createSpec(copy.model || 'Model', item.model, item.searchTerms),
    createSpec(copy.location || 'Location', item.location, item.searchTerms),
    createSpec(copy.hours || 'Hours', formatHours(item.hours, copy), item.searchTerms),
    createSpec(copy.price || 'Price', item.price, item.searchTerms, 'spec price'),
  ].filter(Boolean);

  if (!specs.length) return null;

  const dl = document.createElement('dl');
  specs.forEach((spec) => dl.appendChild(spec));
  return dl;
}

/**
 * Create a category badge element.
 * @param {Object} item - Normalized search item with a category field
 * @param {Object} copy - Widget copy for the current language
 * @returns {HTMLElement|null}
 */
function createCategoryBadge(item, copy) {
  if (!item.category) return null;
  const badge = document.createElement('span');
  badge.className = `badge ${item.category}`;
  badge.textContent = item.category === 'used'
    ? (copy.badgeUsedEquipment || 'Used Equipment')
    : (copy.badgeNewEquipment || 'New Equipment');
  return badge;
}

/**
 * Create a result card DOM element.
 * @param {Object} item - Normalized search item
 * @param {Object} copy - Widget copy
 * @returns {HTMLElement}
 */
function createResultCard(item, copy = {}) {
  const li = document.createElement('li');
  li.className = 'card';

  const link = document.createElement('a');
  link.href = item.path || '#';

  const media = document.createElement('div');
  media.className = 'media';

  const imageSrc = getResultImageSrc(item);
  if (imageSrc && !imageSrc.includes('default-meta-image')) {
    const imageEl = document.createElement('img');
    imageEl.src = imageSrc;
    imageEl.alt = '';
    imageEl.loading = 'lazy';
    media.appendChild(imageEl);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    media.appendChild(placeholder);
  }

  const badge = createCategoryBadge(item, copy);
  if (badge) media.appendChild(badge);

  const content = document.createElement('div');
  content.className = 'content';

  const title = document.createElement('h3');
  const titleText = item.title || '';
  title.innerHTML = item.searchTerms?.length
    ? highlightTerms(titleText, item.searchTerms)
    : escapeHTML(titleText);
  content.appendChild(title);

  if (item.category === 'used') {
    const specs = createUsedEquipmentSpecs(item, copy);
    if (specs) content.appendChild(specs);
  }

  const descText = item.description || '';
  if (descText) {
    const description = document.createElement('p');
    description.className = 'description';
    description.innerHTML = item.searchTerms?.length
      ? highlightTerms(descText, item.searchTerms)
      : escapeHTML(descText);
    content.appendChild(description);
  }

  link.append(media, content);
  li.appendChild(link);
  return li;
}

/**
 * Read filter config from URL query params.
 * @returns {Object}
 */
function getConfigFromURL() {
  const params = new URLSearchParams(window.location.search);
  const config = {};
  params.forEach((value, key) => { config[key] = value; });
  return config;
}

/**
 * Update URL with current filter state.
 * @param {Object} filterConfig - Current filter values (search, page, etc.)
 */
function updateURL(filterConfig) {
  const params = new URLSearchParams();
  Object.keys(filterConfig).forEach((key) => {
    if (key === 'page' && filterConfig[key] === 1) return;
    const val = filterConfig[key];
    if (val && (typeof val !== 'string' || val.trim())) {
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
 * @param {string} searchTerm - Raw user input from the search field
 * @param {number} [limit] - Optional maximum number of results to return
 * @returns {Promise<Array<Object>>}
 */
async function searchItems(searchTerm, limit) {
  const index = await loadSearchIndex();
  const results = filterBySearch(index, searchTerm);
  sortByRelevance(results, searchTerm);
  return limit ? results.slice(0, limit) : results;
}

/**
 * Create a compact autocomplete result row.
 * @param {Object} item - Normalized search item
 * @param {Object} copy - Widget copy for the current language
 * @returns {HTMLElement}
 */
function createAutocompleteItem(item, copy) {
  const li = document.createElement('li');
  li.className = 'item';
  li.setAttribute('role', 'option');

  const link = document.createElement('a');
  link.href = item.path || '#';
  link.className = 'link';

  const imageSrc = getAutocompleteImageSrc(item);
  if (imageSrc) {
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = '';
    img.loading = 'lazy';
    img.className = 'thumb';
    link.appendChild(img);
  }

  const content = document.createElement('div');
  content.className = 'content';

  const titleRow = document.createElement('div');
  titleRow.className = 'row';

  const title = document.createElement('span');
  title.className = 'title';
  const titleText = item.title || '';
  title.innerHTML = item.searchTerms?.length
    ? highlightTerms(titleText, item.searchTerms)
    : escapeHTML(titleText);
  titleRow.appendChild(title);

  const badge = createCategoryBadge(item, copy);
  if (badge) {
    titleRow.appendChild(badge);
  }
  content.appendChild(titleRow);

  if (item.category === 'used') {
    const metaParts = [
      item.model,
      item.location,
      item.price,
    ].filter(Boolean);
    if (metaParts.length) {
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = metaParts.join(' · ');
      content.appendChild(meta);
    }
  } else {
    const descText = (item.description || '').trim();
    if (descText) {
      const meta = document.createElement('span');
      meta.className = 'meta';
      const excerpt = descText.length > 80 ? `${descText.slice(0, 80)}…` : descText;
      meta.innerHTML = item.searchTerms?.length
        ? highlightTerms(excerpt, item.searchTerms)
        : escapeHTML(excerpt);
      content.appendChild(meta);
    }
  }

  link.appendChild(content);
  li.appendChild(link);
  return li;
}

/**
 * Position the autocomplete overlay relative to its anchor.
 * @param {HTMLElement} overlay - The autocomplete overlay element
 * @param {HTMLElement} anchor - The element the overlay is anchored to
 */
function positionAutocompleteOverlay(overlay, anchor) {
  const DESKTOP_MEDIA = '(width >= 1200px)';

  const rect = anchor.getBoundingClientRect();
  const isDesktop = window.matchMedia(DESKTOP_MEDIA).matches;

  if (isDesktop) {
    overlay.style.position = 'absolute';
    overlay.style.top = '100%';
    overlay.style.right = '0';
    overlay.style.left = 'auto';
    overlay.style.bottom = 'auto';
    overlay.style.width = `${rect.width * 2}px`;
    overlay.style.maxWidth = `${rect.width * 2}px`;
    overlay.style.minWidth = `${rect.width}px`;
    overlay.style.marginTop = '4px';
  } else {
    overlay.style.position = 'fixed';
    overlay.style.top = `${rect.bottom}px`;
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.width = 'auto';
    overlay.style.maxWidth = 'none';
    overlay.style.minWidth = '0';
    overlay.style.marginTop = '0';
  }
}

/**
 * Attach autocomplete search to an input, loading on first interaction.
 * @param {HTMLInputElement} input - Search input element
 * @param {Object} [options]
 * @param {HTMLElement} [options.anchor] - Element to align overlay with (defaults to input parent)
 * @param {string} [options.resultsPath='/search'] - Full results page path
 * @param {number} [options.maxResults=8] - Max suggestions shown
 * @returns {Promise<{ destroy: () => void }>}
 */
export async function attachSearchAutocomplete(input, opts = {}) {
  if (input.dataset.searchAutocomplete === 'true') {
    return { destroy: () => {} };
  }
  input.dataset.searchAutocomplete = 'true';

  const {
    anchor = input.closest('form') || input.parentElement,
    resultsPath = '/search',
    maxResults = 8,
  } = opts;

  if (!anchor) {
    return { destroy: () => {} };
  }

  const { loadCSS } = await import('../../scripts/aem.js');
  await loadCSS(`${window.hlx?.codeBasePath || ''}/widgets/search-results/search-results.css`);

  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const copy = await loadWidgetCopy(lang);

  anchor.style.position = 'relative';

  const overlay = document.createElement('div');
  overlay.id = `search-autocomplete-${Date.now()}`;
  overlay.className = 'search-autocomplete';
  overlay.hidden = true;
  overlay.setAttribute('role', 'listbox');
  overlay.setAttribute('aria-label', copy.autocompleteLabel || 'Search suggestions');

  const list = document.createElement('ul');
  list.className = 'results';
  overlay.appendChild(list);

  const footer = document.createElement('div');
  footer.className = 'footer';
  const viewAll = document.createElement('a');
  viewAll.className = 'view-all';
  viewAll.textContent = copy.viewAllResults || 'View all results';
  footer.appendChild(viewAll);
  overlay.appendChild(footer);

  anchor.appendChild(overlay);

  let debounceTimer;
  let activeIndex = -1;

  const getOptions = () => [
    ...list.querySelectorAll('.item[role="option"]'),
    ...(viewAll.href ? [viewAll] : []),
  ];

  const clearActiveOption = () => {
    getOptions().forEach((option) => {
      option.classList.remove('active');
      option.setAttribute('aria-selected', 'false');
    });
    input.removeAttribute('aria-activedescendant');
  };

  const setActiveIndex = (index) => {
    const options = getOptions();
    if (!options.length) {
      activeIndex = -1;
      clearActiveOption();
      return;
    }

    if (index < -1) activeIndex = -1;
    else if (index >= options.length) activeIndex = options.length - 1;
    else activeIndex = index;

    clearActiveOption();

    if (activeIndex === -1) return;

    const option = options[activeIndex];
    option.classList.add('active');
    option.setAttribute('aria-selected', 'true');
    if (!option.id) option.id = `${overlay.id}-option-${activeIndex}`;
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  };

  const updateViewAllHref = (query) => {
    viewAll.href = query
      ? `${resultsPath}?search=${encodeURIComponent(query)}`
      : resultsPath;
  };

  const hideOverlay = () => {
    setActiveIndex(-1);
    overlay.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  const showOverlay = () => {
    overlay.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    positionAutocompleteOverlay(overlay, anchor);
  };

  const renderResults = async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      list.innerHTML = '';
      hideOverlay();
      return;
    }

    const results = await searchItems(trimmed, maxResults);
    list.innerHTML = '';
    activeIndex = -1;

    if (!results.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.setAttribute('role', 'presentation');
      empty.textContent = copy.noResults || 'No results found';
      list.appendChild(empty);
    } else {
      results.forEach((item, index) => {
        const li = createAutocompleteItem(item, copy);
        li.id = `${overlay.id}-option-${index}`;
        list.appendChild(li);
      });
    }

    viewAll.id = `${overlay.id}-option-view-all`;
    viewAll.setAttribute('role', 'option');
    viewAll.setAttribute('aria-selected', 'false');

    updateViewAllHref(trimmed);
    showOverlay();
  };

  const AUTOCOMPLETE_DEBOUNCE_MS = 150;

  const scheduleSearch = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderResults(input.value);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  };

  const onReposition = () => {
    if (!overlay.hidden) positionAutocompleteOverlay(overlay, anchor);
  };

  const onDocumentClick = (e) => {
    if (anchor.contains(e.target)) return;
    hideOverlay();
  };

  const onInputKeydown = (e) => {
    const options = getOptions();
    const isOpen = !overlay.hidden && options.length > 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!input.value.trim()) return;
      if (overlay.hidden) {
        renderResults(input.value).then(() => setActiveIndex(0));
        return;
      }
      if (!isOpen) return;
      setActiveIndex(activeIndex < options.length - 1 ? activeIndex + 1 : 0);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) return;
      setActiveIndex(activeIndex <= 0 ? -1 : activeIndex - 1);
      return;
    }

    if (e.key === 'Home' && isOpen) {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (e.key === 'End' && isOpen) {
      e.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (e.key === 'Enter' && isOpen && activeIndex >= 0) {
      e.preventDefault();
      const option = options[activeIndex];
      const link = option.matches('a') ? option : option.querySelector('a');
      if (link?.href) window.location.href = link.href;
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      hideOverlay();
      return;
    }

    if (e.key === 'Tab') {
      hideOverlay();
    }
  };

  const onOptionHover = (e) => {
    const option = e.target.closest('[role="option"]');
    if (!option || !overlay.contains(option)) return;
    const options = getOptions();
    const index = options.indexOf(option);
    if (index >= 0) setActiveIndex(index);
  };

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', overlay.id);

  input.addEventListener('input', scheduleSearch);
  input.addEventListener('keydown', onInputKeydown);
  overlay.addEventListener('mouseover', onOptionHover);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('resize', onReposition);
  window.addEventListener('scroll', onReposition, true);

  if (input.value.trim()) {
    renderResults(input.value);
  }

  const destroy = () => {
    clearTimeout(debounceTimer);
    input.removeEventListener('input', scheduleSearch);
    input.removeEventListener('keydown', onInputKeydown);
    overlay.removeEventListener('mouseover', onOptionHover);
    document.removeEventListener('click', onDocumentClick);
    window.removeEventListener('resize', onReposition);
    window.removeEventListener('scroll', onReposition, true);
    overlay.remove();
    delete input.dataset.searchAutocomplete;
    input.removeAttribute('role');
    input.removeAttribute('aria-autocomplete');
    input.removeAttribute('aria-expanded');
    input.removeAttribute('aria-controls');
    input.removeAttribute('aria-activedescendant');
  };

  return { destroy };
}

/**
 * Hydrate all [data-copy] elements from widget copy.
 * @param {HTMLElement} container - .search-results root element
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

const ITEMS_PER_PAGE = 12;

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
 * @param {Object} copy - Widget copy
 * @param {Function} onPageChange - Called with new page number on button click
 */
function displayPagination(element, totalResults, page, copy, onPageChange) {
  const pageNum = parseInt(page, 10) || 1;
  if (!element) return;
  const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE);
  element.innerHTML = '';
  if (totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.textContent = copy.previous || 'Previous';
  prevBtn.disabled = pageNum <= 1;
  if (pageNum > 1) prevBtn.dataset.page = pageNum - 1;
  element.appendChild(prevBtn);

  const pages = document.createElement('span');
  pages.className = 'pages';
  const ellipsis = () => {
    const span = document.createElement('span');
    span.textContent = '…';
    span.setAttribute('aria-hidden', 'true');
    return span;
  };
  if (pageNum > 3) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '1';
    btn.dataset.page = '1';
    pages.appendChild(btn);
    if (pageNum > 4) pages.appendChild(ellipsis());
  }
  for (let i = Math.max(1, pageNum - 2); i <= Math.min(totalPages, pageNum + 2); i += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = i;
    btn.dataset.page = i;
    if (i === pageNum) btn.setAttribute('aria-current', 'page');
    pages.appendChild(btn);
  }
  if (pageNum < totalPages - 2) {
    if (pageNum < totalPages - 3) pages.appendChild(ellipsis());
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = totalPages;
    btn.dataset.page = totalPages;
    pages.appendChild(btn);
  }
  element.appendChild(pages);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = copy.next || 'Next';
  nextBtn.disabled = pageNum >= totalPages;
  if (pageNum < totalPages) nextBtn.dataset.page = pageNum + 1;
  element.appendChild(nextBtn);

  if (onPageChange) {
    element.querySelectorAll('button[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.page, 10)));
    });
  }
}

/**
 * Wire search, pagination, and URL state to the container.
 * @param {HTMLElement} container - .search-results root
 * @param {Object} config - Initial config
 * @param {Object} copy - Widget copy (i18n labels)
 */
function buildSearchFiltering(container, config = {}, copy = {}) {
  let currentPage = 1;

  const resultsElement = container.querySelector('.results');
  const infoElement = container.querySelector('.info');
  const paginationElement = container.querySelector('.pagination');
  const promptElement = container.querySelector('.search-prompt');
  const noResultsElement = container.querySelector('.no-results');

  const showEmptyState = () => {
    resultsElement.innerHTML = '';
    if (paginationElement) paginationElement.innerHTML = '';
    if (infoElement) infoElement.hidden = true;
    if (noResultsElement) noResultsElement.hidden = true;
    if (promptElement) promptElement.hidden = false;
    container.classList.remove('search-results-has-query');
  };

  const createFilterConfig = (resetPage = true) => {
    const filterConfig = { ...config };
    filterConfig.search = document.getElementById('fulltext').value;
    filterConfig.page = resetPage ? 1 : currentPage;
    if (resetPage) currentPage = 1;
    return filterConfig;
  };

  const runSearch = async (filterConfig = config, updateURLState = true) => {
    const query = (filterConfig.search || '').trim();
    if (!query) {
      showEmptyState();
      if (updateURLState) updateURL({ search: '', page: 1 });
      return;
    }

    if (promptElement) promptElement.hidden = true;
    const index = await loadSearchIndex();
    const results = filterBySearch(index, query);
    sortByRelevance(results, query);

    const page = parseInt(filterConfig.page, 10) || 1;
    currentPage = page;

    const totalResults = results.length;
    const startNum = totalResults > 0 ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
    const endNum = Math.min(page * ITEMS_PER_PAGE, totalResults);

    const hasResults = totalResults > 0;
    if (infoElement) infoElement.hidden = !hasResults;
    if (noResultsElement) noResultsElement.hidden = hasResults;
    container.classList.add('search-results-has-query');
    container.querySelector('#results-count').textContent = totalResults;
    container.querySelector('#results-start').textContent = startNum;
    container.querySelector('#results-end').textContent = endNum;

    displayResults(resultsElement, results, page, copy);
    if (page > 1) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    displayPagination(paginationElement, totalResults, page, copy, (pageNum) => {
      currentPage = pageNum;
      runSearch(createFilterConfig(false));
    });

    if (updateURLState) updateURL(filterConfig);
  };

  const searchElement = container.querySelector('#fulltext');
  searchElement.addEventListener('input', () => runSearch(createFilterConfig(true)));
  searchElement.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') runSearch(createFilterConfig(true));
  });

  const form = container.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      runSearch(createFilterConfig(true));
    });
  }

  const urlConfig = getConfigFromURL();
  const initialConfig = { ...config, ...urlConfig };
  if (urlConfig.page) currentPage = parseInt(urlConfig.page, 10);
  if (urlConfig.search) searchElement.value = urlConfig.search;

  loadSearchIndex();

  if (initialConfig.search?.trim()) {
    runSearch(initialConfig);
  } else {
    showEmptyState();
  }

  window.addEventListener('popstate', (e) => {
    if (e.state?.filterConfig) {
      const saved = e.state.filterConfig;
      if (saved.search !== undefined) searchElement.value = saved.search || '';
      if (saved.page) currentPage = parseInt(saved.page, 10);
      runSearch(saved, false);
    }
  });
}

/**
 * Decorates the search results widget.
 * @param {HTMLElement} widget - Widget container element
 */
export default async function decorate(widget) {
  const container = widget.querySelector('.search-results');
  if (!container) return;

  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const copy = await loadWidgetCopy(lang);

  hydrateCopy(container, copy);
  buildSearchFiltering(container, {}, copy);
}

export { loadSearchIndex, filterBySearch, searchItems };
