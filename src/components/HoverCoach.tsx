import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpenText, HelpCircle, Lightbulb, MousePointerClick, X } from 'lucide-react';
import { useSimulatorStore } from '../store/useSimulatorStore.ts';
import { resolveHoverTooltip, type TooltipContent } from '../utils/beginnerTooltips.ts';

/**
 * HoverCoach v2 — beginner help cards.
 *
 *  - OFF:     nothing.
 *  - HOVER:   mouse hover (desktop) · long-press (touch) · keyboard focus.
 *  - EXPLAIN: every tap/click on an element with a tip shows the tip instead of
 *             activating it (text inputs still focus; their tip shows on focus).
 *
 * Targets: nearest element with `data-tip` / `data-coach`, or a button / th /
 * label / select / [title] whose text resolves via the glossary. The nearest
 * resolvable element wins, so a container tip never overrides a child's tip.
 * Elements inside `[data-coach-ignore]` are never explained/blocked.
 */

interface ActiveTip {
  content: TooltipContent;
  anchor: HTMLElement;
  sheet: boolean;
  pinned: boolean;
  anchorTop: number;
}

const CARD_WIDTH = 296;
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;
const SCROLL_DISMISS = 30;
const TIP_ID = 'hover-coach-tip';

const INTERACTIVE_SELECTOR =
  'button, [role="button"], [role="tab"], a[href], th, select, label, summary, [title], [data-orig-title]';

const TOGGLE_SELECTOR = '[aria-label="Beginner tips mode"]';

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

function isExempt(el: Element | null): boolean {
  if (!el) return true;
  return !!el.closest(`${TOGGLE_SELECTOR}, [data-coach-ignore]`);
}

interface FoundTarget {
  el: HTMLElement;
  content: TooltipContent;
}

/** Walks up from the event target and returns the nearest element that has a resolvable tip. */
function findTooltipTarget(start: EventTarget | null): FoundTarget | null {
  let node: Element | null = start instanceof Element ? start : null;
  if (!node || isExempt(node)) return null;

  // Form fields: prefer their own tip, then their <label>.
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
    const own = node.hasAttribute('data-tip') || node.hasAttribute('data-coach') ? resolveHoverTooltip(node) : null;
    if (own) return { el: node, content: own };
    const label = node.labels && node.labels[0];
    if (label) {
      const c = resolveHoverTooltip(label);
      if (c) return { el: node, content: c };
    }
  }

  let depth = 0;
  while (node && node !== document.body && depth < 14) {
    if (node instanceof HTMLElement) {
      const explicit = node.hasAttribute('data-tip') || node.hasAttribute('data-coach');
      if (explicit || node.matches(INTERACTIVE_SELECTOR)) {
        const content = resolveHoverTooltip(node);
        if (content) return { el: node, content };
      }
    }
    node = node.parentElement;
    depth++;
  }
  return null;
}

function stashNativeTitles(el: HTMLElement): Array<() => void> {
  const restorers: Array<() => void> = [];
  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && cur !== document.body && depth < 4) {
    const t = cur.getAttribute('title');
    if (t) {
      const node = cur;
      node.setAttribute('data-orig-title', t);
      node.removeAttribute('title');
      restorers.push(() => {
        if (!node.hasAttribute('title') && node.hasAttribute('data-orig-title')) {
          node.setAttribute('title', node.getAttribute('data-orig-title') || t);
        }
        node.removeAttribute('data-orig-title');
      });
    }
    cur = cur.parentElement;
    depth++;
  }
  return restorers;
}

const COACH_CSS = `
@media (pointer: coarse) {
  [data-tip], [data-coach], button, th, label, [role="button"], [role="tab"] {
    -webkit-touch-callout: none;
  }
  [data-tip], [data-coach], button, [role="button"], [role="tab"] {
    -webkit-user-select: none;
    user-select: none;
  }
}
@keyframes coach-sheet-in { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
.coach-sheet-in { animation: coach-sheet-in 140ms ease-out; }
`;

export const HoverCoach: React.FC = () => {
  const tipMode = useSimulatorStore((s) => s.tipMode);
  const setTipMode = useSimulatorStore((s) => s.setTipMode);
  const openGlossary = useSimulatorStore((s) => s.openGlossary);

  const [active, setActive] = useState<ActiveTip | null>(null);
  const activeRef = useRef<ActiveTip | null>(null);
  activeRef.current = active;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const currentElRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastShownAtRef = useRef<number>(0);
  const titleRestorersRef = useRef<Array<() => void>>([]);

  const restoreTitles = useCallback(() => {
    for (const fn of titleRestorersRef.current) fn();
    titleRestorersRef.current = [];
  }, []);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    showTimerRef.current = null;
    hideTimerRef.current = null;
  }, []);

  const hideAll = useCallback(() => {
    clearTimers();
    restoreTitles();
    const prev = activeRef.current;
    if (prev && prev.anchor.getAttribute('aria-describedby') === TIP_ID) prev.anchor.removeAttribute('aria-describedby');
    currentElRef.current = null;
    activeRef.current = null;
    setActive(null);
  }, [clearTimers, restoreTitles]);

  const show = useCallback(
    (found: FoundTarget, opts: { sheet: boolean; pinned: boolean }) => {
      const rect = found.el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const prev = activeRef.current;
      if (prev && prev.anchor !== found.el && prev.anchor.getAttribute('aria-describedby') === TIP_ID) {
        prev.anchor.removeAttribute('aria-describedby');
      }
      if (!found.el.hasAttribute('aria-describedby')) found.el.setAttribute('aria-describedby', TIP_ID);
      lastShownAtRef.current = Date.now();
      const next: ActiveTip = { content: found.content, anchor: found.el, sheet: opts.sheet, pinned: opts.pinned, anchorTop: rect.top };
      activeRef.current = next;
      setActive(next);
    },
    []
  );

  /** Places the desktop card above/below its anchor using the card's measured height. */
  const positionCard = useCallback(() => {
    const a = activeRef.current;
    const card = cardRef.current;
    if (!a || a.sheet || !card) return;
    const rect = a.anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - 20);
    const h = card.offsetHeight;
    const centerX = rect.left + rect.width / 2;
    const left = Math.max(10, Math.min(vw - width - 10, centerX - width / 2));
    const spaceBelow = vh - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const placeAbove = spaceBelow < h + 9 && spaceAbove > spaceBelow;
    let top = placeAbove ? rect.top - 9 - h : rect.bottom + 9;
    top = Math.max(10, Math.min(vh - h - 10, top));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.width = `${width}px`;
    card.style.visibility = 'visible';
    const arrow = arrowRef.current;
    if (arrow) {
      const arrowLeft = Math.max(14, Math.min(width - 14, centerX - left));
      arrow.style.left = `${arrowLeft - 5}px`;
      // Hide arrow if clamping pulled the card over the anchor.
      const overlaps = top < rect.bottom && top + h > rect.top;
      arrow.style.display = overlaps ? 'none' : 'block';
      arrow.dataset.placement = placeAbove ? 'above' : 'below';
    }
  }, []);

  useLayoutEffect(() => {
    positionCard();
  }, [active, positionCard]);

  // ---------------------------------------------------------------------------
  // Global listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (tipMode === 'OFF') {
      hideAll();
      return;
    }
    const explain = tipMode === 'EXPLAIN';
    const inCard = (n: EventTarget | null) => !!(n instanceof Node && cardRef.current && cardRef.current.contains(n));
    const narrow = () => window.innerWidth < 768;

    // ---- Mouse hover --------------------------------------------------------
    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (inCard(e.target)) {
        if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
        return;
      }
      if (activeRef.current?.pinned) return;
      const found = findTooltipTarget(e.target);
      if (!found) {
        if (currentElRef.current) scheduleHide();
        return;
      }
      if (found.el === currentElRef.current) {
        if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
        return;
      }
      clearTimers();
      restoreTitles();
      currentElRef.current = found.el;
      titleRestorersRef.current = stashNativeTitles(found.el);
      const warm = Date.now() - lastShownAtRef.current < 320;
      showTimerRef.current = window.setTimeout(() => {
        if (!found.el.isConnected || currentElRef.current !== found.el) return;
        show(found, { sheet: false, pinned: false });
      }, warm ? 35 : 140);
    };

    const scheduleHide = () => {
      if (activeRef.current?.pinned) return;
      if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        lastShownAtRef.current = Date.now();
        hideAll();
      }, 120);
    };

    const onPointerOut = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const cur = currentElRef.current;
      if (!cur && !activeRef.current) return;
      const related = e.relatedTarget as Node | null;
      if (related && ((cur && cur.contains(related)) || inCard(related))) return;
      if (inCard(e.target) || (cur && cur.contains(e.target as Node))) scheduleHide();
    };

    // ---- Touch long-press (HOVER) + explain blocking (EXPLAIN) --------------
    let press: { x: number; y: number; timer: number; id: number } | null = null;
    let suppressClickUntil = 0;
    let explainDownTarget: Element | null = null;

    const cancelPress = () => {
      if (press) window.clearTimeout(press.timer);
      press = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (inCard(e.target)) return;
      explainDownTarget = null;
      // Any press outside the card dismisses the current tip. On touch, the
      // tap that dismisses a bottom sheet doesn't also activate what it hit.
      const prev = activeRef.current;
      if (prev || currentElRef.current) {
        hideAll();
        if (prev?.sheet && !explain && e.pointerType === 'touch') {
          suppressClickUntil = Date.now() + 700;
          return;
        }
      }

      const target = e.target as Element | null;
      if (isExempt(target)) return;

      if (explain) {
        if (isTextEntry(target)) return; // let focus/typing happen; focusin shows the tip
        const found = findTooltipTarget(target);
        if (!found) return;
        explainDownTarget = found.el;
        e.stopPropagation();
        if (e.pointerType !== 'touch') e.preventDefault();
        return;
      }

      if (e.pointerType === 'touch' && e.isPrimary) {
        const found = findTooltipTarget(target);
        if (!found) return;
        const id = e.pointerId;
        press = {
          x: e.clientX,
          y: e.clientY,
          id,
          timer: window.setTimeout(() => {
            press = null;
            if (!found.el.isConnected) return;
            suppressClickUntil = Date.now() + 900;
            try {
              navigator.vibrate?.(12);
            } catch {
              /* ignore */
            }
            restoreTitles();
            titleRestorersRef.current = stashNativeTitles(found.el);
            currentElRef.current = found.el;
            show(found, { sheet: true, pinned: true });
          }, LONG_PRESS_MS),
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (press && e.pointerId === press.id) cancelPress();
    };

    const onClick = (e: MouseEvent) => {
      if (inCard(e.target)) return;
      if (Date.now() < suppressClickUntil) {
        suppressClickUntil = 0;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!explain) return;
      const target = e.target as Element | null;
      if (isExempt(target) || isTextEntry(target)) return;
      // Keyboard activation (detail 0 and no preceding pointerdown) still acts normally.
      if (e.detail === 0 && !explainDownTarget) return;
      const found = findTooltipTarget(target);
      explainDownTarget = null;
      if (!found) return;
      e.preventDefault();
      e.stopPropagation();
      const pointerIsTouch = (e as PointerEvent).pointerType === 'touch' || window.matchMedia?.('(pointer: coarse)').matches;
      restoreTitles();
      titleRestorersRef.current = stashNativeTitles(found.el);
      currentElRef.current = found.el;
      show(found, { sheet: pointerIsTouch || narrow(), pinned: true });
    };

    const onContextMenu = (e: MouseEvent) => {
      if (press || Date.now() < suppressClickUntil || (activeRef.current?.sheet && !inCard(e.target))) {
        e.preventDefault();
      }
    };

    // ---- Keyboard focus -----------------------------------------------------
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!target || inCard(target) || isExempt(target)) return;
      let focusVisible = false;
      try {
        focusVisible = target.matches(':focus-visible');
      } catch {
        focusVisible = false;
      }
      const entry = isTextEntry(target);
      if (!focusVisible && !(explain && entry)) return;
      const found = findTooltipTarget(target);
      if (!found) return;
      clearTimers();
      restoreTitles();
      titleRestorersRef.current = stashNativeTitles(found.el);
      currentElRef.current = found.el;
      showTimerRef.current = window.setTimeout(() => {
        if (!found.el.isConnected || currentElRef.current !== found.el) return;
        show(found, { sheet: narrow(), pinned: false });
      }, 180);
    };

    const onFocusOut = (e: FocusEvent) => {
      if (inCard(e.relatedTarget as Node | null)) return;
      const cur = currentElRef.current;
      if (cur && (cur === e.target || cur.contains(e.target as Node)) && !activeRef.current?.pinned) hideAll();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (activeRef.current || currentElRef.current)) hideAll();
    };

    // ---- Scroll / resize ----------------------------------------------------
    const onScroll = (e: Event) => {
      const a = activeRef.current;
      if (!a) {
        if (currentElRef.current) clearTimers();
        return;
      }
      if (inCard(e.target)) return;
      if (!a.anchor.isConnected) {
        hideAll();
        return;
      }
      const top = a.anchor.getBoundingClientRect().top;
      if (Math.abs(top - a.anchorTop) > SCROLL_DISMISS) hideAll();
      else positionCard();
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    let lastWidth = window.innerWidth;
    const onResize = () => {
      // Ignore height-only changes (e.g. the on-screen keyboard opening).
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        hideAll();
      } else positionCard();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelPress();
      hideAll();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [tipMode, hideAll, clearTimers, restoreTitles, show, positionCard]);

  if (tipMode === 'OFF') return null;

  const content = active?.content;

  const cardBody = content && (
    <>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-start gap-1.5 font-semibold text-white text-xs min-w-0">
          <HelpCircle className="w-3.5 h-3.5 text-kite-orange shrink-0 mt-px" />
          <span className="break-words">{content.title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {content.shortcut && (
            <kbd className="px-1.5 py-px rounded bg-slate-800 border border-slate-600 font-mono text-[10px] text-amber-300">
              {content.shortcut}
            </kbd>
          )}
          {(active?.sheet || active?.pinned) && (
            <button
              type="button"
              onClick={hideAll}
              aria-label="Close tip"
              className="-mr-1 -mt-0.5 w-8 h-8 md:w-6 md:h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700/60"
            >
              <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </button>
          )}
        </div>
      </div>

      {content.body && <p className={`text-slate-300 leading-snug ${active?.sheet ? 'text-[12.5px]' : 'text-[11px]'}`}>{content.body}</p>}

      {content.tip && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-700/80 flex items-start gap-1.5 text-[10.5px] text-amber-300/95">
          <Lightbulb className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" />
          <span>{content.tip}</span>
        </div>
      )}

      {(content.glossaryKey || content.shortcut) && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-700/60 flex items-center justify-between gap-2 text-[10.5px]">
          {content.shortcut ? (
            <span className="text-slate-400">
              Shortcut: <span className="font-mono text-amber-300">{content.shortcut}</span>
            </span>
          ) : (
            <span />
          )}
          {content.glossaryKey && (
            <button
              type="button"
              onClick={() => {
                const key = content.glossaryKey;
                hideAll();
                openGlossary(key);
              }}
              className={`inline-flex items-center gap-1 font-semibold text-amber-400 hover:text-amber-300 ${active?.sheet ? 'min-h-[36px] px-1' : ''}`}
            >
              <BookOpenText className="w-3 h-3" />
              Learn more →
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <style>{COACH_CSS}</style>

      {tipMode === 'EXPLAIN' && !active && (
        <button
          type="button"
          data-coach-ignore=""
          onClick={() => setTipMode('HOVER')}
          className="fixed z-[118] left-1/2 -translate-x-1/2 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-4 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-full bg-kite-blue text-white text-[11px] font-semibold shadow-lg border border-white/20"
          aria-label="Exit explain mode"
        >
          <MousePointerClick className="w-3.5 h-3.5" />
          Explain mode — tap ? to exit
        </button>
      )}

      <div aria-live="polite" className="sr-only">
        {content ? `${content.title}. ${content.body}` : ''}
      </div>

      {active && content && active.sheet && (
        <div
          ref={cardRef}
          data-coach-ignore=""
          id={TIP_ID}
          role="tooltip"
          className="coach-sheet-in fixed z-[120] left-2 right-2 mx-auto max-w-md bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-[calc(16px+env(safe-area-inset-bottom))] rounded-lg bg-[#1b1f27] text-gray-100 border border-slate-700 shadow-2xl px-3.5 py-3 text-[11px] leading-relaxed max-h-[60dvh] overflow-y-auto"
        >
          {cardBody}
        </div>
      )}

      {active && content && !active.sheet && (
        <div
          ref={cardRef}
          data-coach-ignore=""
          id={TIP_ID}
          role="tooltip"
          style={{ left: 0, top: 0, width: CARD_WIDTH, visibility: 'hidden' }}
          className="fixed z-[120] select-none"
        >
          <div
            ref={arrowRef}
            className="absolute w-2.5 h-2.5 rotate-45 bg-[#1b1f27] border-slate-700 data-[placement=below]:-top-[5px] data-[placement=below]:border-l data-[placement=below]:border-t data-[placement=above]:-bottom-[5px] data-[placement=above]:border-r data-[placement=above]:border-b"
          />
          <div className="rounded-md bg-[#1b1f27] text-gray-100 border border-slate-700 shadow-2xl px-3 py-2.5 text-[11px] leading-relaxed">
            {cardBody}
          </div>
        </div>
      )}
    </>
  );
};
