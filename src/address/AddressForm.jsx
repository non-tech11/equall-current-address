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

/** Text fields that get whitespace + stray-pincode cleanup on blur. */
const TEXT_FIELDS = ['houseNo', 'building', 'locality', 'area', 'landmark'];

/**
 * Labels and placeholders track the selected home type: a flat dweller reads
 * "Flat / Unit no.", an independent house owner reads "House / Plot no." The
 * underlying fields — and every validation rule on them — are identical.
 */
const COPY = {
  FLAT: {
    houseNo: { label: 'Flat / Unit no + Floor Number', placeholder: 'B-1204, 12th floor', hint: '' },
    building: { label: 'Apartment / Society name', placeholder: 'e.g. Prestige Shantiniketan' },
  },
  DEFAULT: {
    houseNo: { label: 'House / Plot no.', placeholder: '475', hint: 'Add floor if any' },
    building: { label: 'Building / house name', placeholder: 'e.g. Sai Nilaya' },
  },
};

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" strokeLinejoin="round" />
    <path d="M9.5 21v-6h5v6" strokeLinejoin="round" />
  </svg>
);

const FlatIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" strokeLinecap="round" />
  </svg>
);

function Field({ id, label, required, optional, hint, error, warning, children }) {
  const describedBy = [error && `${id}-err`, warning && `${id}-warn`, hint && `${id}-hint`]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`eq-field ${error ? 'is-error' : ''}`}>
      {label && (
        <label className="eq-label-text" htmlFor={id}>
          {label}
          {required && <span className="eq-req" aria-hidden="true"> *</span>}
          {optional && (
            <span className="eq-optional" aria-hidden="true">
              Optional
            </span>
          )}
        </label>
      )}

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

/** Two-button choice row — home type and ownership share the same control. */
function Choice({ name, ariaLabel, options, value, onPick, innerRef }) {
  return (
    <div className="eq-choice" role="radiogroup" aria-label={ariaLabel} ref={innerRef} tabIndex={-1}>
      {options.map(({ val, text, icon: Icon }) => (
        <button
          type="button"
          key={val}
          role="radio"
          aria-checked={value === val}
          className={`eq-choice__btn ${value === val ? 'is-on' : ''}`}
          onClick={() => onPick(name, val)}
        >
          {Icon && <Icon />}
          <span>{text}</span>
        </button>
      ))}
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
  subtitle = 'A precise address of where you currently RESIDE helps us verify your application',
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

  /* ---- pincode → city / state ------------------------------------------ */
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

  const pick = useCallback((name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setTouched((t) => ({ ...t, [name]: true }));
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
        // sanitize() also normalises smart quotes and dashes to ASCII, so a
        // mobile keyboard's ’ or – never reads as an invalid character.
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
  const copy = form.homeType === 'FLAT' ? COPY.FLAT : COPY.DEFAULT;

  // The meter turns red as soon as a blocking error is *visible* to the
  // customer — touched fields, or everything once Continue has been pressed.
  const fieldErrorsVisible = FIELD_ORDER.some((f) => shown(f));
  const formErrorVisible = Boolean(attempted && errors._form);
  const blocked = fieldErrorsVisible || formErrorVisible;

  // The coverage gate can fail while every individual field is valid (score 2
  // from short-but-legal values). Then there is nothing red to point at, so the
  // CTA carries the form-level reason instead — otherwise it blocks with no
  // stated cause. The meter keeps its own shorter label so the same sentence
  // never prints twice.
  const blockedReason = fieldErrorsVisible
    ? 'Complete the fields marked in red to continue'
    : errors._form;
  const meterBlockedText = fieldErrorsVisible
    ? 'Incomplete — complete the fields marked in red'
    : undefined;

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

        {subtitle && (
          <p className="eq-subtitle">
            {/* an all-caps word in the subtitle is the emphasis: it carries
                why the extra fields are worth filling in */}
            {subtitle.split(/([A-Z]{3,})/).map((part, i) =>
              /^[A-Z]{3,}$/.test(part) ? <strong key={i}>{part}</strong> : part,
            )}
          </p>
        )}

        <form
          className="eq-card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleContinue();
          }}
        >
          {/* 1 — home type sits first: it renames the number fields below and
              decides whether the apartment name is mandatory */}
          <Field id="homeType" label="" error={shown('homeType')}>
            <Choice
              name="homeType"
              ariaLabel="Home type"
              innerRef={setRef('homeType')}
              value={form.homeType}
              onPick={pick}
              options={[
                { val: 'INDEPENDENT', text: 'Independent house', icon: HomeIcon },
                { val: 'FLAT', text: 'Apartment / flat', icon: FlatIcon },
              ]}
            />
          </Field>

          {/* 2 — narrowest first: unit number, then the building it sits in.
              A courier reads these two together, so they share a row. */}
          <div className="eq-row eq-row--2">
            <Field
              id="houseNo"
              label={copy.houseNo.label}
              required
              error={shown('houseNo')}
              warning={warnFor('houseNo')}
              hint={copy.houseNo.hint}
            >
              {(describedBy) => (
                <input
                  id="houseNo"
                  ref={setRef('houseNo')}
                  className={`eq-input ${shown('houseNo') ? 'eq-input--error' : ''}`}
                  type="text"
                  maxLength={40}
                  autoComplete="address-line1"
                  placeholder={copy.houseNo.placeholder}
                  value={form.houseNo}
                  aria-invalid={shown('houseNo') ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => setValue('houseNo', e.target.value)}
                  onBlur={() => handleBlur('houseNo')}
                />
              )}
            </Field>

            {/* required for flats, optional otherwise */}
            <Field
              id="building"
              label={copy.building.label}
              required={needsBuilding}
              optional={!needsBuilding}
              error={shown('building')}
              warning={warnFor('building')}
            >
              {(describedBy) => (
                <input
                  id="building"
                  ref={setRef('building')}
                  className={`eq-input ${shown('building') ? 'eq-input--error' : ''}`}
                  type="text"
                  maxLength={60}
                  placeholder={copy.building.placeholder}
                  value={form.building}
                  aria-invalid={shown('building') ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => setValue('building', e.target.value)}
                  onBlur={() => handleBlur('building')}
                />
              )}
            </Field>
          </div>

          {/* 3 — street level, one step wider than the building */}
          <Field
            id="locality"
            label="Street / Road / Gali"
            optional
            error={shown('locality')}
            warning={warnFor('locality')}
          >
            {(describedBy) => (
              <input
                id="locality"
                ref={setRef('locality')}
                className={`eq-input ${shown('locality') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={60}
                autoComplete="address-line2"
                placeholder="16th Main Road"
                value={form.locality}
                aria-invalid={shown('locality') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('locality', e.target.value)}
                onBlur={() => handleBlur('locality')}
              />
            )}
          </Field>

          {/* 4 — area: free-form text. Nothing is matched against the pincode
              master: village and colony names it does not carry are common, and
              a spelling nag on a correct value is worse than no check. */}
          <Field
            id="area"
            label="Area / Village / Locality / Sector"
            required
            error={shown('area')}
            warning={warnFor('area')}
          >
            {(describedBy) => (
              <input
                id="area"
                ref={setRef('area')}
                className={`eq-input ${shown('area') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={60}
                autoComplete="address-level3"
                placeholder="e.g. HAL 2nd Stage, Sector 45"
                value={form.area}
                aria-invalid={shown('area') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('area', e.target.value)}
                onBlur={() => handleBlur('area')}
              />
            )}
          </Field>

          {/* 5 — pincode fills city and state; neither is ever typed */}
          <div className="eq-row eq-row--pin">
            <Field id="pincode" label="Pincode" required error={shown('pincode')}>
              {(describedBy) => (
                <input
                  id="pincode"
                  ref={setRef('pincode')}
                  className={`eq-input eq-input--pin ${shown('pincode') ? 'eq-input--error' : ''}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  placeholder="560008"
                  value={form.pincode}
                  aria-invalid={shown('pincode') ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => handlePincode(e.target.value)}
                  onBlur={() => handleBlur('pincode')}
                />
              )}
            </Field>

            <Field id="city" label="City">
              <input
                id="city"
                className="eq-input eq-input--ro"
                type="text"
                readOnly
                tabIndex={-1}
                value={pin.city}
                placeholder={pin.status === 'loading' ? '…' : ''}
              />
            </Field>

            <Field id="state" label="State">
              <input
                id="state"
                className="eq-input eq-input--ro"
                type="text"
                readOnly
                tabIndex={-1}
                value={pin.state}
                placeholder={pin.status === 'loading' ? '…' : ''}
              />
            </Field>
          </div>

          {/* The pincode lookup speaks under the row it belongs to. `not_found`
              is already a blocking field error, so it is not repeated here. */}
          <div className={`eq-pinres eq-pinres--${pin.status}`} aria-live="polite">
            {pin.status === 'loading' && <span className="eq-skel" />}
            {pin.status === 'error' && <span className="eq-pinres__bad">Couldn’t check right now</span>}
          </div>

          {/* 6 — landmark: mandatory only when there is no street to name */}
          <Field
            id="landmark"
            label="Landmark"
            optional
            error={shown('landmark')}
            warning={warnFor('landmark')}
          >
            {(describedBy) => (
              <input
                id="landmark"
                ref={setRef('landmark')}
                className={`eq-input ${shown('landmark') ? 'eq-input--error' : ''}`}
                type="text"
                maxLength={50}
                placeholder="e.g. Opposite Reliance Fresh"
                value={form.landmark}
                aria-invalid={shown('landmark') ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setValue('landmark', e.target.value)}
                onBlur={() => handleBlur('landmark')}
              />
            )}
          </Field>

          {/* 7 — unchanged from the current screen */}
          <Field id="ownership" label="Property ownership" required error={shown('ownership')}>
            <Choice
              name="ownership"
              ariaLabel="Property ownership"
              innerRef={setRef('ownership')}
              value={form.ownership}
              onPick={pick}
              options={[
                { val: 'SELF_OWNED', text: 'Self-owned' },
                { val: 'RENTED', text: 'Rented' },
              ]}
            />
          </Field>
        </form>

        <AddressStrength score={score} blocked={blocked} blockedText={meterBlockedText} />
      </div>

      {/* Blocking lives on the CTA — no top-of-page summary banner.
          The button stays clickable so tapping it re-scrolls to the offending
          field instead of leaving the customer with a dead control. */}
      <div className="eq-footer">
        {attempted && !ok && blockedReason && (
          <p className="eq-footer__hint" role="alert">
            {blockedReason}
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
