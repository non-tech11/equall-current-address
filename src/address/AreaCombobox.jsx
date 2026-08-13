import { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Area / village picker driven by the pincode master.
 *
 * Picking from the list is the single biggest quality lever: it guarantees
 * canonical spelling and kills "line 2 = Delhi" style junk. Free text stays
 * allowed (villages missing from the master) but is tagged MANUAL, so the
 * master's gaps become a report instead of bad data.
 */
export default function AreaCombobox({
  id,
  value,
  options = [],
  loading = false,
  disabled = false,
  invalid = false,
  describedBy,
  onChange,
  onBlur,
  inputRef,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = String(value || '').trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    const starts = options.filter((o) => o.toLowerCase().startsWith(q));
    const has = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
    return [...starts, ...has].slice(0, 50);
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const pick = (name) => {
    onChange(name, 'MASTER');
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && active >= 0 && filtered[active]) {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const typed = String(value || '').trim();

  return (
    <div className="eq-combo" ref={wrapRef}>
      <input
        id={id}
        ref={inputRef}
        className={`eq-input ${invalid ? 'eq-input--error' : ''}`}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="address-level3"
        placeholder={loading ? 'Loading areas…' : 'Start typing your area or village'}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value, 'MANUAL');
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      <span className="eq-combo__caret" aria-hidden="true" />

      {open && (
        <ul className="eq-combo__list" id={listId} role="listbox">
          {filtered.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === active}
              className={`eq-combo__opt ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(name)}
            >
              {name}
            </li>
          ))}

          {typed.length >= 3 && !options.some((o) => o.toLowerCase() === typed.toLowerCase()) && (
            <li
              role="option"
              aria-selected={false}
              className="eq-combo__opt eq-combo__opt--manual"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(typed, 'MANUAL');
                setOpen(false);
              }}
            >
              Use “{typed}” — not in the list
            </li>
          )}

          {filtered.length === 0 && typed.length < 3 && (
            <li className="eq-combo__empty">
              {loading ? 'Loading areas…' : 'Enter a pincode first'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
