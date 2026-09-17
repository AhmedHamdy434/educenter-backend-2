import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  centerId?: string | null;
  role?: string | null;
  userId?: string | null;
  isSuperAdmin?: boolean;
  bypassTenant?: boolean;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}
