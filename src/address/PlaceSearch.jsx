import { useEffect, useRef, useState } from 'react';
import { newSessionToken, resolve, suggest, toComponents } from './placesService';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" strokeLinecap="round" />
  </svg>
);

/**
 * "Search your society, street or area" — a combobox over Google Places.
 *
 * On pick it hands `onSelect({ components, place })` the mapped form keys plus
 * the raw place facts (id, coordinates) for the payload. If the key is missing
 * or Google is unreachable it says so once and the manual fields carry on.
 */
export default function PlaceSearch({ apiKey, onSelect, onEvent = () => {} }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState(apiKey ? 'idle' : 'unavailable');
  const [picked, setPicked] = useState('');

  // One session token spans keystrokes → pick, so Google bills it as a session.
  const token = useRef(null);
  const skipNext = useRef(false);

  useEffect(() => {
    if (!apiKey) return undefined;
    if (skipNext.current) {
      skipNext.current = false;
      return undefined;
    }
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setItems([]);
      setOpen(false);
      return undefined;
    }

    let stale = false;
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        token.current ??= await newSessionToken(apiKey);
        const next = await suggest(apiKey, q, token.current);
        if (stale) return;
        setItems(next);
        setActive(-1);
        setOpen(true);
        setStatus('idle');
      } catch (err) {
        if (stale) return;
        console.warn('[places]', err);
        setItems([]);
        setOpen(false);
        setStatus('unavailable');
        onEvent('address_places_failed', { reason: err.message });
      }
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // onEvent intentionally omitted: callers commonly pass an inline function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, apiKey]);

  const choose = async (item) => {
    setOpen(false);
    setStatus('loading');
    try {
      const place = await resolve(item);
      token.current = null; // fetchFields closed the session
      const components = toComponents(place);
      skipNext.current = true;
      setQuery(`${item.main}${item.secondary ? `, ${item.secondary}` : ''}`);
      setPicked(place.formattedAddress || '');
      setStatus('idle');
      onEvent('address_place_selected', { filled: Object.keys(components) });
      onSelect({
        components,
        place: {
          placeId: place.id,
          formattedAddress: place.formattedAddress || '',
          lat: place.location?.lat() ?? null,
          lng: place.location?.lng() ?? null,
        },
      });
    } catch (err) {
      console.warn('[places]', err);
      setStatus('unavailable');
      onEvent('address_places_failed', { reason: err.message });
    }
  };

  const onKeyDown = (e) => {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (status === 'unavailable' && !query) {
    return (
      <p className="eq-psearch__off">Address search is unavailable — fill in the fields below.</p>
    );
  }

  return (
    <div className="eq-psearch">
      <label className="eq-label-text" htmlFor="placeSearch">
        Search your address
      </label>
      <div className="eq-psearch__box">
        <span className="eq-psearch__icon">
          <SearchIcon />
        </span>
        <input
          id="placeSearch"
          className="eq-input eq-psearch__input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="placeSearch-list"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `placeSearch-opt-${active}` : undefined}
          autoComplete="off"
          placeholder="Society, street or area name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked('');
          }}
          onKeyDown={onKeyDown}
          onFocus={() => items.length && setOpen(true)}
          // delay so a tap on an option lands before the list closes
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {status === 'loading' && <span className="eq-psearch__spin" aria-hidden="true" />}
      </div>

      {open && (
        <ul className="eq-psearch__list" id="placeSearch-list" role="listbox">
          {items.length === 0 && <li className="eq-psearch__empty">No matches — fill in below</li>}
          {items.map((item, i) => (
            <li
              key={item.id}
              id={`placeSearch-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`eq-psearch__opt ${i === active ? 'is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
            >
              <span className="eq-psearch__main">{item.main}</span>
              {item.secondary && <span className="eq-psearch__sec">{item.secondary}</span>}
            </li>
          ))}
          <li className="eq-psearch__attr" aria-hidden="true">
            powered by Google
          </li>
        </ul>
      )}

      <p className="eq-msg eq-msg--hint" aria-live="polite">
        {picked
          ? 'We filled what we could — add your flat / house no. and check the rest'
          : status === 'unavailable'
            ? 'Search is unavailable right now — fill in the fields below'
            : 'Or fill in the fields below'}
      </p>
    </div>
  );
}
