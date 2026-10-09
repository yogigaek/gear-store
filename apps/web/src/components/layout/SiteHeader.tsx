import { useRef } from 'react';
import { Link, NavLink } from 'react-router';
import { categories } from '../../data/catalog';

const links = [
  ...categories.map((c) => ({ to: `/c/${c.id}`, label: c.label })),
  { to: '/design', label: 'Design system' },
];

export function SiteHeader() {
  // native <dialog>: focus is trapped, Esc closes it, and the page behind is inert
  const menu = useRef<HTMLDialogElement>(null);
  const close = () => menu.current?.close();

  return (
    <header className="sticky top-0 z-20 border-b border-ink bg-alu">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link to="/" className="font-expanded text-xl font-extrabold uppercase tracking-tight">
          Rakit
        </Link>
        <nav aria-label="Categories" className="hidden gap-6 text-sm md:flex">
          {categories.map((c) => (
            <NavLink
              key={c.id}
              to={`/c/${c.id}`}
              className={({ isActive }) =>
                `py-1 ${isActive ? 'border-b-2 border-ink font-semibold' : 'text-ink-2 hover:text-ink'}`
              }
            >
              {c.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-5 text-sm">
          <Link to="/design" className="hidden text-ink-2 hover:text-ink md:inline">
            Design system
          </Link>
          <button type="button" className="flex min-h-11 items-center gap-2 font-semibold">
            Cart <span className="tabular bg-ink px-1.5 font-mono text-xs text-alu-50">0</span>
          </button>
          <button
            type="button"
            onClick={() => menu.current?.showModal()}
            className="min-h-11 border border-ink px-3 font-mono text-xs uppercase tracking-[0.08em] md:hidden"
            aria-haspopup="dialog"
          >
            Menu
          </button>
        </div>
      </div>

      <dialog
        ref={menu}
        aria-label="Menu"
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-0 ml-auto h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-l border-ink bg-alu p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex h-16 items-center justify-between border-b border-ink px-4">
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">Menu</span>
          <button
            type="button"
            onClick={close}
            className="min-h-11 px-2 font-mono text-xs uppercase tracking-[0.08em]"
          >
            Close
          </button>
        </div>
        <nav aria-label="Main">
          <ul>
            {links.map((l) => (
              <li key={l.to} className="border-b border-bench">
                <NavLink
                  to={l.to}
                  onClick={close}
                  className={({ isActive }) =>
                    `flex min-h-12 items-center px-4 font-semibold ${isActive ? 'bg-alu-50 underline underline-offset-4' : ''}`
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </dialog>
    </header>
  );
}
