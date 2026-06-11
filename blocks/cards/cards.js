import { decorateIcons } from '../../scripts/aem.js';

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

/**
 * Marks a card as fully clickable when it contains exactly one link.
 * @param {HTMLElement} card - Card element to evaluate
 */
function linkCard(card) {
  const links = [...card.querySelectorAll('a[href]')];
  if (links.length !== 1) return;
  card.classList.add('linked');
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
