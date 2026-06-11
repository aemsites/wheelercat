export default function decorate(block) {
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const els = [...col.children];
      const isMedia = els.length > 0 && els.every((el) => el.tagName === 'PICTURE' || el.tagName === 'VIDEO');
      col.classList.add(isMedia ? 'media-wrapper' : 'body-wrapper');
    });
  });
}
