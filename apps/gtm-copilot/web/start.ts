import { createStart, createCsrfMiddleware } from '@tanstack/solid-start';

export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })],
}));
