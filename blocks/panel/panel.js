/**
 * Sets data-orientation on a row based on whether media leads or follows the body content.
 * @param {Element} row - A direct child of the panel block
 */
function determineOrientation(row) {
  const mediaFirst = row.firstElementChild.classList.contains('media-wrapper');
  row.dataset.orientation = mediaFirst ? 'left' : 'right';
}

export default function decorate(block) {
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const els = [...col.children];
      const isMedia = els.length > 0 && els.every((el) => el.tagName === 'PICTURE' || el.tagName === 'VIDEO');
      col.classList.add(isMedia ? 'media-wrapper' : 'body-wrapper');
    });
    determineOrientation(row);
  });
}
