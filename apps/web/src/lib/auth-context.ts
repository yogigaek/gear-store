import type { DemoLoginInput, LoginInput, User } from '@gear-store/shared';
import { createContext, use } from 'react';

export type Status = 'restoring' | 'signed-in' | 'signed-out';

export interface AuthValue {
  status: Status;
  user: User | null;
  signIn: (input: LoginInput) => Promise<void>;
  signInDemo: (role: DemoLoginInput['role']) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  /** an API call with the access token; a 401 triggers one refresh and one retry */
  authed: <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
