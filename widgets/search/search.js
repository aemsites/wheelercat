import { createOptimizedPicture, decorateIcons } from '../../scripts/aem.js';

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
 * Derive a human-readable equipment type label from the second path segment.
 * @param {string} path - Content path (e.g. /used-equipment/track-excavators/item-slug)
 * @returns {string} Title-cased type string, or empty string if not derivable
 */
function getTypeFromPath(path) {
  if (!path) return '';
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return '';
  return segments[1].split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Normalize a single item from either query index.
 * @param {Object} row - Raw row from query-index.json or used-equipment/query-index.json
 * @returns {Object} Normalized search item
 */
function normalizeItem(row) {
  const path = row.path || row.url || '';
  return {
    path,
    title: (row.title || '').trim(),
    description: (row.description || '').trim(),
    image: row.image || '',
    category: getCategoryFromPath(path),
    model: (row.model || '').trim(),
    location: (row.location || '').trim(),
    hours: (row.hours || '').trim(),
    price: (row.price || '').trim(),
    serialNumber: (row.serialNumber || row['serial-number'] || '').trim(),
    year: (row.year || '').trim(),
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
    const item = normalizeItem(row);
    if (item.path) byPath.set(item.path, item);
  });
  usedRows.forEach((row) => {
    const item = normalizeItem(row);
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
 * Get image src for a search item. Returns empty string if no usable OG image.
 * @param {Object} item - Normalized search item
 * @returns {string}
 */
function getItemImageSrc(item) {
  return hasOgImage(item) ? item.image : '';
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
 * @returns {string} HTML with `mark` elements wrapping matched substrings
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
    result += `<mark>${escapeHTML(text.substring(start, end))}</mark>`;
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
 * Create a category badge element.
 * @param {Object} item - Normalized search item with a category field
 * @param {Object} copy - Widget copy for the current language
 * @returns {HTMLElement|null}
 */
function createCategoryBadge(item, copy) {
  if (!item.category) return null;
  const badge = document.createElement('span');
  badge.className = `badge ${item.category}`;
  if (item.category === 'used') {
    const icon = document.createElement('span');
    icon.className = 'icon icon-certified-used';
    badge.appendChild(icon);
    decorateIcons(badge);
  } else {
    badge.textContent = copy.badgeNewEquipment || 'New Equipment';
  }
  return badge;
}

/**
 * Build a media-wrapper div with an optimized picture or a placeholder.
 * @param {string} src - Pre-computed image src (empty string triggers placeholder)
 * @param {number} [width] - Pixel width hint passed to createOptimizedPicture
 * @returns {HTMLElement}
 */
function createMediaWrapper(src, width = 750) {
  const wrapper = document.createElement('div');
  wrapper.className = 'media-wrapper';
  if (src) {
    wrapper.appendChild(createOptimizedPicture(src, '', false, [{ width }]));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    wrapper.appendChild(placeholder);
  }
  return wrapper;
}

/**
 * Build the media wrapper (image with overlaid year and category badges) for a result.
 * @param {Object} item - Normalized search item
 * @param {Object} copy - Widget copy for the current language
 * @returns {HTMLElement}
 */
function createResultMedia(item, copy) {
  const wrapper = createMediaWrapper(getItemImageSrc(item));

  if (item.category === 'used' && item.year) {
    const yearBadge = document.createElement('span');
    yearBadge.className = 'badge year';
    yearBadge.textContent = item.year;
    wrapper.appendChild(yearBadge);
  }

  const categoryBadge = createCategoryBadge(item, copy);
  if (categoryBadge) wrapper.appendChild(categoryBadge);

  return wrapper;
}

/**
 * Create a result DOM element for the search results list.
 * @param {Object} item - Normalized search item
 * @param {Object} copy - Widget copy
 * @returns {HTMLElement}
 */
function createResultCard(item, copy = {}) {
  const li = document.createElement('li');
  li.className = 'result';

  li.appendChild(createResultMedia(item, copy));

  const body = document.createElement('div');
  body.className = 'body-wrapper';

  const typeLabel = item.category ? getTypeFromPath(item.path) : '';
  if (typeLabel) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow type';
    eyebrow.textContent = typeLabel;
    body.appendChild(eyebrow);
  }

  const titleText = item.title || '';
  if (titleText) {
    const heading = document.createElement('h2');
    if (typeLabel) heading.dataset.eyebrow = typeLabel;
    heading.innerHTML = item.searchTerms && item.searchTerms.length
      ? highlightTerms(titleText, item.searchTerms)
      : escapeHTML(titleText);
    body.appendChild(heading);
  }

  if (item.category) {
    const formattedHours = item.category === 'used' ? formatHours(item.hours, copy) : '';
    if (item.serialNumber || formattedHours) {
      const metaList = document.createElement('ul');
      metaList.className = 'meta';
      if (item.serialNumber) {
        const snItem = document.createElement('li');
        snItem.textContent = `${copy.serialNumber || 'S/N'}: ${item.serialNumber}`;
        metaList.appendChild(snItem);
      }
      if (formattedHours) {
        const hoursItem = document.createElement('li');
        hoursItem.textContent = formattedHours;
        metaList.appendChild(hoursItem);
      }
      body.appendChild(metaList);
    }
  }

  if (item.category === 'new' || !item.category) {
    const descText = (item.description || '').trim();
    if (descText) {
      const desc = document.createElement('p');
      desc.className = 'desc';
      const excerpt = descText.length > 120 ? `${descText.slice(0, 120)}…` : descText;
      desc.innerHTML = item.searchTerms && item.searchTerms.length
        ? highlightTerms(excerpt, item.searchTerms)
        : escapeHTML(excerpt);
      body.appendChild(desc);
    }
  }

  li.appendChild(body);

  const buttonLabel = item.category
    ? (copy.viewDetails || 'View Details')
    : (copy.learnMore || 'Learn More');
  const footer = document.createElement('footer');

  if (item.category && item.price) {
    const priceMeta = document.createElement('p');
    priceMeta.className = 'meta';
    priceMeta.textContent = copy.price || 'Price';
    footer.appendChild(priceMeta);

    const priceEl = document.createElement('p');
    priceEl.className = 'price';
    priceEl.innerHTML = item.searchTerms && item.searchTerms.length
      ? highlightTerms(item.price, item.searchTerms)
      : escapeHTML(item.price);
    footer.appendChild(priceEl);

    const hr = document.createElement('hr');
    footer.appendChild(hr);
  }

  if (item.category && item.location) {
    const locationEl = document.createElement('p');
    locationEl.className = 'meta location';
    locationEl.innerHTML = item.searchTerms && item.searchTerms.length
      ? highlightTerms(item.location, item.searchTerms)
      : escapeHTML(item.location);
    footer.appendChild(locationEl);
  }

  const buttonWrapper = document.createElement('p');
  buttonWrapper.className = 'button-wrapper';
  const button = document.createElement('a');
  button.href = item.path || '#';
  button.className = 'button primary';
  button.textContent = buttonLabel;
  button.setAttribute('aria-label', `${buttonLabel} – ${titleText}`);
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
 * Create a compact suggestions result row.
 * @param {Object} item - Normalized search item
 * @param {Object} copy - Widget copy for the current language
 * @returns {HTMLElement}
 */
function createSuggestionsItem(item, copy) {
  const li = document.createElement('li');
  li.className = 'result';

  li.appendChild(createMediaWrapper(getItemImageSrc(item), 120));

  const bodyWrapper = document.createElement('div');
  bodyWrapper.className = 'body-wrapper';

  const titleEl = document.createElement('p');
  titleEl.className = 'title';

  const link = document.createElement('a');
  link.href = item.path || '#';
  link.className = 'link';
  const titleText = item.title || '';
  link.innerHTML = item.searchTerms?.length
    ? highlightTerms(titleText, item.searchTerms)
    : escapeHTML(titleText);
  titleEl.appendChild(link);

  const badge = createCategoryBadge(item, copy);
  if (badge) titleEl.appendChild(badge);
  bodyWrapper.appendChild(titleEl);

  if (item.category === 'used') {
    const metaParts = [item.model, item.location, item.price].filter(Boolean);
    if (metaParts.length) {
      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = metaParts.join(' · ');
      bodyWrapper.appendChild(meta);
    }
  } else {
    const descText = (item.description || '').trim();
    if (descText) {
      const meta = document.createElement('p');
      meta.className = 'meta';
      const excerpt = descText.length > 80 ? `${descText.slice(0, 80)}…` : descText;
      meta.innerHTML = item.searchTerms?.length
        ? highlightTerms(excerpt, item.searchTerms)
        : escapeHTML(excerpt);
      bodyWrapper.appendChild(meta);
    }
  }

  li.appendChild(bodyWrapper);
  return li;
}

/**
 * Attach suggestions search to an input, loading on first interaction.
 * @param {HTMLInputElement} input - Search input element
 * @param {Object} [options]
 * @param {HTMLElement} [options.anchor] - Element to align overlay with (defaults to input parent)
 * @param {string} [options.resultsPath='/search'] - Full results page path
 * @param {number} [options.maxResults=8] - Max suggestions shown
 * @returns {Promise<{ destroy: () => void }>}
 */
export async function attachSearchSuggestions(input, opts = {}) {
  if (input.dataset.searchSuggestions === 'true') {
    return { destroy: () => {} };
  }
  input.dataset.searchSuggestions = true;

  const {
    anchor = input.closest('form') || input.parentElement,
    resultsPath = '/search',
    maxResults = 8,
  } = opts;

  if (!anchor) {
    return { destroy: () => {} };
  }

  const { loadCSS } = await import('../../scripts/aem.js');
  await loadCSS(`${window.hlx?.codeBasePath || ''}/widgets/search/suggestions.css`);

  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const copy = await loadWidgetCopy(lang);

  const overlay = document.createElement('div');
  overlay.id = 'search-suggestions';
  overlay.className = 'search suggestions';
  overlay.hidden = true;

  const list = document.createElement('ul');
  list.className = 'results';
  overlay.appendChild(list);

  const footer = document.createElement('footer');
  const viewAll = document.createElement('a');
  viewAll.classList.add('button', 'primary');
  viewAll.textContent = copy.viewAllResults || 'View all results';
  footer.appendChild(viewAll);
  overlay.appendChild(footer);

  anchor.appendChild(overlay);

  let debounceTimer;

  const getFocusableLinks = () => [
    ...list.querySelectorAll('.link'),
    ...(viewAll.href ? [viewAll] : []),
  ];

  const updateViewAllHref = (query) => {
    viewAll.href = query
      ? `${resultsPath}?search=${encodeURIComponent(query)}`
      : resultsPath;
  };

  const hideOverlay = () => {
    overlay.hidden = true;
    delete document.body.dataset.scroll;
  };

  const showOverlay = () => {
    overlay.hidden = false;
    if (window.innerWidth < 1200) document.body.dataset.scroll = false;
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

    if (!results.length) {
      const empty = document.createElement('li');
      empty.className = 'no-results';
      empty.textContent = copy.noResults || 'No results found';
      list.appendChild(empty);
    } else {
      results.forEach((item) => list.appendChild(createSuggestionsItem(item, copy)));
    }

    updateViewAllHref(trimmed);
    showOverlay();
  };

  const SUGGESTIONS_DEBOUNCE_MS = 150;

  const scheduleSearch = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderResults(input.value), SUGGESTIONS_DEBOUNCE_MS);
  };

  const onDocumentClick = (e) => {
    if (anchor.contains(e.target)) return;
    hideOverlay();
  };

  const navigate = (e, links) => {
    const current = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      links[current < links.length - 1 ? current + 1 : 0]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (current <= 0) input.focus();
      else links[current - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideOverlay();
      input.focus();
    } else if (e.key === 'Tab') {
      hideOverlay();
    }
  };

  const onInputKeydown = (e) => {
    if (overlay.hidden) return;
    const links = getFocusableLinks();
    if (!links.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      links[0].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideOverlay();
    } else if (e.key === 'Tab') {
      hideOverlay();
    }
  };

  const onOverlayKeydown = (e) => navigate(e, getFocusableLinks());

  const onInputFocus = () => {
    if (list.children.length) showOverlay();
  };

  input.addEventListener('focus', onInputFocus);
  input.addEventListener('input', scheduleSearch);
  input.addEventListener('keydown', onInputKeydown);
  overlay.addEventListener('keydown', onOverlayKeydown);
  document.addEventListener('click', onDocumentClick);

  if (input.value.trim()) renderResults(input.value);

  const destroy = () => {
    clearTimeout(debounceTimer);
    input.removeEventListener('focus', onInputFocus);
    input.removeEventListener('input', scheduleSearch);
    input.removeEventListener('keydown', onInputKeydown);
    overlay.removeEventListener('keydown', onOverlayKeydown);
    document.removeEventListener('click', onDocumentClick);
    overlay.remove();
    delete input.dataset.searchSuggestions;
    delete document.body.dataset.scroll;
  };

  return { destroy };
}

/**
 * Hydrate all [data-copy] elements from widget copy.
 * @param {HTMLElement} container - .search root element
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
 * @param {HTMLElement} container - .search root
 * @param {Object} config - Initial config
 * @param {Object} copy - Widget copy (i18n labels)
 */
function buildSearchFiltering(container, config = {}, copy = {}) {
  let currentPage = 1;

  const searchElement = container.querySelector('#fulltext');
  const resultsElement = container.querySelector('.results');
  const infoElement = container.querySelector('.info');
  const paginationElement = container.querySelector('.pagination');
  const promptElement = container.querySelector('.search-prompt');
  const noResultsElement = container.querySelector('.no-results');

  const showEmptyState = () => {
    resultsElement.innerHTML = '';
    if (paginationElement) { paginationElement.querySelector('ol').innerHTML = ''; paginationElement.hidden = true; }
    if (infoElement) infoElement.hidden = true;
    if (noResultsElement) noResultsElement.hidden = true;
    if (promptElement) promptElement.hidden = false;
  };

  const createFilterConfig = (resetPage = true) => {
    const filterConfig = { ...config };
    filterConfig.search = searchElement.value;
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
    const results = await searchItems(query);

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

  if (paginationElement) {
    paginationElement.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      currentPage = parseInt(btn.dataset.page, 10);
      runSearch(createFilterConfig(false));
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
  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const copy = await loadWidgetCopy(lang);

  hydrateCopy(widget, copy);
  buildSearchFiltering(widget, {}, copy);
}

export { loadSearchIndex, filterBySearch, searchItems };
