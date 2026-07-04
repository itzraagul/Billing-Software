import { useState, useRef } from 'react';
import { MedicineType } from '../types';

/* ============================================================
   NumInput — smart numeric input.
   - Never emits NaN.
   - Typing a digit always REPLACES a leading zero instead of
     appending after it (e.g. "0" + "5" => "5", not "05").
   - Clamps to [min, max] only on blur, so typing isn't fought
     mid-edit.
   ============================================================ */
export function NumInput({ value, onChange, min = 0, max, className = '', allowDecimal = false }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; className?: string; allowDecimal?: boolean;
}) {
  const [buffer, setBuffer] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setBuffer(String(value));
  }

  const sanitize = (raw: string) => {
    let cleaned = allowDecimal ? raw.replace(/[^0-9.]/g, '') : raw.replace(/[^0-9]/g, '');
    if (!allowDecimal && cleaned.length > 1) cleaned = cleaned.replace(/^0+/, '') || '0';
    if (allowDecimal) {
      const parts = cleaned.split('.');
      if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
      if (parts[0].length > 1) parts[0] = parts[0].replace(/^0+/, '') || '0';
    }
    return cleaned;
  };

  const commit = (raw: string) => {
    let n = parseFloat(raw);
    if (isNaN(n)) n = min;
    if (max !== undefined) n = Math.min(max, n);
    n = Math.max(min, n);
    setBuffer(String(n));
    setLastValue(n);
    onChange(n);
  };

  return (
    <input
      type="text" inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={buffer}
      onFocus={e => e.target.select()}
      onChange={e => setBuffer(sanitize(e.target.value))}
      onBlur={e => commit(e.target.value)}
      className={className}
    />
  );
}

/* ============================================================
   DosageInput — 4-slot Morning/Afternoon/Evening/Night dosage
   editor. Same robust text-buffer behavior as NumInput so a
   typed digit always overwrites the leading zero, and all 4
   boxes (including Night) sit on an identical baseline.
   Tablets/Drug/Non-Consumable/Ointment cap at 9 per slot;
   Syrup caps at 99 (ml).
   ============================================================ */
export function DosageInput({ value, onChange, type }: { value: string; onChange: (v: string) => void; type: MedicineType }) {
  const isSyrup = type === 'Syrup';
  const max = isSyrup ? 99 : 9;
  // Syrup: allow decimals (e.g. 2.5ml), tablets: integers only
  const parts = value ? value.split('-').map(p => parseFloat(p) || 0) : [0, 0, 0, 0];
  while (parts.length < 4) parts.push(0);

  const [buffers, setBuffers] = useState<string[]>(parts.map(p => String(p)));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  const valueKey = value;
  const [lastValueKey, setLastValueKey] = useState(valueKey);
  if (valueKey !== lastValueKey) {
    setLastValueKey(valueKey);
    setBuffers(parts.map(p => String(p)));
  }

  const commit = (idx: number, raw: string) => {
    let n = parseFloat(raw);
    if (isNaN(n)) n = 0;
    n = Math.min(max, Math.max(0, n));
    // Round to 1 decimal for syrup
    if (isSyrup) n = Math.round(n * 10) / 10;
    const next = [...parts];
    next[idx] = n;
    const nextBuffers = [...buffers];
    nextBuffers[idx] = String(n);
    setBuffers(nextBuffers);
    onChange(next.join('-'));
  };

  const sanitize = (raw: string) => {
    if (isSyrup) {
      // Allow digits and one decimal point
      let cleaned = raw.replace(/[^0-9.]/g, '');
      const dotIdx = cleaned.indexOf('.');
      if (dotIdx !== -1) {
        cleaned = cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, '');
        // Max 1 decimal digit
        if (cleaned.split('.')[1]?.length > 1) cleaned = cleaned.slice(0, dotIdx + 2);
      }
      return cleaned;
    }
    let cleaned = raw.replace(/[^0-9]/g, '');
    if (cleaned.length > 1) cleaned = cleaned.replace(/^0+/, '') || '0';
    return cleaned;
  };

  const labels = ['Morning', 'Afternoon', 'Evening', 'Night'];
  // Syrup inputs are wider to accommodate decimals like "12.5"
  const boxW = isSyrup ? 'w-16' : 'w-12';

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center">
            <input
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode={isSyrup ? 'decimal' : 'numeric'}
              value={buffers[i] ?? '0'}
              onFocus={e => { e.target.select(); }}
              onChange={e => {
                const raw = sanitize(e.target.value);
                const nextBuffers = [...buffers];
                nextBuffers[i] = raw;
                setBuffers(nextBuffers);
                // Auto-advance only for non-syrup (single digit max)
                if (!isSyrup && raw.length >= 1 && i < 3) {
                  commit(i, raw);
                  requestAnimationFrame(() => inputRefs.current[i + 1]?.focus());
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Backspace' && (buffers[i] === '' || buffers[i] === '0') && i > 0) {
                  e.preventDefault();
                  requestAnimationFrame(() => inputRefs.current[i - 1]?.focus());
                }
                // Tab / Enter on syrup field: commit and advance
                if (isSyrup && (e.key === 'Tab' || e.key === 'Enter') && i < 3) {
                  e.preventDefault();
                  commit(i, buffers[i]);
                  requestAnimationFrame(() => inputRefs.current[i + 1]?.focus());
                }
              }}
              onBlur={e => commit(i, e.target.value)}
              className={`${boxW} h-9 px-1 border border-gray-200 dark:border-gray-600 rounded text-center text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-emerald-500 leading-none`}
            />
            {i < 3 && <span className="text-gray-400 text-xs mx-0.5 w-2 text-center">-</span>}
          </div>
        ))}
        {isSyrup && <span className="text-xs text-blue-500 ml-1">ml</span>}
      </div>
      <div className="flex items-center gap-1">
        {labels.map((l, i) => (
          <div key={i} className={`${boxW} flex justify-center`}>
            <span className="text-[9px] text-gray-400 leading-none">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   NumTextInput — same leading-zero-replace behavior as NumInput,
   but for forms that keep the field as a plain string in state
   (e.g. age fields bound to `useState<string>`). No min/max
   clamping is applied since these are typically simple text-like
   numeric fields validated on submit.
   ============================================================ */
export function NumTextInput({ value, onChange, className = '', placeholder, required, allowDecimal = false }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string; required?: boolean; allowDecimal?: boolean;
}) {
  const sanitize = (raw: string) => {
    if (!allowDecimal) {
      let cleaned = raw.replace(/[^0-9]/g, '');
      if (cleaned.length > 1) cleaned = cleaned.replace(/^0+/, '') || '0';
      return cleaned;
    }
    // Decimal-aware sanitize: digits + at most one dot, leading zero replaced
    // unless followed by a dot (so "0.5" stays valid while typing).
    let cleaned = raw.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
    const [intPart, decPart] = cleaned.split('.');
    let cleanInt = intPart;
    if (cleanInt.length > 1) cleanInt = cleanInt.replace(/^0+/, '') || '0';
    return decPart !== undefined ? `${cleanInt}.${decPart}` : cleanInt;
  };
  return (
    <input
      type="text" inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={value}
      onFocus={e => e.target.select()}
      onChange={e => onChange(sanitize(e.target.value))}
      className={className}
      placeholder={placeholder}
      required={required}
    />
  );
}

/* ---------- Dosage helpers ---------- */
export function parseDosage(s: string): number[] {
  return s.split('-').map(p => parseFloat(p) || 0);
}
export function formatDosageParts(parts: number[], isSyrup: boolean): string {
  return parts.map(p => isSyrup ? `${p}ml` : String(p)).join('-');
}
export function dosageDisplay(dosage: string, type: MedicineType): string {
  if (!dosage) return '';
  const parts = parseDosage(dosage);
  const isSyrup = type === 'Syrup';
  return formatDosageParts(parts, isSyrup);
}
export function dosageSum(dosage: string): number {
  return dosage.split('-').reduce((s, p) => s + (parseFloat(p) || 0), 0);
}
