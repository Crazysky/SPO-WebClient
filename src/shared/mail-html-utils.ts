/**
 * Mail HTML utilities — detect HTML content and extract META REFRESH URLs.
 *
 * Mail bodies from the Delphi game server can be either plain text (user-composed)
 * or HTML (system notifications that redirect to ASP pages on the World Web Server).
 */

/**
 * Check whether mail body lines contain HTML content.
 * System messages start with HTML document tags like `<HEAD>`, `<META>`, `<BODY>`.
 */
export function isHtmlContent(bodyLines: string[]): boolean {
  const joined = bodyLines.join('\n').trimStart();
  return /^<(!DOCTYPE|HTML|HEAD|META|BODY)\b/i.test(joined);
}

/**
 * Extract the redirect URL from a META HTTP-EQUIV="REFRESH" tag.
 * Returns null if no META REFRESH is present.
 *
 * @example
 * extractMetaRefreshUrl('<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://example.com/page">')
 * // => 'http://example.com/page'
 */
export function extractMetaRefreshUrl(html: string): string | null {
  const match = html.match(
    /<META[^>]*HTTP-EQUIV\s*=\s*"REFRESH"[^>]*CONTENT\s*=\s*"[^"]*URL\s*=\s*([^">\s]+)/i,
  );
  return match?.[1]?.trim() ?? null;
}
