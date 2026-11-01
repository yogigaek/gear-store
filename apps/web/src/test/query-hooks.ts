import type { QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';

// A stand-in for TanStack Query's hooks, so the lib's hooks can be called outside a rendered tree: useQuery hands
// back its options (and a state a test sets), useMutation runs mutationFn and the callbacks in TanStack's order.
// Test files mock '@tanstack/react-query' with `mockReactQuery` and './auth-context' with `auth`.

type Options = Record<string, any>;

export interface QueryState {
  data?: unknown;
  error?: unknown;
  isPending?: boolean;
  isFetching?: boolean;
}

export interface FakeMutation {
  options: Options;
  isPending: boolean;
  error: unknown;
  mutateAsync: (vars?: unknown) => Promise<unknown>;
  mutate: (vars?: unknown, callbacks?: Options) => void;
}

// the real QueryClient, taken from the module being mocked (importing it here would wait on that mock)
let Client: new () => QueryClient;

export const hooks = {
  client: null as unknown as QueryClient,
  queries: [] as Options[],
  mutations: [] as FakeMutation[],
  /** the state useQuery returns for a query, by its options */
  state: (_options: Options): QueryState => ({ isPending: true, isFetching: false, error: null }),
};

export const auth = {
  status: 'signed-in' as 'restoring' | 'signed-in' | 'signed-out',
  user: null,
  /** as AuthProvider does it, with the token "t" */
  authed: vi.fn(async <T>(call: (accessToken: string) => Promise<T>) => call('t')),
};

export function resetHooks() {
  hooks.client = new Client();
  hooks.queries = [];
  hooks.mutations = [];
  hooks.state = () => ({ isPending: true, isFetching: false, error: null });
  auth.status = 'signed-in';
  auth.authed.mockClear();
}

async function run(options: Options, vars: unknown) {
  const context = await options.onMutate?.(vars);
  try {
    const data = await options.mutationFn(vars);
    await options.onSuccess?.(data, vars, context);
    await options.onSettled?.(data, null, vars, context);
    return data;
  } catch (error) {
    await options.onError?.(error, vars, context);
    await options.onSettled?.(undefined, error, vars, context);
    throw error;
  }
}

export function mockReactQuery(actual: { QueryClient: new () => QueryClient }) {
  Client = actual.QueryClient;
  return {
    ...actual,
    useQueryClient: () => hooks.client,
    useQuery: (options: Options) => {
      hooks.queries.push(options);
      return { options, ...hooks.state(options) };
    },
    useMutation: (options: Options) => {
      const mutation: FakeMutation = {
        options,
        isPending: false,
        error: null,
        mutateAsync: (vars) => run(options, vars),
        mutate: (vars, callbacks) =>
          void run(options, vars).then(
            (data) => {
              callbacks?.onSuccess?.(data, vars);
              callbacks?.onSettled?.(data, null, vars);
            },
            (error) => {
              callbacks?.onError?.(error, vars);
              callbacks?.onSettled?.(undefined, error, vars);
            },
          ),
      };
      hooks.mutations.push(mutation);
      return mutation;
    },
  };
}

/** the last query a hook asked for, by its key's start */
export function query(...key: unknown[]): Options {
  const found = [...hooks.queries]
    .reverse()
    .find((q) => key.every((part, i) => JSON.stringify(q.queryKey[i]) === JSON.stringify(part)));
  if (!found) throw new Error(`no query ${JSON.stringify(key)}`);
  return found;
}

/** runs a query's function as TanStack would */
export const fetchQuery = (options: Options) => options.queryFn({ signal: new AbortController().signal });

/** a hook called as a plain function (no component): keeps hook names out of test callbacks */
export const call = <A extends unknown[], R>(hook: (...args: A) => R, ...args: A): R => hook(...args);

export interface Sent {
  method: string;
  path: string;
  body: unknown;
  auth: string | undefined;
}

/** a fetch that answers `/api…` from `routes` ("METHOD /path"), recording what was sent */
export function fakeApi(routes: Record<string, (body: unknown) => unknown>) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = url.slice('/api'.length);
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      sent.push({ method, path, body, auth: (init.headers as Record<string, string>).Authorization });
      const handler = routes[`${method} ${path}`];
      if (!handler) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      const reply = handler(body);
      if (reply instanceof Response) return reply;
      return reply === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(reply), { status: 200 });
    }),
  );
  return sent;
}
