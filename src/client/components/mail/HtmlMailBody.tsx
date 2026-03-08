/**
 * HtmlMailBody — renders HTML mail content in a sandboxed iframe.
 *
 * System notifications from the game server arrive as HTML, often with
 * META REFRESH redirects to dynamic ASP pages on the World Web Server.
 */

import { extractMetaRefreshUrl } from '@/shared/mail-html-utils';
import styles from './MailPanel.module.css';

interface HtmlMailBodyProps {
  body: string[];
}

export function HtmlMailBody({ body }: HtmlMailBodyProps) {
  const html = body.join('\n');
  const redirectUrl = extractMetaRefreshUrl(html);

  // META REFRESH → load the game server page directly in an iframe
  if (redirectUrl) {
    return (
      <iframe
        className={styles.htmlBody}
        src={redirectUrl}
        sandbox="allow-same-origin"
        title="Mail content"
      />
    );
  }

  // Static HTML → render with srcdoc in a fully sandboxed iframe
  return (
    <iframe
      className={styles.htmlBody}
      srcDoc={html}
      sandbox=""
      title="Mail content"
    />
  );
}
