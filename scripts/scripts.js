import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  readBlockConfig,
  toClassName,
} from './aem.js';

/**
 * Hydrate all [data-copy] elements from widget copy.
 * @param {HTMLElement} container - Widget root element
 * @param {Object} copy - Widget copy for the current language
 */
export function hydrateCopy(container, copy) {
  container.querySelectorAll('[data-copy]').forEach((el) => {
    const value = copy[el.dataset.copy];
    if (!value) return;
    const target = el.dataset.copyTarget;
    if (target) {
      target.split(',').forEach((attr) => el.setAttribute(attr.trim(), value));
    } else el.textContent = value;
  });
}

/**
 * Fetch and cache the used-equipment query index.
 * @returns {Promise<Array<Object>>} Raw index rows
 */
export async function loadUsedEquipmentIndex() {
  if (window.plpIndex) return window.plpIndex;
  if (!window.plpIndexPromise) {
    window.plpIndexPromise = (async () => {
      const base = window.hlx && window.hlx.codeBasePath ? window.hlx.codeBasePath : '';
      const response = await fetch(`${base}/used-equipment/query-index.json`);
      const json = response.ok ? await response.json() : { data: [] };
      const rows = Array.isArray(json.data) ? json.data : [];
      window.plpIndex = rows;
      return rows;
    })();
  }
  return window.plpIndexPromise;
}

/**
 * Derive a human-readable equipment type label from the second path segment.
 * @param {string} path - Content path
 * @returns {string} Title-cased type string, or empty string if not derivable
 */
export function getEquipmentType(path) {
  if (!path) return '';
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return '';
  return segments[1].split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse a price string to a numeric value.
 * @param {string} str - Price string
 * @returns {number|null} Numeric value, or null if not parseable
 */
export function parsePrice(str) {
  if (!str) return null;
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : null;
}

/**
 * Normalize a location string to "Title Case City, STATE" format.
 * @param {string} str - Raw location string
 * @returns {string} Normalized location string
 */
export function normalizeLocation(str) {
  if (!str) return str;
  const [city, state] = str.split(',');
  if (!state) return str;
  const normalizedCity = city.trim().split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return `${normalizedCity}, ${state.trim().toUpperCase()}`;
}

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    // Check if h1 or picture is already inside a hero block
    if (h1.closest('.hero') || picture.closest('.hero')) {
      return; // Don't create a duplicate hero block
    }
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

function isPDP(pathname = window.location.pathname) {
  const s = pathname.split('/').filter(Boolean);
  if (s[0] === 'used-equipment') return s.length === 3;
  if (s[0] === 'new') return s.length === 4;
  return false;
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    const productPDP = main === document.querySelector('main') && isPDP()
      && (window.location.pathname.startsWith('/used-equipment/')
        || window.location.pathname.startsWith('/new/'));
    if (productPDP) {
      const image = main.querySelector('picture img');
      if (image) {
        image.loading = 'eager';
        image.setAttribute('fetchpriority', 'high');
      }
    } else {
      buildHeroBlock(main);
    }

    if (productPDP
      && !main.querySelector('.widget.pdp, .widget a[href*="/widgets/pdp/pdp.html"]')) {
      const source = document.createElement('a');
      source.href = '/widgets/pdp/pdp.html';
      source.textContent = source.href;
      const section = document.createElement('div');
      section.append(buildBlock('widget', { elems: [source] }));
      main.prepend(section);
    }
    if (productPDP && window.location.pathname.startsWith('/used-equipment/')
      && !main.querySelector('.widget.similar-machines, .widget a[href*="/widgets/similar-machines/similar-machines.html"]')) {
      const product = main.querySelector('.widget.pdp, .widget a[href*="/widgets/pdp/pdp.html"]');
      const productSection = [...main.children].find((section) => section.contains(product));
      if (productSection) {
        const source = document.createElement('a');
        source.href = '/widgets/similar-machines/similar-machines.html';
        source.textContent = source.href;
        const section = document.createElement('div');
        section.append(buildBlock('widget', { elems: [source] }));
        section.append(buildBlock('section-metadata', [['Style', 'light']]));
        productSection.after(section);
      }
    }
    if (productPDP && !main.querySelector('[data-dealership]')) {
      const section = document.createElement('div');
      section.dataset.dealership = '';
      section.hidden = true;
      const cards = buildBlock('cards', []);
      cards.classList.add('cols-1');
      section.append(cards);
      section.append(buildBlock('section-metadata', [['Style', 'dark']]));
      main.append(section);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('cta');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('outline');
      em.replaceWith(a);
    }
  });

  // collapse adjacent button wrappers
  let adjacent = main.querySelector('p.button-wrapper + p.button-wrapper');
  while (adjacent) {
    const prev = adjacent.previousElementSibling;
    adjacent.querySelectorAll('a.button').forEach((btn) => prev.appendChild(btn));
    adjacent.remove();
    adjacent = main.querySelector('p.button-wrapper + p.button-wrapper');
  }
}

/**
 * Promotes italic-only paragraphs immediately preceding a heading to eyebrows.
 * @param {Element} main The main container element
 */
function decorateEyebrows(main) {
  main.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const prev = heading.previousElementSibling;
    if (!prev || prev.tagName !== 'P') return;
    const isText = (n) => n.nodeType === Node.TEXT_NODE && !n.textContent.trim();
    const children = [...prev.childNodes].filter((n) => !isText(n));
    if (children.length !== 1) return;
    const [child] = children;
    if (child.tagName !== 'EM' || child.querySelector('a')) return;
    prev.classList.add('eyebrow');
    prev.replaceChildren(...child.childNodes);
    heading.dataset.eyebrow = prev.textContent;
  });
}

/**
 * Sets target and rel on links whose hostname differs from the current page.
 * @param {Element} container - The element to search for links within
 */
export function decorateExternalLinks(container) {
  container.querySelectorAll('a[href]').forEach((link) => {
    if (new URL(link.href).hostname !== window.location.hostname) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
function decorateSectionMetadata(main) {
  main.querySelectorAll(':scope > .section').forEach((section) => {
    section.querySelectorAll(':scope > div > .section-metadata').forEach((block) => {
      const config = readBlockConfig(block);
      const styles = String(config.style || '').split(',').map(toClassName).filter(Boolean);
      section.classList.add(...styles);
      const wrapper = block.parentElement;
      block.remove();
      if (!wrapper.children.length && !wrapper.textContent.trim()) wrapper.remove();
    });
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionMetadata(main);
  decorateBlocks(main);
  decorateButtons(main);
  decorateEyebrows(main);
}

function setPageType(doc) {
  if (isPDP(doc.location.pathname)) {
    document.body.dataset.pageType = 'product';
  }
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  setPageType(doc);
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), (section) => {
      if (document.body.classList.contains('quick-edit')) return Promise.resolve();
      return waitForFirstImage(section);
    });
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Repeat resolved PDP dealer contacts in the optional bottom card.
 * @param {Element} main - Decorated page main element
 */
function populateDealershipSection(main) {
  const cards = main.querySelector('[data-dealership] .cards');
  const dealer = main.querySelector('.pdp .dealer:not([hidden])');
  if (!cards || !dealer || cards.children.length) return;
  const section = cards.closest('.section');
  if (!section || !section.hidden || !dealer.firstElementChild) return;
  const address = dealer.cloneNode(true);
  const heading = document.createElement('h2');
  heading.textContent = address.firstElementChild.textContent;
  address.firstElementChild.remove();
  const content = buildBlock('cards', [[{ elems: [heading, address] }]]);
  cards.append(...content.children);
  section.hidden = false;
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('body > header'));

  const main = doc.querySelector('main');
  if (main.querySelector('[data-dealership] .cards')) {
    const product = main.querySelector('.widget.pdp, .widget a[href*="/widgets/pdp/pdp.html"]');
    const section = product && product.closest('.section');
    if (section) await loadSection(section);
  }
  populateDealershipSection(main);
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('body > footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  // load quick edit
  const loadQuickEdit = async (...args) => {
    // eslint-disable-next-line import/no-cycle
    const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
    initQuickEdit(...args);
  };

  const addSidekickListeners = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
  };

  const sk = document.querySelector('aem-sidekick');
  if (sk) {
    addSidekickListeners(sk);
  } else {
    // wait for sidekick to be loaded
    document.addEventListener('sidekick-ready', () => {
    // sidekick now loaded
      addSidekickListeners(document.querySelector('aem-sidekick'));
    }, { once: true });
  }
}

(() => {
  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
  // eslint-disable-next-line import/no-cycle
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
})();

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
  decorateExternalLinks(document.querySelector('main'));
}

export async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed(document);
}

loadPage();
