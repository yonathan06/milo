import { createRootRouteWithContext, HeadContent, Link, Scripts } from '@tanstack/solid-router';
import type { QueryClient } from '@tanstack/solid-query';
import { HydrationScript } from 'solid-js/web';
import type { JSX } from 'solid-js';
import { NotFound, RouteError } from '../components/ui';
import css from '../styles.css?url';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ charset: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'GTM Copilot · Research explorer' }], links: [{ rel: 'stylesheet', href: css }, { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] }),
  shellComponent: Document,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
  pendingComponent: () => <p role="status" class="py-16 text-center text-slate-500">Loading research…</p>,
});
function Document(props: { children: JSX.Element }) {
  return <html lang="en"><head><HydrationScript /><HeadContent /></head><body>
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">Skip to content</a>
    <div class="min-h-screen bg-slate-50 text-slate-900">
      <header class="border-b border-slate-200 bg-white"><div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link to="/" class="flex items-center gap-3"><span class="flex size-9 items-center justify-center rounded-xl bg-teal-800 text-sm font-bold text-white">G</span><span class="font-semibold tracking-tight">GTM Copilot</span></Link>
        <nav aria-label="Main navigation" class="flex items-center gap-5 text-sm"><Link to="/" class="font-medium text-slate-600 hover:text-teal-700">Segments</Link><Link to="/results" class="font-medium text-slate-600 hover:text-teal-700">All results</Link><span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">Research workspace</span></nav>
      </div></header>
      <main id="main" class="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">{props.children}</main>
      <footer class="mx-auto max-w-6xl px-5 py-8 text-xs text-slate-400 sm:px-8">Local research explorer · AI query planning · No outreach actions</footer>
    </div><Scripts />
  </body></html>;
}
