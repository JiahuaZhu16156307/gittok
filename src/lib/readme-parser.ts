/**
 * README markdown parser — extracts first image and summary text.
 */

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp|avif)(?:[?#].*)?$/i;
const IMAGE_HOSTS = [
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'opengraph.githubassets.com',
  'repository-images.githubusercontent.com',
  'camo.githubusercontent.com',
  'github.com',
];
const BADGE_HOSTS = [
  'img.shields.io',
  'badge.fury.io',
  'badgen.net',
  'github.com/actions',
  'github.com/badges',
];

function cleanImageUrl(value: string): string {
  return value
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/&amp;/g, '&');
}

function isDisplayableImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(cleanImageUrl(value));
  } catch {
    return false;
  }

  const normalized = `${url.hostname}${url.pathname}`.toLowerCase();
  if (BADGE_HOSTS.some((host) => normalized.includes(host))) {
    return false;
  }

  if (IMAGE_EXTENSION_RE.test(url.pathname)) {
    return true;
  }

  return IMAGE_HOSTS.some((host) => url.hostname.toLowerCase() === host);
}

function firstDisplayableImage(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const imageUrl = cleanImageUrl(candidate);
    if (isDisplayableImageUrl(imageUrl)) {
      return imageUrl;
    }
  }
  return null;
}

function isNoiseLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (trimmed.startsWith('![')) return true;
  if (trimmed.startsWith('[!')) return true;
  if (trimmed.match(/^\[!\[.*\]\(.*\)\]\(.*\)$/)) return true;
  if (trimmed.match(/^\[[^\]]+\]:\s*\S+/)) return true;
  if (trimmed.startsWith('<!--') || trimmed.startsWith('-->')) return true;
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return true;
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) return true;
  if (trimmed.startsWith('---') || trimmed.startsWith('***') || trimmed.startsWith('___')) return true;
  if (trimmed.startsWith('```')) return true;

  const linkCount = (trimmed.match(/\]\(/g) || []).length;
  if (linkCount >= 2) return true;

  const badgeHostCount = BADGE_HOSTS.filter((host) =>
    trimmed.toLowerCase().includes(host)
  ).length;
  return badgeHostCount > 0;
}

function cleanSummaryLine(trimmed: string): string {
  return trimmed
    .replace(/!\[[^\]]*]\([^)]+\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '') // HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/[*_`~]+/g, '') // markdown emphasis/code markers
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the first displayable image URL from markdown content */
export function extractFirstImage(markdown: string): string | null {
  const markdownImages = markdown.matchAll(/!\[[^\]]*]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g);
  const markdownImage = firstDisplayableImage(Array.from(markdownImages, (match) => match[1]));
  if (markdownImage) return markdownImage;

  const htmlImages = markdown.matchAll(/<img[^>]+src=["'](https?:\/\/[^\s"']+)["']/gi);
  const htmlImage = firstDisplayableImage(Array.from(htmlImages, (match) => match[1]));
  if (htmlImage) return htmlImage;

  const rawImages = markdown.matchAll(/(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|svg|webp|avif)(?:[?#][^\s)]*)?)/gi);
  const rawImage = firstDisplayableImage(Array.from(rawImages, (match) => match[1]));
  if (rawImage) return rawImage;

  return null;
}

/** Extract the first meaningful section as summary (everything before the second heading) */
export function extractSummary(markdown: string, maxLength: number = 2000): string {
  const lines = markdown.split('\n');
  const summaryLines: string[] = [];
  let foundFirstContent = false;
  let headingCount = 0;
  let insideHtmlComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (insideHtmlComment) {
      if (trimmed.includes('-->')) {
        insideHtmlComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) {
        insideHtmlComment = true;
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      if (foundFirstContent) break;
      continue;
    }

    // Count headings — stop at the second major heading (## or #)
    if (trimmed.match(/^#{1,2}\s/)) {
      headingCount++;
      if (headingCount >= 2 && foundFirstContent) break; // Stop at second heading
      continue; // Skip the heading line itself
    }

    if (foundFirstContent) {
      // Keep empty lines as paragraph breaks
      if (!trimmed) {
        if (summaryLines.length > 0) summaryLines.push('');
        continue;
      }
    }

    if (isNoiseLine(trimmed)) continue;

    const clean = cleanSummaryLine(trimmed);
    if (!clean || clean.length <= 20) continue;

    foundFirstContent = true;
    summaryLines.push(clean);
    if (summaryLines.join('\n').length >= maxLength) break;
  }

  // Trim trailing empty lines
  while (summaryLines.length > 0 && summaryLines[summaryLines.length - 1] === '') {
    summaryLines.pop();
  }

  return summaryLines.join('\n').slice(0, maxLength);
}
