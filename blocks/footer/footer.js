import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { decorateExternalLinks } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * Returns a named footer section from within the block.
 * @param {Element} block - The footer block element
 * @param {string} sectionName - The section name, matching the footer-{name} class
 * @returns {Element|null} The section element, or `null` if not found
 */
function getSection(block, sectionName) {
  return block.querySelector(`.footer-${sectionName}`);
}

/**
 * Wraps each direct h2+ul pair within a container in a details/summary.
 * @param {Element} container - The element whose direct h2+ul children to transform
 */
function decorateDetails(container) {
  const mq = window.matchMedia('(width >= 600px)');
  const created = [];

  container.querySelectorAll(':scope > h2').forEach((heading) => {
    const list = heading.nextElementSibling;
    if (!list || list.tagName !== 'UL') return;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = heading.textContent;
    const chevron = document.createElement('span');
    chevron.classList.add('icon', 'icon-chevron');
    summary.append(chevron);
    details.append(summary, list);
    heading.replaceWith(details);
    created.push({ details, list, summary });

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (mq.matches) return;
      if (details.open) {
        list.style.height = `${list.scrollHeight}px`;
        list.getBoundingClientRect();
        list.style.height = '0';
        list.addEventListener('transitionend', () => {
          details.removeAttribute('open');
        }, { once: true });
      } else {
        details.setAttribute('open', '');
        const targetHeight = list.scrollHeight;
        list.style.height = '0';
        list.getBoundingClientRect();
        list.style.height = `${targetHeight}px`;
      }
    });
  });

  const handleBreakpoint = ({ matches }) => {
    created.forEach(({ details, list, summary }) => {
      if (matches) {
        details.setAttribute('open', '');
        summary.setAttribute('tabindex', '-1');
      } else {
        details.removeAttribute('open');
        summary.removeAttribute('tabindex');
      }
      list.style.height = '';
    });
  };

  mq.addEventListener('change', handleBreakpoint);
  handleBreakpoint(mq);
}

/**
 * Replaces the section div with a nav landmark.
 * @param {Element} section - The footer-nav section element to promote
 */
function decorateNav(section) {
  const content = section.querySelector('div');
  if (!content) return;
  decorateDetails(content);
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Footer'); // TODO: localization
  nav.classList.add(...section.classList);
  nav.append(...content.children);
  section.replaceWith(nav);
}

/**
 * Wraps the h2+ul pair in a disclosure widget.
 * @param {Element} section - The footer-brand section element
 */
function decorateBrand(section) {
  const content = section.querySelector('div');
  if (!content) return;
  decorateDetails(content);
}

/**
 * Builds the locale trigger button and popover from the authored region/language list.
 * @param {Element} section - The footer-locale section element
 */
function decorateLocale(section) {
  const source = section.querySelector('ul');
  if (!source) return;

  const regions = [...source.querySelectorAll(':scope > li')];

  let activeLang = '';
  let activeRegion = '';

  regions.forEach((region) => {
    const strong = region.querySelector('strong');
    if (!strong) return;
    activeLang = strong.textContent.trim();
    const p = region.querySelector('p');
    activeRegion = p ? p.textContent.trim() : '';
  });

  const button = document.createElement('button');
  button.setAttribute('aria-expanded', false);
  button.setAttribute('aria-controls', 'footer-locale-picker');
  const globe = document.createElement('span');
  globe.classList.add('icon', 'icon-globe');
  const chevron = document.createElement('span');
  chevron.classList.add('icon', 'icon-chevron');
  button.append(globe, `${activeRegion} – ${activeLang}`, chevron);

  const popover = document.createElement('div');
  popover.id = 'footer-locale-picker';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Select region and language'); // TODO: localization
  popover.hidden = true;

  const form = document.createElement('form');

  const regionLabel = document.createElement('label');
  regionLabel.htmlFor = 'footer-locale-region';
  regionLabel.textContent = 'Region'; // TODO: localization

  const select = document.createElement('select');
  select.id = 'footer-locale-region';

  const langLists = [];

  regions.forEach((region) => {
    const p = region.querySelector('p');
    const regionName = p ? p.textContent.trim() : '';

    const option = document.createElement('option');
    option.value = regionName;
    option.textContent = regionName;
    option.selected = regionName === activeRegion;
    select.append(option);

    const langList = document.createElement('ul');
    langList.dataset.region = regionName;
    langList.hidden = regionName !== activeRegion;

    region.querySelectorAll(':scope > ul > li').forEach((li) => {
      const item = document.createElement('li');
      item.textContent = li.textContent.trim();
      if (li.querySelector('strong')) item.setAttribute('aria-current', 'true');
      langList.append(item);
    });

    langLists.push(langList);
  });

  select.addEventListener('change', () => {
    langLists.forEach((list) => {
      list.hidden = list.dataset.region !== select.value;
    });
  });

  const formChevron = document.createElement('span');
  formChevron.classList.add('icon', 'icon-chevron');
  form.append(regionLabel, select, formChevron);
  popover.append(form, ...langLists);

  form.addEventListener('click', (e) => {
    if (e.target === select) return;
    select.showPicker();
  });

  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', !expanded);
    popover.hidden = expanded;
    if (!expanded) select.focus();
  });

  popover.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = popover.querySelectorAll('select, button, input, a[href]');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (section.contains(e.target)) return;
    button.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || popover.hidden) return;
    button.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
    button.focus();
  });

  section.textContent = '';
  section.append(button, popover);
}

/**
 * Adds accessible labels to icon-only social links, derived from each link's URL.
 * @param {Element} section - The social section element
 */
function decorateSocial(section) {
  section.querySelectorAll('a[href]').forEach((link) => {
    const { hostname } = new URL(link.href);
    const host = hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    link.setAttribute('aria-label', label);
  });
}

/**
 * Loads and decorates the footer.
 * @param {Element} block - The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  block.textContent = '';
  block.append(...fragment.children);

  const sections = ['nav', 'locale', 'social', 'brand', 'utility', 'copyright'];
  sections.forEach((s, i) => {
    const section = block.children[i];
    if (section) section.classList.add(`footer-${s}`);
  });

  const nav = getSection(block, 'nav');
  if (nav) decorateNav(nav);

  const locale = getSection(block, 'locale');
  if (locale) decorateLocale(locale);

  const brand = getSection(block, 'brand');
  if (brand) decorateBrand(brand);

  const social = getSection(block, 'social');
  if (social) decorateSocial(social);

  decorateExternalLinks(block);
  decorateIcons(block);
}
