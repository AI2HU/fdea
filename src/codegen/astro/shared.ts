import type { DesignTokens } from "../../contracts/project.js";
import { themeCss, vuePrimitiveFiles } from "../adonis/emitShell.js";
import { file, quote, type GeneratedFile } from "../files.js";

export interface NavLink {
  readonly label: string;
  readonly href: string;
}

const PAGE_HEADER = `---
interface Props {
  title: string
  description?: string | undefined
}

const { title, description } = Astro.props
---

<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
  <div class="grid gap-1">
    <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
    {description && <p class="text-sm text-muted-foreground">{description}</p>}
  </div>
  {
    Astro.slots.has('actions') && (
      <div class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    )
  }
</div>
`;

const layoutFile = (siteName: string, nav: readonly NavLink[]): string => `---
import '~/styles/global.css'

interface Props {
  title?: string | undefined
}

const { title } = Astro.props
const siteName = ${quote(siteName)}
const nav = ${JSON.stringify(nav, null, 2)}
const path = Astro.url.pathname
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="generator" content={Astro.generator} />
    <title>{title ? \`\${title} - \${siteName}\` : siteName}</title>
  </head>
  <body>
    <div class="min-h-screen bg-background">
      <header class="border-b">
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <a href="/" class="font-semibold tracking-tight">{siteName}</a>
          <nav class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {
              nav.map((item) => (
                <a
                  href={item.href}
                  class:list={[
                    'rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-accent',
                    path.startsWith(item.href) ? 'bg-accent font-medium' : 'text-muted-foreground',
                  ]}
                >
                  {item.label}
                </a>
              ))
            }
          </nav>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-4 py-8">
        <slot />
      </main>
    </div>
  </body>
</html>
`;

const NOT_FOUND = `---
import Site from '~/layouts/site.astro'
---

<Site title="Page not found">
  <div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
    <h1 class="text-2xl font-semibold tracking-tight">Page not found</h1>
    <p class="text-sm text-muted-foreground">The page you are looking for does not exist.</p>
    <a
      href="/"
      class="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
    >
      Back to the site
    </a>
  </div>
</Site>
`;

/** Design tokens, Vue primitives, the site layout and the 404 page. */
export const astroShellFiles = (
  siteName: string,
  tokens: DesignTokens,
  nav: readonly NavLink[],
): GeneratedFile[] => [
  file("src/styles/global.css", themeCss(tokens)),
  ...vuePrimitiveFiles("src"),
  file("src/components/page_header.astro", PAGE_HEADER),
  file("src/layouts/site.astro", layoutFile(siteName, nav)),
  file("src/pages/404.astro", NOT_FOUND),
];
