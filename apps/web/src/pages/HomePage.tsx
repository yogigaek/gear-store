import posterTall from '../assets/e1-poster-tall.jpg';
import posterWide from '../assets/e1-poster-wide.jpg';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Inspect, View } from '../three/bike/BikeStage';
import { useCanRender3D, usePrefersReducedMotion } from '../three/useCanRender3D';
import type { ScrollSource } from '../three/bike/BikeStage';
import { Link, useSearchParams } from 'react-router';
import { Configurator } from '../components/build/Configurator';
import { Price } from '../components/ui/Price';
import { useBuildCatalog } from '../lib/queries';
import { E1_COLOURS } from '../three/bike/layout';
import { formatRupiah } from '../lib/format';
import { variantOf } from '../three/parts/variants';
import { labelled, PART_LIST, type ModuleLabels, type PartCallout } from '../three/bike/parts';

const BikeStage = lazy(() => import('../three/bike/BikeStage'));

/** the bike's figures, across the parts the configurator offers */
const SPECS = [
  ['Battery', '625 or 750 Wh'],
  ['Motor', '85 Nm mid-drive'],
  ['Travel', '160–170 / 150 mm'],
  ['Wheels', '29 × 2.4″'],
  ['Drivetrain', '1 × 12, 10–52'],
  ['Brakes', '4-piston discs'],
] as const;

const VIEW_BUTTONS: [View, string][] = [
  ['right', 'Right'],
  ['left', 'Left'],
  ['front', 'Front'],
  ['rear', 'Rear'],
  ['top', 'Top'],
  ['below', 'Below'],
];

const CLOSED: Inspect = { active: false, view: null, apart: false };
const INTRO_SEEN = 'rakit-e1-assembled';

/** the opening assembly plays once a session, from the top of the page, unless motion is reduced */
function shouldAssemble(reducedMotion: boolean) {
  if (reducedMotion || window.scrollY > 0) return false;
  try {
    if (sessionStorage.getItem(INTRO_SEEN)) return false;
    sessionStorage.setItem(INTRO_SEEN, '1');
  } catch {
    // storage blocked: play it, it is short
  }
  return true;
}

/**
 * The home page: the E-1 on a studio stage, ridden forward by the scroll, then taken apart. "360°" hands the
 * bike to the visitor: drag to turn it, pick a side, pull it apart.
 */
export function HomePage() {
  const reducedMotion = usePrefersReducedMotion();
  const can3D = useCanRender3D();
  const story = useRef<HTMLDivElement>(null);
  const scroll = useMemo<ScrollSource>(() => ({ progress: 0 }), []);
  const [tall, setTall] = useState(() => window.innerWidth < 1024);
  const catalog = useBuildCatalog();
  // the finishes the frame is sold in; the launch colours stand in until the catalogue answers
  // the parts picked in the configurator, by slot; a slot not touched yet has the starting part
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const colours = useMemo(() => {
    const frames = catalog.data?.slots.find((s) => s.options.some((o) => o.module === 'FRAME'));
    const slug = frames && (chosen[frames.category] ?? frames.defaultSlug);
    const frame = frames?.options.find((o) => o.slug === slug) ?? frames?.options[0];
    return frame?.colors.length
      ? frame.colors.map((c) => ({ key: c.key, name: c.label, hex: c.hex }))
      : E1_COLOURS.map((c) => ({ ...c }));
  }, [catalog.data, chosen]);
  // a product page's "Build a bike with it" brings its part, and a frame's finish, along in the URL
  const [params] = useSearchParams();
  const [colorKey, setColorKey] = useState<string>(() => params.get('colour') ?? E1_COLOURS[0].key);
  // a finish the catalogue no longer has falls back to its first
  const colour = colours.find((c) => c.key === colorKey) ?? colours[0]!;
  const fromPrice = catalog.data?.fromPrice ?? null;
  // the teardown names each module by the part the starting build uses, at its catalogue price
  const labels = useMemo<ModuleLabels>(() => {
    const out: ModuleLabels = {};
    for (const slot of catalog.data?.slots ?? []) {
      const part = slot.options.find((o) => o.slug === slot.defaultSlug) ?? slot.options[0];
      if (part)
        out[part.module] = {
          name: part.name,
          price: formatRupiah(part.price),
          note: slot.description,
          slug: part.slug,
        };
    }
    return out;
  }, [catalog.data]);
  const modules = useMemo(() => PART_LIST.map((p) => labelled(p, labels)), [labels]);
  // the bike on the stage wears the parts chosen in the configurator, or the starting build's
  const variant = useMemo(
    () =>
      variantOf(
        (catalog.data?.slots ?? []).flatMap((slot) => {
          const slug = chosen[slot.category] ?? slot.defaultSlug;
          const part = slot.options.find((o) => o.slug === slug);
          return part ? [part] : [];
        }),
      ),
    [catalog.data, chosen],
  );
  const configure = useRef<HTMLElement>(null);
  const [configuring, setConfiguring] = useState(false);
  const specs = useRef<HTMLDListElement>(null);
  const [specsLow, setSpecsLow] = useState(false);
  const [inspect, setInspect] = useState<Inspect>(CLOSED);
  const [assemble] = useState(() => shouldAssemble(reducedMotion));
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState<PartCallout | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const enter = useRef<HTMLButtonElement>(null);
  const exit = useRef<HTMLButtonElement>(null);

  // while inspecting, the page holds still and Esc hands the scroll back
  useEffect(() => {
    if (!inspect.active) return;
    const root = document.documentElement;
    root.style.overflow = 'hidden';
    exit.current?.focus();
    // Esc closes an open detail panel first, then leaves inspect mode
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pickedRef.current) setPicked(null);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [inspect.active]);

  function close() {
    setInspect(CLOSED);
    setPicked(null);
    requestAnimationFrame(() => enter.current?.focus());
  }

  // the 360° button steps aside while the configurator is on screen
  useEffect(() => {
    const el = configure.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setConfiguring(entry?.isIntersecting ?? false), {
      threshold: 0.2,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // and while the spec strip passes the bottom of the screen, where it sits
  useEffect(() => {
    const el = specs.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setSpecsLow(entry?.isIntersecting ?? false), {
      rootMargin: '-80% 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const update = () => {
      const el = story.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const run = rect.height - window.innerHeight;
      scroll.progress = run > 0 ? Math.min(1, Math.max(0, -rect.top / run)) : 0;
    };
    const resize = () => {
      setTall(window.innerWidth < 1024);
      update();
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', resize);
    };
  }, [scroll]);

  return (
    <div ref={story} id="e1-story" className="relative h-[600vh] bg-stage text-alu-50">
      <div className="sticky top-16 h-[calc(100dvh-4rem)] overflow-hidden">
        {/* a still of the stage: shown while the 3D loads, and instead of it where WebGL is missing */}
        {/* until the 3D is ready: the empty studio it will appear in. A still of the bike would be framed for
            one screen size and one scroll position, and show two bikes while the 3D fades in over it; it is
            kept for browsers without WebGL. */}
        {can3D ? (
          <div
            aria-hidden="true"
            className={`absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_62%_68%,#3b3a37_0%,#1d1e1f_55%,#0b0d0e_100%)] transition-opacity duration-700 ${ready ? 'opacity-0' : ''}`}
          />
        ) : (
          <picture>
            <source media="(max-width: 1023px)" srcSet={posterTall} />
            <img
              src={posterWide}
              fetchPriority="high"
              alt="The Rakit E-1 electric mountain bike on a dark studio floor"
              className="absolute inset-0 size-full object-cover object-right-bottom"
            />
          </picture>
        )}
        {can3D && (
          <div className={`absolute inset-0 transition-opacity duration-500 ${ready ? '' : 'opacity-0'}`}>
            <Suspense fallback={null}>
              <BikeStage
                scroll={scroll}
                inspect={inspect}
                assemble={assemble}
                onReady={() => setReady(true)}
                onPick={setPicked}
                labels={labels}
                variant={variant}
                frame={colour.hex}
                reducedMotion={reducedMotion}
                tall={tall}
                label="The Rakit E-1 electric mountain bike on a dark studio floor"
              />
            </Suspense>
          </div>
        )}

        {can3D &&
          (inspect.active ? (
            <>
              {picked && (
                <section
                  aria-label={picked.name}
                  className="absolute right-4 top-4 z-20 w-[min(22rem,calc(100%-2rem))] border border-signal bg-ink/95 p-5 sm:right-6 sm:top-6"
                >
                  <p className="font-mono text-xs uppercase tracking-[0.08em] text-signal">
                    Module {picked.n} of {PART_LIST.length}
                  </p>
                  <h2 className="mt-2 font-expanded text-xl font-extrabold uppercase leading-tight">
                    {picked.name}
                  </h2>
                  <p className="mt-2 text-sm text-bench">{picked.note}</p>
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <span className="font-mono text-sm text-alu-50">{picked.price}</span>
                    {picked.slug && (
                      <Link
                        to={`/products/${picked.slug}`}
                        className="ml-auto min-h-11 content-center font-mono text-xs uppercase tracking-[0.08em] text-signal underline underline-offset-4"
                      >
                        View part
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      className="min-h-11 border border-alu-50/60 px-4 font-mono text-xs uppercase tracking-[0.08em] text-alu-50 hover:border-alu-50"
                    >
                      Close
                    </button>
                  </div>
                </section>
              )}
              <div
                role="toolbar"
                aria-label="360° view"
                className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 px-4 pb-5"
              >
                <p className="w-full text-center font-mono text-xs uppercase tracking-[0.08em] text-bench">
                  Drag to turn · pinch or scroll to zoom · tap a number for details
                </p>
                {VIEW_BUTTONS.map(([view, name]) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setInspect((s) => ({ ...s, view: { name: view, at: Date.now() } }))}
                    aria-pressed={inspect.view?.name === view}
                    className="min-h-11 border border-ink-2 bg-ink/80 px-3 font-mono text-xs uppercase tracking-[0.08em] text-alu-50 hover:border-alu-50 aria-pressed:border-signal aria-pressed:text-signal"
                  >
                    {name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setInspect((s) => ({ ...s, apart: !s.apart }))}
                  aria-pressed={inspect.apart}
                  className="min-h-11 border border-signal bg-ink/80 px-3 font-mono text-xs uppercase tracking-[0.08em] text-signal aria-pressed:bg-signal aria-pressed:text-ink"
                >
                  {inspect.apart ? 'Put together' : 'Take apart'}
                </button>
                <button
                  ref={exit}
                  type="button"
                  onClick={close}
                  className="min-h-11 bg-alu-50 px-4 font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink"
                >
                  Done
                </button>
              </div>
            </>
          ) : configuring || specsLow ? null : (
            <button
              ref={enter}
              type="button"
              onClick={() => setInspect({ active: true, view: null, apart: false })}
              className="absolute bottom-5 right-4 z-10 flex min-h-11 items-center gap-2 border border-alu-50/60 bg-ink/70 px-4 font-mono text-xs uppercase tracking-[0.08em] text-alu-50 backdrop-blur-sm hover:border-signal hover:text-signal sm:right-6"
            >
              <span aria-hidden="true" className="text-signal">
                ⟲
              </span>
              360° view
            </button>
          ))}
      </div>

      {/* the story: screens of copy scrolling over the stage, set aside while the bike is being inspected */}
      <div
        className={`pointer-events-none absolute inset-0 flex flex-col transition-opacity duration-300 ${inspect.active ? 'invisible opacity-0' : ''}`}
      >
        <section className="h-[120vh] px-4 sm:px-6">
          {/* centred in the visible screen below the header, not in the taller scroll section */}
          <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-7xl items-start pt-[5vh] lg:items-center lg:pt-0">
            <div className="pointer-events-auto max-w-xl space-y-4 sm:space-y-6">
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-signal">
                Rakit E-1 · Full-suspension e-MTB
              </p>
              <h1 className="font-expanded text-[clamp(2.6rem,min(7vw,10.5vh),6.2rem)] font-extrabold uppercase leading-[0.9]">
                <span className="block">Built</span>
                <span className="block">to be</span>
                <span className="block">taken</span>
                <span className="block">apart.</span>
              </h1>
              <p className="max-w-md text-base text-bench sm:text-lg">
                A 29-inch trail bike with a mid-drive motor, every part of it listed, priced, and serviceable
                with the tools in a home workshop.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#configure"
                  className="inline-flex min-h-12 items-center bg-signal px-6 font-semibold uppercase tracking-[0.06em] text-ink"
                >
                  Configure yours
                </a>
                {fromPrice !== null && (
                  <span className="font-mono text-sm text-alu-50">
                    From <Price amount={fromPrice} className="font-normal" />
                  </span>
                )}
              </div>
              <fieldset className="space-y-2">
                <legend className="font-mono text-xs uppercase tracking-[0.08em] text-bench">
                  Frame · <span className="text-alu-50">{colour.name}</span>
                </legend>
                <div className="flex gap-2">
                  {colours.map((c) => (
                    <label
                      key={c.key}
                      title={c.name}
                      className="grid size-11 cursor-pointer place-items-center border border-transparent has-checked:border-alu-50 has-focus-visible:outline-3 has-focus-visible:outline-signal"
                    >
                      <input
                        type="radio"
                        name="e1-colour"
                        value={c.key}
                        checked={colour.key === c.key}
                        onChange={() => setColorKey(c.key)}
                        className="sr-only"
                        aria-label={c.name}
                      />
                      <span className="size-7 border border-ink-2" style={{ backgroundColor: c.hex }} />
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        </section>

        <section id="e1-specs" className="flex h-[120vh] items-end px-4 pb-[22vh] sm:px-6">
          <div className="mx-auto w-full max-w-7xl">
            <dl
              ref={specs}
              className="pointer-events-auto grid grid-cols-2 gap-px border border-ink-2 bg-ink-2 sm:grid-cols-3 lg:grid-cols-6"
            >
              {SPECS.map(([term, value]) => (
                <div key={term} className="bg-stage/85 px-4 py-4 backdrop-blur-sm">
                  <dt className="font-mono text-xs uppercase tracking-[0.08em] text-bench">{term}</dt>
                  <dd className="mt-1 font-expanded text-base font-bold uppercase text-balance lg:text-[0.95rem] xl:text-base">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="flex h-[120vh] items-start px-4 pt-[18vh] sm:px-6 lg:pt-[24vh]">
          <div className="mx-auto w-full max-w-7xl">
            <div className="pointer-events-auto max-w-md space-y-3">
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-signal">Teardown</p>
              <h2 className="font-expanded text-3xl font-extrabold uppercase leading-none sm:text-4xl">
                Eight modules. Each one sold on its own.
              </h2>
              <p className="text-bench max-sm:hidden">
                Build the E-1 part by part, or replace one when it wears out. Every module has its own price
                and its own stock.
              </p>
              {/* the numbered dots on the bike, spelled out: the only labels on small screens, and the
                  accessible list everywhere */}
              <ol className="grid gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.04em] sm:grid-cols-2 lg:sr-only">
                {modules.map((p) => (
                  <li key={p.n} className="flex gap-2">
                    <span className="text-signal">{p.n}</span>
                    <span className="text-alu-50">{p.name}</span>
                    <span className="ml-auto text-bench">{p.price}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="flex h-[120vh] items-start px-4 pt-[34vh] sm:px-6 lg:items-center lg:pt-0">
          <div className="mx-auto flex w-full max-w-7xl justify-end">
            <div className="pointer-events-auto max-w-sm space-y-3 text-right">
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-signal">Drivetrain</p>
              <h2 className="font-expanded text-4xl font-extrabold uppercase leading-none">
                Twelve gears. One hex key.
              </h2>
              <p className="text-bench">
                Scroll and the chain runs, the cranks turn, the jockey wheels spin: every link is drawn.
              </p>
            </div>
          </div>
        </section>

        {/* the end of the story: the bike stays on the stage, the configurator beside it */}
        <section
          ref={configure}
          id="configure"
          aria-label="Configure your E-1"
          className="h-[120vh] scroll-mt-16 px-4 sm:px-6"
        >
          <div className="sticky top-[calc(25dvh+2rem)] mx-auto flex h-[calc(75dvh-3rem)] w-full max-w-7xl justify-end lg:top-[5.5rem] lg:h-[calc(100dvh-7rem)]">
            <div className="pointer-events-auto flex w-full max-w-md min-h-0">
              {catalog.data ? (
                <Configurator
                  catalog={catalog.data}
                  colorKey={colour.key}
                  onColor={setColorKey}
                  onParts={setChosen}
                  start={params.get('part')}
                />
              ) : (
                <p className="self-start border border-ink-2 bg-stage/90 p-5 font-mono text-sm text-bench">
                  {catalog.isError
                    ? 'The parts list did not load. Reload the page to try again.'
                    : 'Loading parts…'}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
