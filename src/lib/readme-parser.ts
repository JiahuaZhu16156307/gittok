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

  for (const line of lines) {
    const trimmed = line.trim();

    // Count headings — stop at the second major heading (## or #)
    if (trimmed.match(/^#{1,2}\s/)) {
      headingCount++;
      if (headingCount >= 2 && foundFirstContent) break; // Stop at second heading
      continue; // Skip the heading line itself
    }

    // Skip badges, images at the top, HTML blocks
    if (!foundFirstContent) {
      if (!trimmed) continue;
      if (trimmed.startsWith('![')) continue;
      if (trimmed.startsWith('<img')) continue;
      if (trimmed.startsWith('<p') && trimmed.includes('<img')) continue;
      if (trimmed.startsWith('[!')) continue;
      if (trimmed.match(/^\[!\[.*\]\(.*\)\]\(.*\)$/)) continue; // badge images
      if (trimmed.startsWith('<div') || trimmed.startsWith('</div')) continue;
      if (trimmed.startsWith('<a ') || trimmed.startsWith('</a>')) continue;
      if (trimmed.startsWith('---') || trimmed.startsWith('***')) continue;
      if (trimmed.startsWith('```')) continue;
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) continue; // tables
      if (trimmed.startsWith('<table') || trimmed.startsWith('<tr') || trimmed.startsWith('<td')) continue;
      if (trimmed.startsWith('</table') || trimmed.startsWith('</tr') || trimmed.startsWith('</td')) continue;
      // Skip lines that are mostly links/badges (contain many ]( patterns)
      if ((trimmed.match(/\]\(/g) || []).length >= 2) continue;
    }

    // Once we find real text, start collecting everything
    if (trimmed.length > 5) {
      foundFirstContent = true;
    }

    if (foundFirstContent) {
      // Keep empty lines as paragraph breaks
      if (!trimmed) {
        if (summaryLines.length > 0) summaryLines.push('');
        continue;
      }

      // Stop at section dividers
      if (trimmed.startsWith('---') || trimmed.startsWith('***')) break;
      if (trimmed.startsWith('```')) break;
      // Stop at tables
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) break;

      // Strip markdown formatting but keep the text
      const clean = trimmed
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
        .replace(/[*_`~]+/g, '') // bold/italic/code markers
        .replace(/<[^>]+>/g, '') // HTML tags
        .replace(/\s+/g, ' ')
        .trim();

      // Skip very short lines (likely leftover badge text or separators)
      if (clean && clean.length > 20) {
        summaryLines.push(clean);
        if (summaryLines.join('\n').length >= maxLength) break;
      }
    }
  }

  // Trim trailing empty lines
  while (summaryLines.length > 0 && summaryLines[summaryLines.length - 1] === '') {
    summaryLines.pop();
  }

  return summaryLines.join('\n').slice(0, maxLength);
}
