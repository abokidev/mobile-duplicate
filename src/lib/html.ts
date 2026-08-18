/** Minimal, dependency-free HTML helpers for server-rendered pages. */

/** Escape a value for safe interpolation into HTML text / attributes. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tagged template that escapes every interpolation by default.
 *  Wrap already-safe HTML fragments in `raw()` to opt out. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out += (v instanceof Raw ? v.value : esc(v)) + strings[i + 1];
  }
  return out;
}

class Raw {
  constructor(public readonly value: string) {}
}
export function raw(value: string): Raw {
  return new Raw(value);
}

export interface LayoutOptions {
  title: string;
  bodyHtml: string;
  /** Load the progressive-enhancement script (selection page only). */
  withScript?: boolean;
}

/** Shared page shell: accent bar, masthead, card container, footer. */
export function layout(opts: LayoutOptions): string {
  const year = 2026;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta name="referrer" content="no-referrer" />
<title>${esc(opts.title)}</title>
<link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
<div class="page">
  <div class="accent-bar"></div>
  <header class="masthead">
    <p class="brand"><strong>Dragnet</strong> &nbsp;·&nbsp; ExxonMobil Affiliates in Nigeria</p>
  </header>
  <main class="wrap">
    ${opts.bodyHtml}
  </main>
  <footer class="footer">
    Dragnet Solutions Limited &nbsp;<span class="sep">|</span>&nbsp; on behalf of ExxonMobil Affiliates in Nigeria<br />
    This link is personal to you. Please do not forward it. &copy; ${year}
  </footer>
</div>
${opts.withScript ? '<script src="/assets/app.js" defer></script>' : ''}
</body>
</html>`;
}
