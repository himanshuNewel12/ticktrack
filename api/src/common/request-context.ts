import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  userId: string | null;
  ip: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();
