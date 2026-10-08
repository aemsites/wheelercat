import { createOptimizedPicture, decorateIcons } from '../../scripts/aem.js';
import { getEquipmentType, normalizeLocation } from '../../scripts/scripts.js';

/**
 * Marks a card as fully clickable when it contains exactly one link.
 * @param {HTMLElement} card - Card element to evaluate
 */
function linkCard(card) {
  const links = [...card.querySelectorAll('a[href]')];
  if (links.length !== 1) return;
  card.classList.add('linked');
}

/**
 * Format an hours value for display.
 * @param {string} value - Authored hours value
 * @param {Object} copy - Localized card copy
 * @returns {string} Formatted hours or an empty string
 */
function formatHours(value, copy) {
  if (!value || value === 'N/A') return '';
  const num = String(value).replace(/,/g, '');
  if (/^\d+$/.test(num)) {
    return `${Number(num).toLocaleString('en-US')} ${copy.hoursSuffix || ''}`.trim();
  }
  return value;
}

/**
 * Build the equipment card shared by listings and recommendations.
 * @param {Object} row - Used-equipment index row
 * @param {Object} copy - Localized card copy
 * @param {number} headingLevel - Heading level within the containing section
 * @returns {HTMLLIElement} Linked equipment card
 */
export function createEquipmentCard(row, copy, headingLevel = 2) {
  const li = document.createElement('li');
  li.className = 'result equipment';
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
    const heading = document.createElement(`h${headingLevel}`);
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
      snItem.textContent = `${copy.serialNumber || ''}: ${row.serialNum}`;
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
    priceMeta.textContent = copy.price || '';
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
  const buttonLabel = copy.viewDetails || row.title || row.model;
  const buttonWrapper = document.createElement('p');
  buttonWrapper.className = 'button-wrapper';
  const button = document.createElement('a');
  button.href = row.path;
  button.className = 'button primary';
  button.textContent = buttonLabel;
  button.setAttribute('aria-label', `${buttonLabel} - ${row.title || row.model || ''}`);
  buttonWrapper.appendChild(button);
  footer.appendChild(buttonWrapper);
  li.appendChild(footer);
  linkCard(li);
  return li;
}

/**
 * Returns the largest factor of the block's row count between 1 and 6.
 * @param {Element} block The block element
 * @returns {number} Grid factor between 1 and 6
 */
function getGridFactor(block) {
  const rows = block.children.length;
  for (let n = 6; n >= 2; n -= 1) {
    if (rows % n === 0) return n;
  }
  return rows === 1 ? 1 : 3;
}

function buildArrow() {
  const arrow = document.createElement('span');
  arrow.classList.add('icon', 'icon-arrow');
  return arrow;
}

/**
 * Detects a data card: two body columns with no media; renames the first to data-wrapper.
 * @param {HTMLElement} card - Card element to evaluate
 */
function detectData(card) {
  const cells = [...card.children];
  if (cells.length !== 2) return;
  if (!cells.every((c) => c.classList.contains('body-wrapper'))) return;
  // decorate data
  card.classList.add('data');
  cells[0].classList.replace('body-wrapper', 'data-wrapper');
}

/**
 * Detects a testimonial card: no image column, body contains a blockquote.
 * @param {HTMLElement} card - Card element to evaluate
 */
function detectTestimonial(card) {
  if (card.querySelector('.media-wrapper')) return;
  const body = card.querySelector('.body-wrapper');
  if (!body) return;
  const blockquote = body.querySelector('blockquote');
  if (!blockquote) return;
  // decorate testimonial
  card.classList.add('testimonial');
  const citeChildren = [...body.children].filter((el) => el !== blockquote);
  if (citeChildren.length === 0) return;
  const cite = document.createElement('cite');
  cite.append(...citeChildren);
  body.append(cite);
}

/**
 * Detects a nav card: body contains exactly one link whose text is the cell's entire text content.
 * @param {HTMLElement} card - Card element to evaluate
 */
function detectNav(card) {
  const body = card.querySelector('.body-wrapper');
  if (!body) return;
  const links = [...body.querySelectorAll('a')];
  if (links.length !== 1) return;
  if (body.textContent.trim() !== links[0].textContent.trim()) return;
  // decorate nav
  card.classList.add('nav');
  const footer = document.createElement('footer');
  footer.append(buildArrow());
  card.append(footer);
}

/**
 * Detects a directory card: body contains a list where every item has a link.
 * @param {HTMLElement} card - Card element to evaluate
 */
function detectDirectory(card) {
  const body = card.querySelector('.body-wrapper');
  if (!body) return;
  const list = body.querySelector('ul, ol');
  if (!list) return;
  const items = [...list.querySelectorAll('li')];
  if (items.length === 0) return;
  if (!items.every((item) => item.querySelector('a'))) return;
  // decorate directory
  card.classList.add('directory');
  items.forEach((item) => {
    const br = item.querySelector('br');
    if (!br) return;
    const desc = document.createElement('span');
    let node = br.nextSibling;
    while (node) {
      const next = node.nextSibling;
      desc.append(node);
      node = next;
    }
    br.remove();
    item.append(desc, buildArrow());
  });
}

/**
 * Runs all variant detectors against a card.
 * @param {HTMLElement} card - Card element to evaluate
 */
function detectVariants(card) {
  detectData(card);
  detectTestimonial(card);
  detectNav(card);
  detectDirectory(card);
}

/**
 * Moves a trailing .button-wrapper out of .body-wrapper into a card footer.
 * @param {HTMLElement} card - Card element to evaluate
 */
function extractButtons(card) {
  const body = card.querySelector('.body-wrapper');
  if (!body) return;
  const last = body.lastElementChild;
  if (!last || !last.classList.contains('button-wrapper')) return;
  const footer = document.createElement('footer');
  footer.append(last);
  card.append(footer);
}

export default function decorate(block) {
  if (![...block.classList].some((c) => c.startsWith('cols-'))) {
    block.classList.add(`cols-${getGridFactor(block)}`);
  }

  const ul = document.createElement('ul');
  [...block.children].forEach((card) => {
    const li = document.createElement('li');
    [...card.children].forEach((cell) => {
      const els = [...cell.children];
      const isMedia = els.length > 0 && els.every((el) => el.tagName === 'PICTURE' || el.tagName === 'VIDEO');
      cell.classList.add(isMedia ? 'media-wrapper' : 'body-wrapper');
      li.append(cell);
    });
    detectVariants(li);
    extractButtons(li);
    linkCard(li);
    ul.append(li);
  });
  block.replaceChildren(ul);
  decorateIcons(block);
}
