/**
 * Builds a YouTube iframe from a youtube.com or youtu.be URL.
 * @param {string} url - the video page or short URL to parse
 * @returns {HTMLIFrameElement|null} configured embed iframe
 */
function createYouTubeEmbed(url) {
  const { hostname, pathname, searchParams } = new URL(url);
  const isYouTube = hostname === 'youtu.be' || hostname.endsWith('youtube.com');
  if (!isYouTube) return null;

  const id = hostname === 'youtu.be' ? pathname.slice(1) : searchParams.get('v');
  if (!id) return null;

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}`;
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.title = 'YouTube video';
  return iframe;
}

/**
 * Builds a thumbnail overlay that removes itself and starts embed playback when activated.
 * @param {HTMLElement} block - block element containing the authored thumbnail image
 * @param {HTMLIFrameElement} embed - video iframe; receives autoplay=1 on activation
 * @returns {HTMLElement|null} the placeholder figure, or null if no image is found in block
 */
function createPlaceholder(block, embed) {
  const image = block.querySelector('picture, img');
  if (!image) return null;

  const figure = document.createElement('figure');
  figure.classList.add('placeholder');
  figure.setAttribute('role', 'button');
  figure.setAttribute('tabindex', '0');
  figure.append(image);

  function play() {
    const src = new URL(embed.src);
    src.searchParams.set('autoplay', '1');
    embed.src = src.href;
    figure.remove();
  }

  figure.addEventListener('click', play);
  figure.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      play();
    }
  });

  return figure;
}

/**
 * Tries each registered provider against url and returns the matched embed and provider name.
 * @param {string} url - the video URL to match against registered providers
 * @returns {{ embed: HTMLIFrameElement|null, source: string|null }} embed element and provider name
 */
function createEmbed(url) {
  const providers = [['youtube', createYouTubeEmbed]];
  let embed = null;
  let source = null;
  providers.some(([name, create]) => {
    embed = create(url);
    if (embed) source = name;
    return embed;
  });
  return { embed, source };
}

export default function decorate(block) {
  const link = block.querySelector('a[href]');
  if (!link) {
    const wrapper = block.closest('.video-wrapper');
    if (wrapper) wrapper.remove();
    return;
  }

  const { embed, source } = createEmbed(link.href);
  if (!embed) return;
  block.dataset.source = source;
  const placeholder = createPlaceholder(block, embed);

  block.replaceChildren(...[embed, placeholder].filter(Boolean));
}
