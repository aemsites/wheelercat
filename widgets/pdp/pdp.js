import { getMetadata } from '../../scripts/aem.js';
import { hydrateCopy } from '../../scripts/scripts.js';

/**
 * Load widget copy from the widget's local JSON (same name as the script).
 * @param {string} lang - Language key (e.g. en)
 * @returns {Promise<Object>} Copy for that language (flat key-value)
 */
async function loadWidgetCopy(lang) {
  const url = new URL('./pdp.json', import.meta.url);
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
 * Read a metadata value, excluding unavailable fields.
 * @param {string} name - Metadata name
 * @returns {string} Available value or an empty string
 */
function readMetadata(name) {
  const value = getMetadata(name).trim();
  return value.toUpperCase() === 'N/A' ? '' : value;
}

/**
 * Read the authored list immediately following a source heading.
 * @param {Element|null} heading - Source heading
 * @returns {HTMLUListElement|null} Associated list
 */
function readSourceList(heading) {
  const list = heading && heading.nextElementSibling;
  return list && list.tagName === 'UL' ? list : null;
}

/**
 * Gather used-equipment metadata and the source nodes consumed by the PDP.
 * @param {HTMLElement} widget - Widget root element
 * @returns {Object} Product data and original source references
 */
function readUsedProduct(widget) {
  const main = widget.closest('main');
  const title = main.querySelector('h1');
  const picture = main.querySelector('picture');
  const featureHeading = main.querySelector('h4#features');
  const features = readSourceList(featureHeading);
  const mediaHeading = main.querySelector('h2#media-gallery');
  const media = readSourceList(mediaHeading);
  const inventoryHeading = [...main.querySelectorAll('h4')].find((heading) => (
    title && heading.textContent.trim() === title.textContent.trim()
  ));
  const inventoryList = readSourceList(inventoryHeading);
  const inventoryKeys = ['price', 'hours', 'rating', 'serial num', 'used hotline', 'location'];
  const inventory = inventoryList && [...inventoryList.children].every((item) => {
    const label = item.querySelector('strong');
    return label && inventoryKeys.includes(label.textContent.trim().toLowerCase());
  }) ? inventoryList : null;
  const segments = window.location.pathname.split('/').filter(Boolean);
  const type = segments[1] || '';
  const images = [];
  if (media) {
    media.querySelectorAll('a[href]').forEach((link) => {
      const url = new URL(link.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (url.hostname.endsWith('.scene7.com')) url.protocol = 'https:';
      if (!images.some((image) => image.url === url.href)) images.push({ url: url.href });
    });
  }
  if (!images.length && picture) {
    const image = picture.querySelector('img');
    if (image) images.push({ picture, url: image.currentSrc || image.src });
  }
  const specificationHeading = main.querySelector('h3#specifications');
  const sources = [title, picture];
  if (inventory) sources.push(inventoryHeading, inventory);
  if (features) {
    sources.push(featureHeading, features);
    if (specificationHeading && specificationHeading.nextElementSibling === featureHeading) {
      sources.push(specificationHeading);
    }
  }
  if (media) sources.push(mediaHeading, media);

  return {
    model: readMetadata('model') || (title ? title.textContent.trim() : ''),
    year: readMetadata('year'),
    price: readMetadata('price'),
    hours: readMetadata('hours'),
    serialNumber: readMetadata('serial-num'),
    location: readMetadata('location'),
    equipment: type.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    used: segments[0] === 'used-equipment',
    backLinkUrl: `/used-equipment/${type}/`,
    description: null,
    keySpecs: [],
    specGroups: [],
    specSheetUrl: '',
    basicFields: ['model', 'year', 'hours', 'serialNumber', 'location'],
    title,
    images,
    features,
    dealer: null,
    sources: sources.filter(Boolean).map((node) => ({ node, parent: node.parentElement })),
  };
}

/**
 * Read labeled values without changing their authored units or wording.
 * @param {HTMLUListElement|null} list - Authored specification list
 * @returns {Object[]} Available label/value pairs
 */
function readSpecFields(list) {
  if (!list) return [];
  return [...list.children].flatMap((item) => {
    const label = item.querySelector('strong');
    if (!label) return [];
    const value = item.cloneNode(true);
    value.querySelector('strong').remove();
    const name = label.textContent.trim().replace(/\s+/g, ' ');
    const text = value.textContent.trim().replace(/\s+/g, ' ');
    return name && text ? [{ label: name, value: text }] : [];
  });
}

/**
 * Read a new product's description, specifications, documents, and images.
 * @param {HTMLElement} widget - Widget root element
 * @returns {Object} Normalized product data and consumed source references
 */
function readNewProduct(widget) {
  const main = widget.closest('main');
  const title = main.querySelector('h1');
  const model = title ? title.textContent.trim() : '';
  const picture = main.querySelector('picture');
  const heading = [...main.querySelectorAll('h4')].find((node) => node.textContent.trim() === model);
  const candidate = heading && heading.nextElementSibling;
  const description = candidate && candidate.tagName === 'P' && !candidate.querySelector('picture')
    ? candidate : null;
  const keyList = description ? description.nextElementSibling : candidate;
  const keySpecs = readSpecFields(keyList && keyList.tagName === 'UL' ? keyList : null);
  const pdfHeading = main.querySelector('h3#product-specifications-pdf');
  const pdf = pdfHeading && pdfHeading.querySelector('a[href]');
  let specSheetUrl = '';
  if (pdf) {
    const url = new URL(pdf.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') specSheetUrl = url.href;
  }
  const sources = [title, picture, heading, description, pdfHeading];
  if (keySpecs.length) sources.push(keyList);
  const specGroups = [];
  const specificationHeading = main.querySelector('h3#specifications');
  const siblings = specificationHeading
    ? [...specificationHeading.parentElement.children] : [...main.querySelectorAll('h3')];
  let readingSpecs = Boolean(specificationHeading);
  siblings.slice(
    specificationHeading ? siblings.indexOf(specificationHeading) : 0,
  ).forEach((node) => {
    if (/^H[12456]$/.test(node.tagName)
      || ['features', 'equipment', 'standard-equipment', 'optional-equipment'].includes(node.id)) {
      readingSpecs = false;
    }
    if (node.tagName !== 'H3') return;
    const list = readSourceList(node);
    const fields = readSpecFields(list);
    if (readingSpecs && fields.length && fields.length === list.children.length) {
      specGroups.push({ label: node.textContent.trim(), fields });
      sources.push(node, list);
    } else if ((readingSpecs || ['features', 'equipment', 'standard-equipment', 'optional-equipment'].includes(node.id))
      && (!node.nextElementSibling || /^H[1-6]$/.test(node.nextElementSibling.tagName)
        || (list && !list.children.length))) {
      sources.push(node);
      if (list && !list.children.length) sources.push(list);
    }
  });
  const mediaHeading = main.querySelector('h2#media-gallery');
  const media = readSourceList(mediaHeading);
  const images = [];
  if (media) {
    media.querySelectorAll('a[href]').forEach((link) => {
      const url = new URL(link.href);
      if (!url.hostname.endsWith('.scene7.com') || !url.pathname.startsWith('/is/image/')) return;
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      url.protocol = 'https:';
      if (!images.some((image) => image.url === url.href)) images.push({ url: url.href });
    });
    sources.push(mediaHeading, media);
  }
  if (!images.length && picture) {
    const image = picture.querySelector('img');
    if (image) images.push({ picture, url: image.currentSrc || image.src });
  }
  const segments = window.location.pathname.split('/').filter(Boolean);
  const type = segments[2] || '';
  return {
    model,
    year: '',
    price: '',
    hours: '',
    serialNumber: '',
    location: '',
    equipment: type.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    used: false,
    backLinkUrl: `/new/${segments[1]}/${type}/`,
    title,
    images,
    features: null,
    dealer: null,
    description,
    keySpecs,
    specGroups,
    specSheetUrl,
    basicFields: [],
    sources: sources.filter(Boolean).map((node) => ({ node, parent: node.parentElement })),
  };
}

/**
 * Resolve the supported product reader without changing unrelated PDP families.
 * @param {HTMLElement} widget - Widget root element
 * @returns {Object|null} Supported product data
 */
function readProduct(widget) {
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments[0] === 'used-equipment' && segments.length === 3) return readUsedProduct(widget);
  if (segments[0] === 'new' && segments.length === 4
    && ['machines', 'attachments', 'power-systems', 'site-support'].includes(segments[1])) {
    return readNewProduct(widget);
  }
  return null;
}

/**
 * Find an unambiguous city/state dealer, preferring a unique main location.
 * @param {string} location - Product location, such as Salt Lake City, UT
 * @returns {Promise<Object|null>} Matching dealer or null
 */
async function loadDealer(location) {
  if (!location) return null;
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const [city, state] = location.split(',').map(normalize);
  const states = {
    UT: 'UTAH', WY: 'WYOMING', ID: 'IDAHO', CO: 'COLORADO', NV: 'NEVADA',
  };
  if (!city || !state) return null;
  try {
    const response = await fetch('/dealer-locations.json');
    if (!response.ok) return null;
    const json = await response.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    const matches = rows.filter((row) => normalize(row.city) === city
      && normalize(row.state) === (states[state] || state)
      && normalize(row.dealerLocationName) === city);
    if (matches.length === 1) return matches[0];
    const main = matches.filter((row) => normalize(row.type) === 'MAIN');
    return main.length === 1 ? main[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Render only available product fields in a definition list.
 * @param {HTMLElement} list - Destination definition list or definition group
 * @param {Object} data - Product data
 * @param {Array<string|Object>} fields - Metadata keys or authored label/value pairs
 */
function renderFields(list, data, fields) {
  fields.forEach((field) => {
    const value = typeof field === 'string' ? data[field] : field.value;
    if (!value) return;
    const label = document.createElement('dt');
    if (typeof field === 'string') label.dataset.copy = field;
    else label.textContent = field.label;
    const description = document.createElement('dd');
    description.textContent = value;
    list.append(label, description);
  });
}

/**
 * Create a lazy thumbnail without dropping Scene7's source query parameters.
 * @param {string} source - Full image URL
 * @returns {HTMLImageElement} Thumbnail image
 */
function createThumbnail(source) {
  const url = new URL(source);
  if (url.origin === window.location.origin) url.searchParams.set('width', '150');
  const image = document.createElement('img');
  image.src = url.href;
  image.alt = '';
  image.loading = 'lazy';
  image.width = 150;
  image.height = 113;
  return image;
}

/**
 * Render a main image selector with thumbnail and previous/next buttons.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} data - Product data
 * @param {Object} copy - Localized widget copy
 */
function decorateGallery(widget, data, copy) {
  const media = widget.querySelector('.media');
  if (!data.images.length) {
    media.hidden = true;
    return;
  }

  const viewer = media.querySelector('.viewer');
  const zoom = viewer.querySelector('.zoom');
  const dialog = media.querySelector('.image-zoom');
  const enlarged = dialog.querySelector('img');
  const thumbnails = media.querySelector('.thumbnails');
  const controls = media.querySelector('.gallery-controls');
  const previous = controls.querySelector('[data-direction="previous"]');
  const next = controls.querySelector('[data-direction="next"]');
  const indicators = controls.querySelector('.indicators');
  const buttons = [];
  const dots = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let selected = 0;
  const selectImage = (index) => {
    selected = index;
    const entry = data.images[index];
    if (!entry.picture) {
      entry.picture = document.createElement('picture');
      const image = document.createElement('img');
      image.src = entry.url;
      image.loading = 'eager';
      image.decoding = 'async';
      entry.picture.append(image);
    }
    const image = entry.picture.querySelector('img');
    if (!image.alt) image.alt = data.model;
    if (index === 0) {
      image.loading = 'eager';
      image.setAttribute('fetchpriority', 'high');
    }
    viewer.replaceChildren(entry.picture, zoom);
    buttons.forEach((button, buttonIndex) => {
      button.setAttribute('aria-pressed', String(buttonIndex === index));
    });
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      dot.setAttribute('aria-current', String(active));
      dot.dataset.active = String(active);
    });
    const thumbnail = buttons[index];
    if (thumbnail) {
      const thumbnailBounds = thumbnail.getBoundingClientRect();
      const stripBounds = thumbnails.getBoundingClientRect();
      const left = thumbnails.scrollLeft + thumbnailBounds.left - stripBounds.left
        + thumbnailBounds.width / 2 - thumbnails.clientWidth / 2;
      thumbnails.scrollTo({ left, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
    previous.disabled = index === 0;
    next.disabled = index === data.images.length - 1;
  };

  zoom.addEventListener('click', () => {
    const entry = data.images[selected];
    const source = new URL(entry.url, window.location.href);
    if (source.origin === window.location.origin) source.searchParams.set('width', 2000);
    enlarged.src = source.href;
    enlarged.alt = entry.picture.querySelector('img').alt;
    dialog.showModal();
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dialog.close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  if (data.images.length > 1) {
    data.images.forEach((entry, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const label = copy.viewImage.replace('{number}', index + 1);
      button.setAttribute('aria-label', label);
      button.title = label;
      button.append(createThumbnail(entry.url));
      button.addEventListener('click', () => selectImage(index));
      buttons.push(button);
      item.append(button);
      thumbnails.append(item);
      const indicator = document.createElement('li');
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', label);
      dot.title = label;
      dot.addEventListener('click', () => selectImage(index));
      dots.push(dot);
      indicator.append(dot);
      indicators.append(indicator);
    });
    previous.addEventListener('click', () => selectImage(selected - 1));
    next.addEventListener('click', () => selectImage(selected + 1));
    controls.hidden = false;
  } else thumbnails.hidden = true;
  selectImage(0);
}

/**
 * Render validated dealer contact information from the dealer sheet.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object|null} dealer - Matched dealer row
 */
function renderDealer(widget, dealer) {
  if (!dealer) return;
  const address = widget.querySelector('.dealer');
  const name = document.createElement('p');
  name.textContent = dealer.dealerName || dealer.dealerLocationName;
  address.append(name);
  const street = [dealer.streetAddress1, dealer.streetAddress2].filter(Boolean).join(', ');
  const cityState = [dealer.city, dealer.state].filter(Boolean).join(', ');
  const fullAddress = [street, [cityState, dealer.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (fullAddress) {
    const text = document.createElement('p');
    const icon = document.createElement('span');
    icon.className = 'icon icon-pin';
    icon.setAttribute('aria-hidden', 'true');
    const value = document.createElement('span');
    value.textContent = fullAddress;
    text.append(icon, value);
    address.append(text);
  }
  const phone = dealer.phone || dealer.generalInfo;
  if (phone) {
    const link = document.createElement('a');
    link.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
    link.textContent = phone;
    const text = document.createElement('p');
    const icon = document.createElement('span');
    icon.className = 'icon icon-phone';
    icon.setAttribute('aria-hidden', 'true');
    text.append(icon, link);
    address.append(text);
  }
  if (dealer.webSite) {
    const url = new URL(dealer.webSite.includes('://') ? dealer.webSite : `https://${dealer.webSite}`);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const link = document.createElement('a');
      link.href = url.href;
      link.textContent = dealer.webSite;
      const text = document.createElement('p');
      const icon = document.createElement('span');
      icon.className = 'icon icon-globe';
      icon.setAttribute('aria-hidden', 'true');
      text.append(icon, link);
      address.append(text);
    }
  }
  address.hidden = false;
}

/**
 * Render resource links only when copy configuration supplies a destination.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} copy - Localized widget copy and resource destinations
 * @param {Object} data - Product data and source document destination
 */
function renderResources(widget, copy, data) {
  const list = widget.querySelector('.resources');
  [
    ['availableProtections', 'shield'],
    ['customerValueAgreement', 'users'],
    ['expertArticles', 'book'],
    ['specialOffers', 'gift'],
    ['specSheet', 'book'],
  ].forEach(([key, name]) => {
    const destination = key === 'specSheet' ? data.specSheetUrl : copy[`${key}Url`];
    if (!destination) return;
    const url = new URL(destination, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    const item = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = `icon icon-${name}`;
    icon.setAttribute('aria-hidden', 'true');
    const link = document.createElement('a');
    link.href = url.href;
    link.dataset.copy = key;
    item.append(icon, link);
    list.append(item);
  });
  list.hidden = !list.children.length;
}

/**
 * Remove only consumed source nodes and ancestors made empty by their removal.
 * @param {HTMLElement} widget - Rendered widget root element
 * @param {Object[]} sources - Consumed nodes and their original parents
 */
function removeSources(widget, sources) {
  sources.forEach(({ node, parent }) => {
    if (!widget.contains(node)) node.remove();
    let container = parent;
    while (container && container.tagName !== 'MAIN' && !container.contains(widget)
      && !container.children.length && !container.textContent.trim()) {
      const ancestor = container.parentElement;
      container.remove();
      container = ancestor;
    }
  });
}

/**
 * Decorate the link back to equipment results.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} data - Product data
 */
function decorateBackLink(widget, data) {
  widget.querySelector('.back-link a').href = data.backLinkUrl;
}

/**
 * Decorate the product title and equipment eyebrow.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} data - Product data
 */
function decorateHeader(widget, data) {
  const intro = widget.querySelector('.intro');
  const title = data.title || document.createElement('h1');
  title.textContent = data.model;
  title.dataset.eyebrow = data.equipment;
  intro.querySelector('.eyebrow').textContent = data.equipment;
  intro.append(title);
}

/**
 * Decorate the inventory summary, dealer information, and actions.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} data - Product data
 * @param {Object} copy - Localized widget copy and resource destinations
 */
function decorateInventory(widget, data, copy) {
  const summary = widget.querySelector('.inventory-summary');
  widget.querySelector('.badge').hidden = !data.used;
  if (data.description) {
    data.description.classList.add('description');
    summary.append(data.description);
  }
  const price = widget.querySelector('.price');
  price.textContent = data.price;
  price.hidden = !data.price;
  widget.querySelector('.price-label').hidden = !data.price;

  const info = widget.querySelector('.inventory-info');
  const hours = data.hours ? `${data.hours} ${copy.hoursSuffix}` : '';
  info.replaceChildren();
  [data.year, data.year && hours ? '\u2022' : '', hours].filter(Boolean).forEach((value) => {
    const span = document.createElement('span');
    span.textContent = value;
    info.append(span);
  });
  info.hidden = !info.children.length;

  const serial = widget.querySelector('.serial-number');
  serial.textContent = data.serialNumber ? `${copy.serialNumber}: ${data.serialNumber}` : '';
  serial.hidden = !data.serialNumber;

  const location = widget.querySelector('.location');
  location.querySelector('.location-text').textContent = data.location;
  location.hidden = !data.location;
  renderDealer(widget, data.dealer);

  renderResources(widget, copy, data);
  const actions = widget.querySelector('.inventory > .button-wrapper');
  actions.hidden = !data.used;
  widget.querySelectorAll('[data-cta]').forEach((link) => {
    if (copy.quoteRequestUrl) link.href = copy.quoteRequestUrl;
    else link.hidden = true;
  });
  summary.hidden = ![...summary.children].some((node) => !node.hidden);
  widget.querySelector('.inventory').hidden = summary.hidden
    && widget.querySelector('.dealer').hidden && widget.querySelector('.resources').hidden
    && actions.hidden;
}

/**
 * Decorate the product gallery and inventory.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} data - Product data
 * @param {Object} copy - Localized widget copy and resource destinations
 */
function decorateProduct(widget, data, copy) {
  decorateGallery(widget, data, copy);
  decorateInventory(widget, data, copy);
}

/**
 * Decorate the basic information and configuration details.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} data - Product data
 */
function decorateDetails(widget, data) {
  const details = widget.querySelector('.equipment-details');
  const basic = widget.querySelector('.basic-info');
  renderFields(basic, data, data.basicFields);
  basic.closest('details').hidden = !basic.children.length;
  if (data.features && data.features.children.length) {
    const configuration = widget.querySelector('.configuration');
    configuration.append(data.features);
    configuration.hidden = false;
  }
  const template = widget.querySelector('.configuration');
  data.specGroups.forEach((group) => {
    const section = template.cloneNode(true);
    section.classList.remove('configuration');
    const heading = section.querySelector('[data-copy]');
    heading.removeAttribute('data-copy');
    heading.textContent = group.label;
    const list = document.createElement('dl');
    renderFields(list, data, group.fields);
    section.append(list);
    section.hidden = false;
    details.append(section);
  });
  const first = details.querySelector('details:not([hidden])');
  if (first) first.open = true;
  details.hidden = !first;
}

/**
 * Decorate the optional strip of prominent authored specifications.
 * @param {HTMLElement} widget - Widget root element
 * @param {Object} data - Product data
 */
function decorateKeySpecs(widget, data) {
  const list = widget.querySelector('.key-specs');
  data.keySpecs.forEach((field) => {
    const group = document.createElement('div');
    renderFields(group, data, [field]);
    list.append(group);
  });
  list.hidden = !list.children.length;
}

/**
 * Decorates a supported PDP from existing page content and metadata.
 * @param {HTMLElement} widget - Widget root element
 * @returns {Promise<void>} Promise that resolves when widget decoration is complete
 */
export default async function decorate(widget) {
  const data = readProduct(widget);
  if (!data || !data.model) {
    widget.hidden = true;
    return;
  }

  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const [copy, dealer] = await Promise.all([loadWidgetCopy(lang), loadDealer(data.location)]);
  if (!copy.backToResults || !copy.imageIndicators || !copy.viewImage) {
    widget.hidden = true;
    return;
  }

  data.dealer = dealer;

  decorateBackLink(widget, data);
  decorateHeader(widget, data);
  decorateProduct(widget, data, copy);
  decorateKeySpecs(widget, data);
  decorateDetails(widget, data);

  hydrateCopy(widget, copy);
  removeSources(widget, data.sources);
}
