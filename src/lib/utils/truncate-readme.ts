/**
 * Truncates a README string to a maximum length.
 *
 * Returns the first `maxLength` characters of the content.
 * If the content is shorter than maxLength, returns it unchanged.
 *
 * @param content - The README content to truncate
 * @param maxLength - Maximum length of the result (default: 500)
 * @returns A prefix of the original content with length min(L, maxLength)
 */
export function truncateReadme(content: string, maxLength: number = 500): string {
  return content.slice(0, maxLength);
}
