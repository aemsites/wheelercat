import { decorateIcons } from '../../scripts/aem.js';

// Must be ≥ floor(maxVisible / 2) + 1; 4 satisfies the 7-visible maximum.
const NUM_CLONES = 4;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Returns the maximum visible slide count tier for the given total slide count.
 * @param {number} numSlides - Total number of real slides
 * @returns {number} Max visible count (1, 3, 5, or 7)
 */
function getMaxVisible(numSlides) {
  if (numSlides <= 2) return 1;
  if (numSlides <= 4) return 3;
  if (numSlides <= 6) return 5;
  return 7;
}

/**
 * Returns the visible slide count at the current viewport width.
 * @param {number} numSlides - Total number of real slides
 * @returns {number} Visible count at current viewport
 */
function getVisibleCount(numSlides) {
  const max = getMaxVisible(numSlides);
  if (max === 1) return 1;
  const w = window.innerWidth;
  if (max === 3) return w >= 600 ? 3 : 1;
  if (max === 5) {
    if (w >= 900) return 5;
    if (w >= 600) return 3;
    return 1;
  }
  if (w >= 1200) return 7;
  if (w >= 900) return 5;
  if (w >= 600) return 3;
  return 1;
}

/**
 * Adds the `thumbnail` class to block if every slide contains only a single link as its body text.
 * @param {Element} block - The gallery block element
 * @param {HTMLUListElement} ul - The slide list, before clones are added
 */
function detectThumbnail(block, ul) {
  const isThumbnail = [...ul.children].every((li) => {
    const body = li.querySelector('.body-wrapper');
    if (!body) return false;
    const links = [...body.querySelectorAll('a[href]')];
    if (links.length !== 1) return false;
    return body.textContent.trim() === links[0].textContent.trim();
  });
  if (isThumbnail) block.classList.add('thumbnail');
}

/**
 * Wires up autoplay: advances one slide every 5s when in the viewport and not hovered or focused.
 * @param {Element} block - The gallery block element; observed for intersection, hover, and focus
 * @param {number[]} queue - Shared navigation queue from buildCarousel
 * @param {Function} processQueue - Drains the queue; called after each queued step is pushed
 */
function buildAutoplay(block, queue, processQueue) {
  const AUTOPLAY_DELAY = 5000;
  let autoplayTimer = null;
  let inViewport = false;
  let userPaused = false;

  const startAutoplay = () => {
    if (autoplayTimer) return;
    autoplayTimer = setInterval(() => {
      queue.push(1);
      processQueue();
    }, AUTOPLAY_DELAY);
  };

  const stopAutoplay = () => {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  };

  const syncAutoplay = () => {
    if (inViewport && !userPaused) {
      startAutoplay();
    } else {
      stopAutoplay();
    }
  };

  new IntersectionObserver((entries) => {
    inViewport = entries[0].isIntersecting;
    syncAutoplay();
  }).observe(block);

  block.addEventListener('mouseenter', () => { userPaused = true; syncAutoplay(); });
  block.addEventListener('mouseleave', () => { userPaused = false; syncAutoplay(); });
  block.addEventListener('focusin', () => { userPaused = true; syncAutoplay(); });
  block.addEventListener('focusout', (e) => {
    if (!block.contains(e.relatedTarget)) {
      userPaused = false;
      syncAutoplay();
    }
  });
}

/**
 * Creates a prev or next button with the appropriate icon and aria-label.
 * @param {string} label - `'previous'` or `'next'`
 * @returns {HTMLButtonElement}
 */
function buildNavButton(label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('button', 'outline', label);
  btn.setAttribute('aria-label', `${label} slide`); // TODO: localization
  const icon = document.createElement('span');
  icon.classList.add('icon', 'icon-arrow');
  if (label === 'previous') icon.classList.add('arrow-left');
  btn.append(icon);
  return btn;
}

/**
 * Builds the nav element containing prev/next buttons and index indicator dots.
 * @param {number} numSlides - Number of real slides; determines the dot count
 * @returns {{ nav: HTMLElement, prevBtn: HTMLButtonElement,
 *   nextBtn: HTMLButtonElement, indicators: HTMLOListElement }}
 */
function buildNav(numSlides) {
  const prevBtn = buildNavButton('previous');
  const nextBtn = buildNavButton('next');

  const indicators = document.createElement('ol');
  indicators.classList.add('indicators', 'button-wrapper');
  indicators.setAttribute('aria-label', 'Slide indicators'); // TODO: localization
  for (let i = 0; i < numSlides; i += 1) {
    const li = document.createElement('li');
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`); // TODO: localization
    li.append(dot);
    indicators.append(li);
  }

  const nav = document.createElement('nav');
  nav.classList.add('button-wrapper');
  nav.setAttribute('aria-label', 'Gallery navigation');
  nav.append(prevBtn, indicators, nextBtn);

  return {
    nav, prevBtn, nextBtn, indicators,
  };
}

/**
 * Prepends and appends boundary clones to enable the infinite scroll illusion.
 * @param {HTMLUListElement} ul - The track element, before clones are added
 * @param {HTMLLIElement[]} realSlides - The original (non-clone) slide elements
 */
function buildClones(ul, realSlides) {
  const total = realSlides.length;
  realSlides.forEach((li, i) => {
    li.classList.add('slide');
    li.dataset.index = i;
    li.setAttribute('aria-roledescription', 'slide');
    li.setAttribute('aria-label', `Slide ${i + 1} of ${total}`); // TODO: localization
  });

  const prependFrag = document.createDocumentFragment();
  realSlides.slice(-NUM_CLONES).forEach((li) => {
    const clone = li.cloneNode(true);
    clone.classList.add('clone');
    clone.inert = true;
    prependFrag.append(clone);
  });
  ul.prepend(prependFrag);

  const appendFrag = document.createDocumentFragment();
  realSlides.slice(0, NUM_CLONES).forEach((li) => {
    const clone = li.cloneNode(true);
    clone.classList.add('clone');
    clone.inert = true;
    appendFrag.append(clone);
  });
  ul.append(appendFrag);

  ul.classList.add('track');
}

/**
 * Initializes the infinite scroll carousel: clones, nav, scroll state, and event listeners.
 * @param {Element} block - The gallery block element
 * @param {HTMLUListElement} ul - The slide list, before clones are added
 */
function buildCarousel(block, ul) {
  const realSlides = [...ul.children];
  const numSlides = realSlides.length;

  if (numSlides <= 1) return;

  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', 'Gallery'); // TODO: localization
  block.setAttribute('aria-roledescription', 'carousel'); // TODO: localization

  buildClones(ul, realSlides);

  const {
    nav, prevBtn, nextBtn, indicators,
  } = buildNav(numSlides);

  let activeIndex = 0;
  let isTransitioning = false;
  let pendingCloneJump = false;
  const queue = [];

  const getVisible = () => getVisibleCount(numSlides);

  const scrollToTrack = (trackIndex, behavior) => {
    let resolvedBehavior = behavior;
    if (behavior === 'smooth' && reducedMotion.matches) resolvedBehavior = 'instant';
    ul.children[trackIndex].scrollIntoView({ behavior: resolvedBehavior, inline: 'center', block: 'nearest' });
  };

  const trackIndexAt = () => {
    const containerCenter = ul.scrollLeft + ul.offsetWidth / 2;
    let closest = NUM_CLONES;
    let minDist = Infinity;
    [...ul.children].forEach((child, i) => {
      const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - containerCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    return closest;
  };

  // maps track position to logical slide index, handling wrap-around
  const logicalOf = (trackIndex) => {
    const raw = (trackIndex - NUM_CLONES) % numSlides;
    return ((raw + numSlides) % numSlides);
  };

  const realOf = (logicalIndex) => logicalIndex + NUM_CLONES;

  const isCloneIndex = (trackIndex) => (
    trackIndex < NUM_CLONES || trackIndex >= NUM_CLONES + numSlides
  );

  const updateActive = (logicalIndex) => {
    activeIndex = logicalIndex;
    [...ul.children].forEach((li) => {
      if (li.classList.contains('clone')) return;
      li.dataset.state = parseInt(li.dataset.index, 10) === logicalIndex ? 'active' : '';
    });
    [...indicators.children].forEach((item, i) => {
      const btn = item.querySelector('button');
      const active = i === logicalIndex;
      btn.setAttribute('aria-current', active);
      btn.dataset.active = active;
    });
  };

  const processQueue = () => {
    if (isTransitioning || queue.length === 0) return;
    const step = queue.shift();
    isTransitioning = true;
    scrollToTrack(realOf(activeIndex) + step, 'smooth');
  };

  const onScrollEnd = () => {
    if (pendingCloneJump) {
      pendingCloneJump = false;
      isTransitioning = false;
      processQueue();
      return;
    }

    const ti = trackIndexAt();
    const logical = logicalOf(ti);

    updateActive(logical);

    if (isCloneIndex(ti)) {
      // landed on a clone; silently reposition to the real equivalent slide
      pendingCloneJump = true;
      scrollToTrack(realOf(logical), 'instant');
    } else {
      isTransitioning = false;
      processQueue();
    }
  };

  let scrollEndTimer;
  if ('onscrollend' in window) {
    ul.addEventListener('scrollend', onScrollEnd);
  } else {
    ul.addEventListener('scroll', () => {
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(onScrollEnd, 150);
    });
  }

  prevBtn.addEventListener('click', () => {
    queue.push(-1);
    processQueue();
  });

  nextBtn.addEventListener('click', () => {
    queue.push(1);
    processQueue();
  });

  [...indicators.children].forEach((item, i) => {
    item.querySelector('button').addEventListener('click', () => {
      if (i === activeIndex) return;
      queue.length = 0;
      isTransitioning = true;
      scrollToTrack(realOf(i), 'smooth');
    });
  });

  let resizeTimer;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      block.style.setProperty('--visible-slides', getVisible());
      scrollToTrack(realOf(activeIndex), 'instant');
    }, 50);
  });
  resizeObserver.observe(block);

  block.style.setProperty('--visible-slides', getVisible());
  updateActive(0);
  requestAnimationFrame(() => {
    scrollToTrack(realOf(0), 'instant');
  });

  block.append(nav);
  decorateIcons(nav);

  if (block.classList.contains('autoplay')) buildAutoplay(block, queue, processQueue);
}

export default async function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    [...row.children].forEach((col) => {
      const els = [...col.children];
      const isMedia = els.length > 0 && els.every((el) => el.tagName === 'PICTURE' || el.tagName === 'VIDEO');
      col.classList.add(isMedia ? 'media-wrapper' : 'body-wrapper');
      li.append(col);
    });
    ul.append(li);
  });
  block.replaceChildren(ul);
  detectThumbnail(block, ul);
  buildCarousel(block, ul);
}
