import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddressStrength from './AddressStrength';
import ConfirmAddressSheet from './ConfirmAddressSheet';
import { lookupPincode, PincodeNotFound } from './pincodeService';
import {
  FIELD_ORDER,
  assembleLabel,
  buildingRequired,
  sanitize,
  stripPincode,
  toPayload,
  validateAddress,
} from './addressValidation';
import './address.css';

const EMPTY = {
  pincode: '',
  houseNo: '',
  building: '',
  locality: '',
  area: '',
  landmark: '',
  homeType: '',
  ownership: '',
};

const FIELD_LABELS = {
  pincode: 'Pincode',
  area: 'Area / Village',
  houseNo: 'Apartment / House / Floor number',
  building: 'Apartment name',
  locality: 'Locality (street, gali, colony)',
  landmark: 'Landmark',
  homeType: 'Home type',
  ownership: 'Property ownership',
};

/** Text fields that get whitespace + stray-pincode cleanup on blur. */
const TEXT_FIELDS = ['houseNo', 'building', 'locality', 'area', 'landmark'];

function Field({ id, label, required, optional, hint, error, warning, children }) {
  const describedBy = [error && `${id}-err`, warning && `${id}-warn`, hint && `${id}-hint`]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`eq-field ${error ? 'is-error' : ''}`}>
      <label className="eq-label-text" htmlFor={id}>
        {label}
        {required && <span className="eq-req" aria-hidden="true"> *</span>}
        {optional && <span className="eq-optional"> (optional)</span>}
      </label>

      {typeof children === 'function' ? children(describedBy || undefined) : children}

      {error && (
        <p className="eq-msg eq-msg--error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
      {!error && warning && (
        <p className="eq-msg eq-msg--warn" id={`${id}-warn`}>
          {warning}
        </p>
      )}
      {!error && !warning && hint && (
        <p className="eq-msg eq-msg--hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Current / permanent address capture.
 *
 * Structured components replace the two free-text address lines, and the
 * gate is component coverage (see addressValidation.js) rather than a raw
 * character count — short-but-complete rural addresses pass, vague urban
 * ones don't.
 */
export default function AddressForm({
  title = 'Current address',
  backLabel,
  onBack,
  initialValue,
  showSameAsCurrent = false,
  sameAsCurrent = false,
  onSameAsCurrentChange,
  onSubmit,
  onEvent = () => {},
  submitting = false,
}) {
  const [form, setForm] = useState({ ...EMPTY, ...initialValue });
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [pin, setPin] = useState({ status: 'idle', city: '', state: '' });
  const [confirming, setConfirming] = useState(false);

  const refs = useRef({});
  const setRef = (name) => (el) => {
    refs.current[name] = el;
  };

  // Area is free-form: nothing is matched against the pincode master, so there
  // is no "source" to track and no list to fall out of.
  const ctx = useMemo(
    () => ({ city: pin.city, state: pin.state, pinStatus: pin.status }),
    [pin.city, pin.state, pin.status],
  );

  const { errors, warnings, score, ok, firstErrorField } = useMemo(
    () => validateAddress(form, ctx),
    [form, ctx],
  );

  const shown = (name) => (touched[name] || attempted ? errors[name] : undefined);
  const warnFor = (name) =>
    touched[name] || attempted ? warnings.find((w) => w.field === name)?.text : undefined;

  /* ---- pincode → city / state / area list ------------------------------ */
  useEffect(() => {
    const value = form.pincode.trim();
    if (!/^[1-9]\d{5}$/.test(value)) {
      setPin({ status: 'idle', city: '', state: '' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPin((p) => ({ ...p, status: 'loading' }));
      try {
        const res = await lookupPincode(value, { signal: controller.signal });
        setPin({ status: 'done', city: res.city, state: res.state });
        onEvent('address_pincode_resolved', { pincode: value });
      } catch (err) {
        if (controller.signal.aborted) return;
        const notFound = err instanceof PincodeNotFound || err?.code === 'NOT_FOUND';
        setPin({ status: notFound ? 'not_found' : 'error', city: '', state: '' });
        onEvent('address_pincode_failed', { pincode: value, reason: notFound ? 'not_found' : 'error' });
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // onEvent intentionally omitted: callers commonly pass an inline function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pincode]);

  /* ---- field handlers -------------------------------------------------- */
  const setValue = useCallback((name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
  }, []);

  const handlePincode = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    // Area is no longer derived from the pincode, so it survives a pincode
    // correction instead of being wiped.
    setForm((f) => (digits === f.pincode ? f : { ...f, pincode: digits }));
  };

  const handleBlur = (name) => {
    setTouched((t) => ({ ...t, [name]: true }));
    if (TEXT_FIELDS.includes(name)) {
      setForm((f) => {
        const cleaned = name === 'houseNo' ? sanitize(f[name]) : stripPincode(f[name]);
        return cleaned === f[name] ? f : { ...f, [name]: cleaned };
      });
    }
    const err = errors[name];
    if (err) onEvent('address_field_error', { field: name, message: err });
  };

  const handleContinue = () => {
    setAttempted(true);
    if (!ok) {
      onEvent('address_submit_blocked', {
        fields: Object.keys(errors),
        score,
        firstErrorField,
      });
      const target = refs.current[firstErrorField];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.focus?.({ preventScroll: true });
      }
      return;
    }
    onEvent('address_confirm_shown', { score });
    setConfirming(true);
  };

  const handleConfirm = () => {
    const payload = toPayload(form, ctx);
    onEvent('address_submitted', payload.meta);
    setConfirming(false);
    onSubmit?.(payload);
  };

  const labelLines = useMemo(() => assembleLabel(form, ctx), [form, ctx]);
  const needsBuilding = buildingRequired(form);

  // The meter turns red as soon as a blocking error is *visible* to the
  // customer — touched fields, or everything once Continue has been pressed.
  const blocked = FIELD_ORDER.some((f) => shown(f)) || Boolean(attempted && errors._form);

  return (
    <div className="eq-screen">
      <header className="eq-topbar">
        {onBack && (
          <button type="button" className="eq-back" onClick={onBack} aria-label="Go back">
            ←
          </button>
        )}
        <div className="eq-brand">
          <span className="eq-brand__mark">≡QUALL</span>
          <span className="eq-brand__sub">
            A brand of <strong>LTCV Credit</strong>
          </span>
        </div>
      </header>

      <div className="eq-body">
        {backLabel && (
          <button type="button" className="eq-crumb" onClick={onBack}>
            ‹ {backLabel}
          </button>
        )}

        <div className="eq-titlerow">
          <h1 className="eq-title">{title}</h1>
          {showSameAsCurrent && (
            <label className="eq-toggle">
              <span>Same as current</span>
              <input
                type="checkbox"
                checked={sameAsCurrent}
                onChange={(e) => onSameAsCurrentChange?.(e.target.checked)}
              />
              <span className="eq-toggle__track" aria-hidden="true">
                <span className="eq-toggle__knob" />
              </span>
            </label>
          )}
        </div>

        <form
          className="eq-card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleContinue();
          }}
        >
          {/* 1 — pincode drives city, state and the area list */}
          <Field
            id="pincode"
            label={FIELD_LABELS.pincode}
            required
            error={shown('pincode')}
            hint="City and state fill in automatically"
          >
            {(describedBy) => (
              <div className="eq-pinrow">
                <input
                  id="pincode"
                  ref={setRef('pincode')}
                  className={`eq-input eq-input--pin ${shown('pincode') ? 'eq-input--error' : ''}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  placeholder="Enter pincode"
                  value={form.pincode}
                  aria-invalid={shown('pincode') ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => handlePincode(e.target.value)}
                  onBlur={() => handleBlur('pincode')}
                />
                <div className={`eq-pinres eq-pinres--${pin.status}`} aria-live="polite">
                  {pin.status === 'loading' && <span className="eq-skel" />}
                  {pin.status === 'done' && (
                    <span className="eq-pinres__ok">
                      ✓ {pin.city}, {pin.state}
                    </span>
                  )}
                  {pin.status === 'not_found' && <span className="eq-pinres__bad">Pincode not found</span>}
                  {pin.status === 'error' && (
                    <span className="eq-pinres__bad">Couldn’t check right now</span>
                  )}
                </div>
              </div>
            )}
          </Field>

          {/* 2 — home type, decides whether the apartment name is mandatory */}
          <Field id="homeType" label="What kind of home is this?" required error={shown('homeType')}>
            <div
              className="eq-seg"
              role="radiogroup"
              aria-label="Home type"
              ref={setRef('homeType')}
              tabIndex={-1}
            >
              {[
                ['FLAT', 'Flat / Apartment'],
                ['INDEPENDENT', 'Independent house'],
              ].map(([val, text]) => (
                <button
                  type="button"
                  key={val}
                  role="radio"
                  aria-checked={form.homeType === val}
                  className={`eq-seg__btn ${form.homeType === val ? 'is-on' : ''}`}
                  onClick={() => {
                    setValue('homeType', val);
                    setTouched((t) => ({ ...t, homeType: true }));
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </Field>

          {/* 3 — the one field that must contain a digit */}
          <Field
            id="houseNo"
            label={FIELD_LABELS.houseNo}
            required
            error={shown('houseNo')}
            warning={warnFor('houseNo')}
            hint="Include the floor if you have one — e.g. Flat 501, 3rd Floor · 9-208-1 · H.No 830"
          >
            {(describedBy) => (
              <input
                id="houseNo"
                ref={setRef('houseNo')}
                className={`eq-input ${shown('houseNo') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={40}
                autoComplete="address-line1"
                placeholder="House / flat / floor / door number"
                value={form.houseNo}
                aria-invalid={shown('houseNo') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('houseNo', e.target.value)}
                onBlur={() => handleBlur('houseNo')}
              />
            )}
          </Field>

          {/* 4 — apartment name: required for flats, optional otherwise */}
          <Field
            id="building"
            label={FIELD_LABELS.building}
            required={needsBuilding}
            optional={!needsBuilding}
            error={shown('building')}
            warning={warnFor('building')}
            hint={needsBuilding ? 'Society, tower or building name' : 'Add it if your house has a name'}
          >
            {(describedBy) => (
              <input
                id="building"
                ref={setRef('building')}
                className={`eq-input ${shown('building') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={60}
                placeholder="e.g. NVV Golden Classic"
                value={form.building}
                aria-invalid={shown('building') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('building', e.target.value)}
                onBlur={() => handleBlur('building')}
              />
            )}
          </Field>

          {/* 5 — street level detail */}
          <Field
            id="locality"
            label={FIELD_LABELS.locality}
            required={!form.landmark.trim()}
            error={shown('locality')}
            warning={warnFor('locality')}
            hint="e.g. Gali no 5, Mittal Colony · 4th Cross Road"
          >
            {(describedBy) => (
              <input
                id="locality"
                ref={setRef('locality')}
                className={`eq-input ${shown('locality') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={60}
                autoComplete="address-line2"
                placeholder="Street, gali or colony"
                value={form.locality}
                aria-invalid={shown('locality') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('locality', e.target.value)}
                onBlur={() => handleBlur('locality')}
              />
            )}
          </Field>

          {/* 6 — area: free-form text. Nothing is matched against the pincode
              master: village and colony names it does not carry are common, and
              a spelling nag on a correct value is worse than no check. */}
          <Field
            id="area"
            label={FIELD_LABELS.area}
            required
            error={shown('area')}
            warning={warnFor('area')}
            hint="Your area, colony or village name"
          >
            {(describedBy) => (
              <input
                id="area"
                ref={setRef('area')}
                className={`eq-input ${shown('area') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={60}
                autoComplete="address-level3"
                placeholder="e.g. Madhurawada"
                value={form.area}
                aria-invalid={shown('area') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('area', e.target.value)}
                onBlur={() => handleBlur('area')}
              />
            )}
          </Field>

          {/* 7 — landmark: mandatory only when there is no street to name */}
          <Field
            id="landmark"
            label={FIELD_LABELS.landmark}
            required={!form.locality.trim()}
            optional={Boolean(form.locality.trim())}
            error={shown('landmark')}
            warning={warnFor('landmark')}
            hint="e.g. Near Mahathi School · Behind DRM office"
          >
            {(describedBy) => (
              <input
                id="landmark"
                ref={setRef('landmark')}
                className={`eq-input ${shown('landmark') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={50}
                placeholder="Nearby shop, temple, school or office"
                value={form.landmark}
                aria-invalid={shown('landmark') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('landmark', e.target.value)}
                onBlur={() => handleBlur('landmark')}
              />
            )}
          </Field>

          {/* 8 — unchanged from the current screen */}
          <Field id="ownership" label={FIELD_LABELS.ownership} required error={shown('ownership')}>
            <div
              className="eq-seg"
              role="radiogroup"
              aria-label="Property ownership"
              ref={setRef('ownership')}
              tabIndex={-1}
            >
              {[
                ['SELF_OWNED', 'Self-Owned'],
                ['RENTED', 'Rented'],
              ].map(([val, text]) => (
                <button
                  type="button"
                  key={val}
                  role="radio"
                  aria-checked={form.ownership === val}
                  className={`eq-seg__btn ${form.ownership === val ? 'is-on' : ''}`}
                  onClick={() => {
                    setValue('ownership', val);
                    setTouched((t) => ({ ...t, ownership: true }));
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </Field>

          <AddressStrength score={score} blocked={blocked} />
        </form>
      </div>

      {/* Blocking lives on the CTA — no top-of-page summary banner.
          The button stays clickable so tapping it re-scrolls to the offending
          field instead of leaving the customer with a dead control. */}
      <div className="eq-footer">
        {attempted && !ok && (
          <p className="eq-footer__hint" role="alert">
            Complete the fields marked in red to continue
          </p>
        )}
        <button
          type="button"
          className={`eq-btn eq-btn--primary eq-btn--block ${attempted && !ok ? 'eq-btn--blocked' : ''}`}
          aria-disabled={attempted && !ok ? true : undefined}
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>

      {confirming && (
        <ConfirmAddressSheet
          lines={labelLines}
          warnings={warnings.filter((w) => w.field === 'landmark' || w.field === 'area').map((w) => w.text)}
          submitting={submitting}
          onEdit={() => {
            onEvent('address_confirm_edit', {});
            setConfirming(false);
          }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
