import React, { useEffect, useRef, useState } from 'react';

type NativeProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'>;

export interface NumberInputProps extends NativeProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Whole numbers only (quantities, lots, minutes). */
  integer?: boolean;
  /** Value used when the field is left empty (defaults to `min`, else 0). */
  emptyValue?: number;
  /** Show an empty box instead of 0 when the value is 0. */
  blankZero?: boolean;
}

function parse(text: string, integer: boolean): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return integer ? Math.trunc(n) : n;
}

const show = (v: number, blankZero: boolean) => (blankZero && v === 0 ? '' : Number.isFinite(v) ? String(v) : '');

/**
 * Number field that lets you type freely (clear it, type "1" then "5", type "12.") and only
 * applies min/max limits when you leave the field — so backspace never "sticks" at 1.
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  integer = false,
  emptyValue,
  blankZero = false,
  onBlur,
  onFocus,
  onKeyDown,
  ...rest
}) => {
  const [draft, setDraft] = useState(() => show(value, blankZero));
  const focused = useRef(false);

  // Follow outside changes (25% / Max chips, side switch…) unless they match what is being typed.
  useEffect(() => {
    if (!focused.current) {
      setDraft(show(value, blankZero));
      return;
    }
    const typed = parse(draft, integer);
    if (typed === null ? value !== (emptyValue ?? min ?? 0) : typed !== value) setDraft(show(value, blankZero));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  };

  const commit = () => {
    const typed = parse(draft, integer);
    const final = clamp(typed === null ? (emptyValue ?? min ?? 0) : typed);
    if (final !== value) onChange(final);
    setDraft(show(final, blankZero));
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={rest.inputMode ?? (integer ? 'numeric' : 'decimal')}
      autoComplete="off"
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        onFocus?.(e);
      }}
      onChange={(e) => {
        const text = e.target.value;
        const pattern = integer ? /^-?\d*$/ : /^-?\d*\.?\d*$/;
        if (!pattern.test(text.replace(/,/g, ''))) return;
        setDraft(text);
        const n = parse(text, integer);
        // Live-update while typing, but never force a minimum mid-edit.
        if (n !== null && (max === undefined || n <= max)) onChange(n);
      }}
      onBlur={(e) => {
        focused.current = false;
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = Number(rest.step) || 1;
          const base = parse(draft, integer) ?? value ?? 0;
          const next = clamp(base + (e.key === 'ArrowUp' ? step : -step));
          onChange(next);
          setDraft(show(next, blankZero));
        }
        onKeyDown?.(e);
      }}
    />
  );
};
