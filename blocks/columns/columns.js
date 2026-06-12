/**
 * Returns the shared column count if every row has the same number of columns, otherwise null.
 * @param {Element} block The block element
 * @returns {number|null} Column count, or null if rows differ
 */
function getColCount(block) {
  const rows = [...block.children];
  if (rows.length === 0) return null;
  const n = rows[0].children.length;
  return rows.every((row) => row.children.length === n) ? n : null;
}

/**
 * Sets data-orientation to 'portrait' or 'landscape' from the first img's width/height attributes.
 * @param {Element} col The column element to tag
 */
function setImageOrientation(col) {
  const img = col.querySelector('img');
  if (img) {
    const w = parseInt(img.getAttribute('width'), 10);
    const h = parseInt(img.getAttribute('height'), 10);
    if (w && h && h > w) {
      col.dataset.orientation = 'portrait';
    } else col.dataset.orientation = 'landscape';
  }
}

export default function decorate(block) {
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const els = [...col.children];
      const isMedia = els.length > 0 && els.every((el) => el.tagName === 'PICTURE' || el.tagName === 'VIDEO');
      col.classList.add(isMedia ? 'media-wrapper' : 'body-wrapper');
      if (isMedia) setImageOrientation(col);
    });
  });

  const colCount = getColCount(block);
  if (colCount && ![...block.classList].some((c) => c.startsWith('cols-'))) {
    block.classList.add(`cols-${colCount}`);
    if (colCount % 2 === 0) block.classList.add('cols-even');
  }
}
