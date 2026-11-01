import type { User } from '@gear-store/shared';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthValue } from './auth-context';
import type { Session, SessionEvents } from './session';

// AuthProvider only wires a session (session.ts, tested on its own) to React state: its hooks are stood in for
// here, so the wiring can be read without rendering
const hooks = vi.hoisted(() => ({
  setters: [] as ((next: unknown) => void)[],
  values: [] as unknown[],
  effects: [] as (() => unknown)[],
  context: null as unknown,
  hint: false,
  events: null as SessionEvents | null,
  removeQueries: (() => undefined) as (filters: unknown) => void,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (init: unknown) => {
    const value = typeof init === 'function' ? (init as () => unknown)() : init;
    const index = hooks.values.push(value) - 1;
    const set = (next: unknown) => {
      hooks.values[index] =
        typeof next === 'function' ? (next as (v: unknown) => unknown)(hooks.values[index]) : next;
    };
    hooks.setters.push(set);
    return [value, set];
  },
  useEffect: (effect: () => unknown) => void hooks.effects.push(effect),
  useMemo: (factory: () => unknown) => factory(),
  use: () => hooks.context,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: (filters: unknown) => hooks.removeQueries(filters) }),
}));
const session = {
  start: vi.fn(() => () => undefined),
  authed: vi.fn(),
  signIn: vi.fn(),
  signInDemo: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn(),
} satisfies Session;
vi.mock('./session', () => ({
  hasHint: () => hooks.hint,
  createSession: (events: SessionEvents) => {
    hooks.events = events;
    return session;
  },
}));

const { AuthProvider } = await import('./auth');
const { useAuth: readAuth } = await import('./auth-context');

const user: User = {
  id: crypto.randomUUID(),
  email: 'a@test.example',
  name: 'A',
  role: 'CUSTOMER',
  emailVerified: true,
  isDemo: false,
};
const render = () => (AuthProvider({ children: 'page' }) as ReactElement<{ value: AuthValue }>).props.value;
// [status, user, session]
const status = () => hooks.values[0];

beforeEach(() => {
  hooks.setters = [];
  hooks.values = [];
  hooks.effects = [];
  hooks.hint = false;
  hooks.removeQueries = vi.fn();
});

describe('AuthProvider', () => {
  it('starts signed out without a session hint, and restoring with one', () => {
    expect(render().status).toBe('signed-out');
    hooks.values = [];
    hooks.hint = true;
    expect(render().status).toBe('restoring');
  });

  it('hands the session’s calls to the page and starts it once mounted', () => {
    const value = render();
    expect(value).toMatchObject({
      user: null,
      authed: session.authed,
      signIn: session.signIn,
      signInDemo: session.signInDemo,
      signOut: session.signOut,
    });
    expect(session.start).not.toHaveBeenCalled();
    expect(hooks.effects).toHaveLength(1);
    expect(typeof hooks.effects[0]!()).toBe('function');
    expect(session.start).toHaveBeenCalledOnce();
  });

  it('shows the user once signed in, and clears the account’s data once signed out', () => {
    render();
    hooks.events!.signedIn(user);
    expect(hooks.values.slice(0, 2)).toEqual(['signed-in', user]);
    hooks.events!.signedOut();
    expect(hooks.values.slice(0, 2)).toEqual(['signed-out', null]);
    expect(hooks.removeQueries).toHaveBeenCalledWith({ queryKey: ['me'] });
  });

  it('shows a page still restoring as signed out when the API cannot be reached, and leaves a session alone', () => {
    hooks.hint = true;
    render();
    hooks.events!.unreachable();
    expect(status()).toBe('signed-out');
    hooks.values[0] = 'signed-in';
    hooks.events!.unreachable();
    expect(status()).toBe('signed-in');
  });

  it('lets a page change the user shown (a renamed profile)', () => {
    render().setUser(user);
    expect(hooks.values[1]).toBe(user);
  });
});

describe('useAuth', () => {
  it('fails loudly outside AuthProvider', () => {
    hooks.context = null;
    expect(() => readAuth()).toThrow('useAuth outside AuthProvider');
  });

  it('returns the provider’s value', () => {
    hooks.context = { status: 'signed-out' };
    expect(readAuth()).toBe(hooks.context);
  });
});
