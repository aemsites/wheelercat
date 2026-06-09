import { loadCSS, decorateIcons } from '../../scripts/aem.js';

/**
 * Constructs URL for widget resources.
 * @param {string} path - Subdirectory path under /widgets/
 * @param {string} name - Widget filename without extension
 * @param {string} extension - File extension
 * @returns {string} Complete URL path to widget resource
 */
function writeUrl(path, name, extension) {
  return `${window.hlx.codeBasePath}/widgets/${path}/${name}.${extension}`;
}

/**
 * Decorates widget element by loading HTML, CSS, and JS resources.
 * @param {HTMLElement} widget - Widget container element
 * @returns {Promise<void>} Promise that resolves when widget decoration is complete
 * @throws {Error} Warns to console if widget loading fails
 */
export default async function decorate(widget) {
  const source = widget.querySelector('a[href]');
  const { pathname, searchParams } = new URL(source.href);
  const pathSegments = pathname.split('/').filter((p) => p);
  const widgetPath = pathSegments[1];
  const widgetName = pathSegments[2].split('.')[0];

  try {
    // load and populate html
    const resp = await fetch(writeUrl(widgetPath, widgetName, 'html'));
    widget.innerHTML = await resp.text();

    // load css asynchronously
    const cssLoaded = loadCSS(writeUrl(widgetPath, widgetName, 'css'));

    // stamp authored params onto dataset before decorate runs
    widget.dataset.source = source.href;
    const params = new URLSearchParams(searchParams);
    params.forEach((value, key) => {
      widget.dataset[key] = value;
    });

    // load and execute js
    const decorationComplete = (async () => {
      const mod = await import(writeUrl(widgetPath, widgetName, 'js'));
      if (mod.default) await mod.default(widget);
    })();
    await Promise.all([cssLoaded, decorationComplete]);

    decorateIcons(widget);

    let cssPrefix = widgetName;
    if (widgetPath !== widgetName) {
      cssPrefix = `${widgetPath}-${widgetName}`;
    }

    // apply widget styling and metadata
    const wrapper = widget.closest('.widget-wrapper');
    wrapper.classList.add(`${cssPrefix}-wrapper`);
    const container = wrapper.closest('.widget-container');
    container.classList.add(`${cssPrefix}-container`);
    widget.classList.add(cssPrefix);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('widget failed to load:', error);
  }
}
