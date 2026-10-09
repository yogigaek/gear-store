import { useEffect, useState } from 'react';
import { healthResponseSchema, type HealthResponse } from '@gear-store/shared';

type State =
  { kind: 'loading' } | { kind: 'ready'; health: HealthResponse } | { kind: 'error'; message: string };

// Phase 0 placeholder: proves the web app reaches the API and validates the reply with the shared schema.
export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((res) => res.json())
      .then((body: unknown) => {
        const parsed = healthResponseSchema.safeParse(body);
        setState(
          parsed.success
            ? { kind: 'ready', health: parsed.data }
            : { kind: 'error', message: 'Unexpected response' },
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ kind: 'error', message: String(error) });
      });
    return () => controller.abort();
  }, []);

  return (
    <main style={{ padding: '2rem' }}>
      <h1>gear-store</h1>
      <p>
        API: {state.kind === 'loading' && 'checking…'}
        {state.kind === 'ready' && `${state.health.status} (database ${state.health.database})`}
        {state.kind === 'error' && `unreachable: ${state.message}`}
      </p>
    </main>
  );
}
