import { createRouter } from '@tanstack/solid-router';
import { QueryClient } from '@tanstack/solid-query';
import { setupRouterSsrQueryIntegration } from '@tanstack/solid-router-ssr-query';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
  const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', defaultPreloadStaleTime: 0, scrollRestoration: true });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
declare module '@tanstack/solid-router' {
  interface Register { router: ReturnType<typeof getRouter> }
}
