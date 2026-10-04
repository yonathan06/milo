import { createRootRouteWithContext, HeadContent, Link, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import stylesheet from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    links: [{ rel: 'stylesheet', href: stylesheet }, { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Marketing Prospector' },
    ],
  }),
  shellComponent: Root,
  errorComponent: () => (
    <main>
      <section className="panel" role="alert">
        <h1>We couldn’t load this page</h1>
        <div className="mt-4 flex items-center gap-4">
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
          <a href="/">Back to research runs</a>
        </div>
      </section>
    </main>
  ),
})

function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <a href="#workspace" className="sr-only focus:not-sr-only focus:block focus:p-4">Skip to workspace</a>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
            <Link to="/" className="flex items-center gap-3 text-slate-950 hover:no-underline"><span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-indigo-600 font-bold text-white">MP</span>Marketing Prospector</Link>
            <nav aria-label="Main" className="flex flex-wrap gap-4 text-sm">
              <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'underline' }}>Runs</Link>
              <Link to="/suggested-queries" activeProps={{ className: 'underline' }}>Suggested queries</Link>
              <Link to="/prospects" activeProps={{ className: 'underline' }}>All prospects</Link>
            </nav>
          </div>
        </header>
        <div id="workspace" tabIndex={-1}>{children}</div>
        <Scripts />
      </body>
    </html>
  )
}

