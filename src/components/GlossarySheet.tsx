import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Lightbulb, Search, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import {
  GLOSSARY_BY_KEY,
  GLOSSARY_CATEGORIES,
  searchGlossary,
  type GlossaryCategory,
} from '../utils/beginnerTooltips.ts';

type CategoryFilter = GlossaryCategory | 'All';

/** Searchable glossary: full-screen sheet on phones, right-side panel on desktop. */
export const GlossarySheet: React.FC = () => {
  const open = useSimulatorStore((s) => s.glossaryOpen);
  const focusKey = useSimulatorStore((s) => s.glossaryFocus);
  const close = useSimulatorStore((s) => s.closeGlossary);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [highlight, setHighlight] = useState<string | undefined>();
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Reset filters & jump to the focused entry each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const focusEntry = focusKey ? GLOSSARY_BY_KEY[focusKey] : undefined;
    setQuery('');
    setCategory(focusEntry ? focusEntry.category : 'All');
    setHighlight(focusEntry?.key);
    const t = window.setTimeout(() => {
      if (focusEntry) {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-entry="${focusEntry.key}"]`);
        el?.scrollIntoView({ block: 'center' });
        el?.focus({ preventScroll: true });
      } else if (window.innerWidth >= 768) {
        searchRef.current?.focus();
      }
    }, 40);
    return () => window.clearTimeout(t);
  }, [open, focusKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const results = useMemo(() => searchGlossary(query, category), [query, category]);
  const grouped = useMemo(() => {
    const map = new Map<GlossaryCategory, typeof results>();
    for (const e of results) {
      const arr = map.get(e.category) || [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return GLOSSARY_CATEGORIES.filter((c) => map.has(c)).map((c) => ({ category: c, entries: map.get(c)! }));
  }, [results]);

  if (!open) return null;

  const chips: CategoryFilter[] = ['All', ...GLOSSARY_CATEGORIES];

  return (
    <div className="fixed inset-0 z-[110] flex md:justify-end" data-coach-ignore="" role="dialog" aria-modal="true" aria-label="Glossary">
      <div className="hidden md:block absolute inset-0 bg-black/40" onClick={close} />

      <div className="relative flex flex-col w-full h-[100dvh] md:w-[460px] md:h-full bg-white dark:bg-kite-darkSurface md:border-l border-kite-border dark:border-kite-darkBorder shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-kite-border dark:border-kite-darkBorder space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white">
              <BookOpenText className="w-4 h-4 text-kite-orange" />
              Glossary
              <span className="text-[11px] font-normal text-kite-muted">{results.length} terms</span>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close glossary"
              className="w-10 h-10 md:w-8 md:h-8 inline-flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5 md:w-4 md:h-4" />
            </button>
          </div>

          <label className="flex items-center gap-2 px-3 h-10 rounded border border-gray-300 dark:border-kite-darkBorder bg-white dark:bg-[#15181e] focus-within:border-kite-blue">
            <Search className="w-4 h-4 text-kite-muted shrink-0" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(undefined);
                if (e.target.value && category !== 'All') setCategory('All');
              }}
              placeholder="Search terms — e.g. STT, margin, theta, XIRR"
              className="flex-1 min-w-0 bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder:text-kite-muted focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-kite-muted p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </label>

          <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  setHighlight(undefined);
                  listRef.current?.scrollTo({ top: 0 });
                }}
                className={`shrink-0 px-3 h-8 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors ${
                  category === c
                    ? 'bg-kite-blue border-kite-blue text-white'
                    : 'border-gray-200 dark:border-kite-darkBorder text-gray-600 dark:text-gray-300 hover:border-kite-blue'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Entries */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-5">
          {grouped.length === 0 && (
            <div className="py-10 text-center text-xs text-kite-muted">No terms match “{query}”.</div>
          )}
          {grouped.map(({ category: cat, entries }) => (
            <section key={cat}>
              <h3 className="sticky top-0 -mx-4 px-4 py-1 bg-white/95 dark:bg-kite-darkSurface/95 text-[10px] font-semibold uppercase tracking-wider text-kite-muted backdrop-blur-sm">
                {cat}
              </h3>
              <div className="mt-1.5 space-y-2">
                {entries.map((e) => (
                  <article
                    key={e.key}
                    data-entry={e.key}
                    tabIndex={-1}
                    className={`rounded border px-3 py-2.5 outline-none transition-colors ${
                      highlight === e.key
                        ? 'border-amber-500/70 bg-amber-50 dark:bg-amber-500/10'
                        : 'border-gray-100 dark:border-kite-darkBorder'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[13px] font-semibold text-gray-800 dark:text-white">{e.title}</h4>
                      {e.shortcut && (
                        <kbd className="shrink-0 px-1.5 rounded border border-gray-300 dark:border-slate-600 font-mono text-[10px] text-gray-600 dark:text-amber-300">
                          {e.shortcut}
                        </kbd>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{e.body}</p>
                    {e.tip && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                        <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                        {e.tip}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
          <p className="pt-2 pb-4 text-[10px] text-kite-muted leading-relaxed">
            Simplified for learning. Charges and tax rules change — check your broker’s and the Income Tax department’s
            latest notes before real trades.
          </p>
        </div>
      </div>
    </div>
  );
};
