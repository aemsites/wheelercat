import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const SECTIONS = ['nav', 'region', 'social', 'brands', 'legal', 'copyright'];

const NAV_COLUMNS = [
  ['products', 'your-business'],
  ['finance'],
  ['support'],
  ['company', 'news'],
  ['buying-tools'],
];

const SOCIAL_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

/**
 * Returns whether a URL points off-site.
 * @param {string} href
 * @returns {boolean}
 */
function isExternalLink(href) {
  try {
    return new URL(href, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Marks external text links for safe off-site navigation.
 * @param {Element} root
 */
function decorateExternalLinks(root) {
  root.querySelectorAll('a[href]').forEach((link) => {
    if (!isExternalLink(link.href) || link.querySelector('.icon')) return;

    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const label = link.textContent.trim();
    if (label) {
      link.setAttribute('aria-label', `${label} (opens in new tab)`);
    }
  });
}

/**
 * Groups authored h2/link lists into five desktop columns.
 * @param {Element} section
 */
function decorateNav(section) {
  const wrapper = section.querySelector(':scope > div') || section;
  const groups = new Map();

  wrapper.querySelectorAll('h2[id]').forEach((heading) => {
    const group = document.createElement('div');
    group.className = 'footer-group';
    group.dataset.section = heading.id;

    const list = heading.nextElementSibling;
    group.append(heading);
    if (list) group.append(list);
    groups.set(heading.id, group);
  });

  const columns = document.createElement('div');
  columns.className = 'footer-nav-columns';

  NAV_COLUMNS.forEach((ids) => {
    const column = document.createElement('div');
    column.className = 'footer-column';
    ids.forEach((id) => {
      const group = groups.get(id);
      if (group) column.append(group);
    });
    if (column.hasChildNodes()) columns.append(column);
  });

  wrapper.textContent = '';
  wrapper.append(columns);
  decorateExternalLinks(section);
}

/**
 * Promotes the region selector to a labeled nav landmark.
 * @param {Element} section
 */
function decorateRegion(section) {
  const wrapper = section.querySelector(':scope > div') || section;
  const list = wrapper.querySelector('ul');
  if (!list) return;

  const languages = list.querySelector(':scope > li > ul');
  if (languages) languages.classList.add('footer-region-languages');

  const nav = document.createElement('nav');
  nav.className = 'footer-region-nav';
  nav.setAttribute('aria-label', 'Region and language');
  nav.append(list);

  wrapper.textContent = '';
  wrapper.append(nav);
}

/**
 * Adds accessible names to icon-only social links.
 * @param {Element} section
 */
function decorateSocial(section) {
  const wrapper = section.querySelector(':scope > div') || section;
  const list = wrapper.querySelector('ul');
  if (!list) return;

  list.querySelectorAll('a[href]').forEach((link) => {
    const iconClass = [...link.querySelectorAll('[class*="icon-"]')]
      .flatMap((el) => [...el.classList])
      .find((name) => name.startsWith('icon-') && name !== 'icon');
    const platform = iconClass?.replace('icon-', '');
    link.setAttribute('aria-label', SOCIAL_LABELS[platform] || platform || link.href);
  });

  const nav = document.createElement('nav');
  nav.className = 'footer-social-nav';
  nav.setAttribute('aria-label', 'Social media');
  nav.append(list);

  wrapper.textContent = '';
  wrapper.append(nav);
}

/**
 * Wraps the brands heading and list for styling.
 * @param {Element} section
 */
function decorateBrands(section) {
  const wrapper = section.querySelector(':scope > div') || section;
  const heading = wrapper.querySelector('h2');
  const list = wrapper.querySelector('ul');
  if (!heading || !list) return;

  const content = document.createElement('div');
  content.className = 'footer-brands-content';
  content.append(heading, list);

  wrapper.textContent = '';
  wrapper.append(content);
  decorateExternalLinks(section);
}

/**
 * Promotes legal links to a labeled nav landmark.
 * @param {Element} section
 */
function decorateLegal(section) {
  const wrapper = section.querySelector(':scope > div') || section;
  const list = wrapper.querySelector('ul');
  if (!list) return;

  const nav = document.createElement('nav');
  nav.className = 'footer-legal-nav';
  nav.setAttribute('aria-label', 'Legal and site information');
  nav.append(list);

  wrapper.textContent = '';
  wrapper.append(nav);
  decorateExternalLinks(section);
}

/**
 * Groups the region and social rows for desktop layout.
 * @param {Element} region
 * @param {Element} social
 */
function wrapUtility(region, social) {
  const utility = document.createElement('div');
  utility.className = 'footer-utility';
  region.before(utility);
  utility.append(region, social);
}

/**
 * Ensures decorative icons do not duplicate link names.
 * @param {Element} block
 */
function hideDecorativeIconLabels(block) {
  block.querySelectorAll('a[aria-label] .icon img, nav[aria-label] .icon img').forEach((img) => {
    img.alt = '';
  });
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  block.textContent = '';
  block.append(...fragment.children);

  SECTIONS.forEach((name, index) => {
    const section = block.children[index];
    if (section) section.classList.add(`footer-${name}`);
  });

  const nav = block.querySelector('.footer-nav');
  if (nav) decorateNav(nav);

  const region = block.querySelector('.footer-region');
  const social = block.querySelector('.footer-social');
  if (region && social) wrapUtility(region, social);
  if (region) decorateRegion(region);
  if (social) decorateSocial(social);

  const brands = block.querySelector('.footer-brands');
  if (brands) decorateBrands(brands);

  const legal = block.querySelector('.footer-legal');
  if (legal) decorateLegal(legal);

  decorateIcons(block);
  hideDecorativeIconLabels(block);
}
