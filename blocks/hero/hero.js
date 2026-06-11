/**
 * Detects a linked hero: body-wrapper contains only a bare URL link.
 * @param {HTMLElement} block - The hero block element
 */
function detectLinked(block) {
  const body = block.querySelector('.body-wrapper');
  if (!body) return;
  const links = [...body.querySelectorAll('a[href]')];
  if (links.length !== 1) return;
  const link = links[0];
  try {
    const hrefPath = new URL(link.href).pathname;
    const textPath = new URL(link.textContent.trim(), window.location).pathname;
    if (hrefPath !== textPath) return;
  } catch {
    return;
  }
  block.classList.add('linked');
}

export default function decorate(block) {
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const els = [...col.children];
      const isMedia = els.length > 0 && els.every((el) => el.tagName === 'PICTURE' || el.tagName === 'VIDEO');
      col.classList.add(isMedia ? 'media-wrapper' : 'body-wrapper');
    });
  });
  detectLinked(block);
}
