/**
 * README markdown parser — extracts first image and summary text.
 */

/** Extract the first image URL from markdown content */
export function extractFirstImage(markdown: string): string | null {
  // Match ![alt](url)
  const mdMatch = markdown.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) return mdMatch[1];

  // Match <img src="url">
  const htmlMatch = markdown.match(/<img[^>]+src=["'](https?:\/\/[^\s"']+)["']/i);
  if (htmlMatch) return htmlMatch[1];

  // Match raw githubusercontent image URLs on their own line
  const rawMatch = markdown.match(/(https?:\/\/raw\.githubusercontent\.com\/[^\s)]+\.(png|jpg|jpeg|gif|svg|webp))/i);
  if (rawMatch) return rawMatch[1];

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
