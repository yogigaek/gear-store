import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useOutlet } from 'react-router';
import poster from '../../assets/auth-poster.jpg';
import { E1_FRAME } from '../../three/bike/layout';
import { useCanRender3D, useCoarsePointer, usePrefersReducedMotion } from '../../three/useCanRender3D';

const AuthScene = lazy(() => import('../../three/bike/AuthScene'));

/**
 * The account pages' shared layout: the E-1 turning on the dark stage, and the panel each page fills. The
 * scene lives here, so moving between sign-in, register and forgot-password keeps it running instead of
 * building a new canvas each time.
 */
export function AuthLayout() {
  // the other account pages are a click away: fetch their code while the visitor reads this one
  useEffect(() => {
    const id = window.setTimeout(() => {
      void import('./SignInPage');
      void import('./RegisterPage');
      void import('./ForgotPasswordPage');
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    // wide screens: a split screen locked to the window. The stage never moves; a form taller than the
    // window scrolls inside its own column, so switching forms can never shift the bike.
    <div className="grid bg-ink text-alu-50 lg:h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:overflow-hidden">
      <Scene />
      <div
        data-auth-panel
        className="surface-dark flex items-start justify-center px-4 pb-12 sm:px-6 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-bench lg:px-10 lg:pt-[4vh] lg:pb-8"
      >
        <div className="relative -mt-6 w-full max-w-md border border-bench bg-alu-50 p-6 sm:-mt-10 sm:p-8 lg:mt-0 lg:px-8 lg:py-7">
          {/* the bench's one accent: a yellow edge along the top of the panel */}
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-signal" />
          <PanelSwap />
        </div>
      </div>
    </div>
  );
}

/** how long the page being left takes to fade out, ms; matches `.animate-panel-out` */
const FADE_OUT = 160;

/**
 * The panel's content changes in two beats: the page being left fades out, then the one arriving fades in,
 * while the panel's height eases from one to the other. One form is on screen at a time, so nobody types
 * into a field that is on its way out.
 */
function PanelSwap() {
  const outlet = useOutlet();
  const { key } = useLocation();
  // the page on screen; it lags the URL by the fade-out, then catches up
  const [shown, setShown] = useState<{ key: string; node: ReactNode }>({ key, node: outlet });
  const leaving = shown.key !== key;
  const [entered, setEntered] = useState<string | null>(null);

  // a timer rather than animationend: a tab in the background pauses animations but still runs timers
  useEffect(() => {
    if (!leaving) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(
      () => {
        // the arriving page's element: kept, so it can stay on screen while it is the one being left
        setShown({ key, node: outlet });
        setEntered(key);
      },
      reduced ? 0 : FADE_OUT,
    );
    return () => window.clearTimeout(id);
  }, [leaving, key, outlet]);

  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  // a new page whose top is scrolled out of sight (on a phone the panel sits below the bike): bring its
  // heading back into view, gently, rather than leaving the visitor in the middle of a different form
  useEffect(() => {
    if (!entered) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    // wide screens: only the form's own column scrolls; it goes back to the new form's heading
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const column = box.current?.closest('[data-auth-panel]');
      if (column && column.scrollTop > 0) column.scrollTo({ top: 0, behavior });
      return;
    }
    const top = box.current?.getBoundingClientRect().top ?? 0;
    if (top < 80) window.scrollTo({ top: window.scrollY + top - 96, behavior });
  }, [entered]);
  // follows the page on screen: each page's content is a new element, keyed by its location
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown.key]);

  return (
    <div
      ref={box}
      className="relative overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
      style={{ height }}
    >
      <div
        ref={inner}
        key={shown.key}
        inert={leaving}
        className={leaving ? 'animate-panel-out' : entered === shown.key ? 'animate-panel-in' : undefined}
      >
        {/* while leaving, the page that was on screen stays as it was (typed text and all) */}
        {leaving ? shown.node : outlet}
      </div>
    </div>
  );
}

function Scene() {
  const reducedMotion = usePrefersReducedMotion();
  // phones keep the scene still: a turntable redraws every frame and costs battery on a form page
  const coarse = useCoarsePointer();
  // three.js loads (and WebGL is probed) only once the scene is on screen
  const scene = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const onDrawn = useCallback(() => setDrawn(true), []);
  useEffect(() => {
    const el = scene.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setSeen(true), {
      rootMargin: '200px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const can3D = useCanRender3D(seen);

  return (
    <section ref={scene} aria-label="Rakit E-1" className="relative h-72 overflow-hidden sm:h-80 lg:h-full">
      {/* a still of the scene is there at once (and stays where WebGL is missing); the live canvas fades in
          over it once its first frame is drawn */}
      <img
        src={poster}
        alt=""
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 size-full object-cover object-bottom"
      />
      <div
        className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${drawn ? 'opacity-100' : 'opacity-0'}`}
      >
        {can3D && (
          <Suspense fallback={null}>
            <AuthScene
              frame={E1_FRAME}
              reducedMotion={reducedMotion || coarse}
              label="The Rakit E-1 electric mountain bike turning on a showroom floor"
              onDrawn={onDrawn}
            />
          </Suspense>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 px-4 pt-6 sm:px-6 lg:px-12 lg:pt-14">
        <p className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-signal">
          Rakit E-1 · your account
        </p>
        <p className="max-w-md font-expanded text-3xl font-extrabold uppercase leading-none max-sm:hidden lg:text-5xl">
          Every part, on record.
        </p>
        <p className="max-w-sm text-sm text-bench max-lg:hidden">
          Orders, saved parts and the bikes you build, in one place.
        </p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-4 pb-14 font-mono text-xs uppercase tracking-[0.08em] text-bench max-lg:hidden sm:px-6 lg:px-12 lg:pb-10">
        <span>8 modules · one hex key</span>
        <span>Demo store · Midtrans sandbox</span>
      </div>
    </section>
  );
}
