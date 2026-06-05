import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Returns the largest factor of the block's row count between 1 and 5.
 * @param {Element} block The block element
 * @returns {number} Column count between 1 and 5
 */
function getColumnCount(block) {
  const rows = block.children.length;
  for (let n = 5; n >= 2; n -= 1) {
    if (rows % n === 0) return n;
  }
  return rows === 1 ? 1 : 3;
}

export default function decorate(block) {
  if (![...block.classList].some((c) => c.startsWith('cols-'))) {
    block.classList.add(`cols-${getColumnCount(block)}`);
  }

  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.replaceChildren(ul);
}
