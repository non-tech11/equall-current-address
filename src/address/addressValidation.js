/**
 * Address validation for the Equall current / permanent address screen.
 *
 * Design principle: address quality is measured by COMPONENT COVERAGE,
 * not by character or word count. Rural door-number addresses
 * ("2-137 l" + "Pedda Pada Khana") are short AND complete; urban ones
 * are long. Length rules block the former and let junk through the latter.
 *
 * Field hierarchy (narrow → wide):
 *   houseNo   Apartment / House / Floor  e.g. "Flat 501, 3rd Floor", "9-208-1", "H.No 830"
 *   building  Apartment name             e.g. "NVV Golden Classic"
 *   locality  Street / gali / colony     e.g. "Gali no 5, Mittal Colony"
 *   area      Area / village (master)    e.g. "Madhurawada"
 *   landmark  Landmark                   e.g. "Near Mahathi School"
 *   city / state — derived from pincode, never typed
 */

export const FIELD_ORDER = [
  'pincode',
  'area',
  'houseNo',
  'building',
  'locality',
  'landmark',
  'homeType',
  'ownership',
];

/**
 * Fields that count toward the address strength score, and the minimum length
 * each must reach to earn its point.
 *
 * Thresholds differ by field because the shortest *real* value differs:
 * house numbers are legitimately 2–3 chars (`L-20`, `303`), area names are
 * rarely under 4 (`Vapi`, `Eluru`), and a locality or landmark under 5 chars
 * carries no information a courier can use.
 */
const SCORE_MIN = {
  houseNo: 2,
  building: 3,
  locality: 5,
  area: 4,
  landmark: 5,
};

const SCORED_FIELDS = Object.keys(SCORE_MIN);

/** Minimum components required to submit. */
export const MIN_SCORE = 3;

/**
 * Punctuation people actually type in Indian addresses: `H.No: 830`,
 * `Plot 5 + 6`, `NEW_COLONY`, `Flat 501 "A" wing`, `S/o`, `No.4-A`.
 * The character rule exists to stop non-Latin script reaching courier label
 * printing — not to police punctuation, so this stays permissive.
 */
const ALLOWED_RE = /^[A-Za-z0-9\s,.:;'"|/\\#&()\[\]{}<>+*_@%!?=~^$-]*$/;

/**
 * Anything left outside ASCII after normalisation (S-05) is a non-Latin
 * script — Devanagari, Telugu, Tamil, emoji. That is what actually breaks the
 * label, and it gets its own clearer message.
 */
const NON_ASCII_RE = /[^\x20-\x7E]/;

/** Smart punctuation → ASCII. Mobile keyboards substitute these silently. */
const SMART_MAP = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐‑‒–—―−]/g, '-'],
  [/[  -​  　]/g, ' '],
  [/[…]/g, '...'],
];

/** Replace smart punctuation with its ASCII equivalent. */
export const normalizePunctuation = (s = '') =>
  SMART_MAP.reduce((acc, [re, to]) => acc.replace(re, to), String(s));
const PIN_RE = /^[1-9]\d{5}$/;
const PIN_IN_TEXT_RE = /\b[1-9]\d{5}\b/;
const DIGITS_ONLY_RE = /^[\d\W_]+$/;
const UNIT_TOKEN_RE = /^(flat|f\.?\s?no|tf-?\d|gf|ff|sf|s-?\d|apt|apartment|unit|block|room|door)\b/i;
const STREET_WORD_RE = /\b(gali|galli|street|st|road|rd|lane|marg|sector|block|cross|colony|nagar|puram|pet|peta|veedhi|vidhi|chowk|bazar|phase|pocket)\b/i;

/** Placeholder house numbers seen in production data: "0-0", "NA", "XX". */
const PLACEHOLDER_RE = /^(0|00|0\s?0|na|n\s?a|nil|none|null|x+|test|abcd?|asdf|same|home)$/;

const LANDMARK_PREFIX_RE = /^(near|behind|beside|opp|opposite|next|in front|front of|above|below)\b/i;

export const norm = (s = '') =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Normalise punctuation, collapse whitespace, drop edge separators. Run on blur. */
export const sanitize = (s = '') =>
  normalizePunctuation(s)
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.\-]+/, '')
    .replace(/[\s,.\-]+$/, '')
    .trim();

/** Strip a 6-digit pincode accidentally pasted into a text field. */
export const stripPincode = (s = '') => sanitize(String(s).replace(PIN_IN_TEXT_RE, ''));

/**
 * Classify the house-number pattern. Mirrors the `signal` column in the
 * address-quality analysis sheet so the before/after mix stays comparable.
 */
export function houseNoSignal(value = '') {
  const v = String(value).trim();
  if (!v) return 'none';
  if (/^(h\.?\s?no|hno|d\.?\s?no|dno|door|flat|plot|house|room|shop|qtr|quarter|block)\b/i.test(v))
    return 'keyword';
  if (/\d+\s?[-/]\s?\d/.test(v)) return 'slash';
  if (/^[a-z]{1,3}[\s-]?\d/i.test(v)) return 'alnum';
  if (/\d/.test(v)) return 'no_prefix';
  return 'none';
}

/** Is the apartment name mandatory for this form state? */
export function buildingRequired(form) {
  return form.homeType === 'FLAT' || UNIT_TOKEN_RE.test(String(form.houseNo || '').trim());
}

/** 0–5 count of components filled to a length that carries information. */
export function addressScore(form) {
  return SCORED_FIELDS.filter((k) => String(form[k] || '').trim().length >= SCORE_MIN[k]).length;
}

/** Fields with a value present but too short to earn their point. */
export function underLengthFields(form) {
  return SCORED_FIELDS.filter((k) => {
    const len = String(form[k] || '').trim().length;
    return len > 0 && len < SCORE_MIN[k];
  });
}

export { SCORE_MIN };

export function strengthLabel(score) {
  if (score <= 1) return { tone: 'bad', text: 'Too little detail' };
  if (score === 2) return { tone: 'bad', text: 'Needs more detail' };
  if (score === 3) return { tone: 'ok', text: 'Okay — a landmark makes you easier to find' };
  if (score === 4) return { tone: 'good', text: 'Good — clear and complete' };
  return { tone: 'good', text: 'Excellent — easy to find' };
}

/**
 * Validate one field. Returns an error string (blocking) or null.
 * `ctx` carries resolved pincode data: { city, state, pinStatus }.
 */
export function validateField(name, form, ctx = {}) {
  const raw = String(form[name] ?? '');
  const v = normalizePunctuation(raw).trim();

  // Smart quotes and dashes are normalised, not rejected (S-05). What is left
  // outside ASCII is another script, and that is the only thing worth blocking.
  if (v && NON_ASCII_RE.test(v)) return 'Please type your address in English';
  if (v && !ALLOWED_RE.test(v)) return 'Remove special symbols from this field';

  switch (name) {
    case 'pincode': {
      if (!v) return 'Enter your 6-digit pincode';
      if (!PIN_RE.test(v)) return 'Enter a valid 6-digit pincode';
      if (ctx.pinStatus === 'not_found') return "We couldn't find this pincode — please check";
      return null;
    }

    case 'area': {
      if (v.length < 3) return 'Enter your area or village';
      if (DIGITS_ONLY_RE.test(v)) return 'Enter a name, not only numbers';
      // area == city is only a warning: in small towns the post office name and
      // the city name are genuinely the same. area == state never is.
      if (ctx.state && norm(v) === norm(ctx.state)) return 'Enter your area or village, not the state';
      if (v.length > 60) return 'Keep this under 60 characters';
      return null;
    }

    case 'houseNo': {
      if (!v) return 'Enter your house / flat / door number';
      // No "must contain a digit" rule: genuine rural plots, named houses and
      // survey-number addresses carry no numeral, and blocking them costs more
      // than the junk it caught.
      if (PLACEHOLDER_RE.test(norm(v))) return "This doesn't look like a real house number";
      if (PIN_IN_TEXT_RE.test(v)) return 'Remove the pincode from this field';
      if (v.length > 40) return 'Too long — put the apartment name in the next field';
      return null;
    }

    case 'building': {
      if (!buildingRequired(form)) {
        if (v && v.length > 60) return 'Keep this under 60 characters';
        return null;
      }
      if (v.length < 3) return 'Enter the apartment or building name';
      if (DIGITS_ONLY_RE.test(v)) return 'Enter a name, not only numbers';
      if (v.length > 60) return 'Keep this under 60 characters';
      return null;
    }

    // Street is required on its own, with no landmark escape: it is the field
    // verification leans on hardest, and a landmark is not a substitute
    // for it. A village address with no named street puts its ward, cross or
    // survey identifier here — that is what the courier reads.
    case 'locality': {
      if (!v) return 'Enter street / gali / colony';
      if (v.length < 3) return 'Too short — add the street, gali or colony name';
      if (v && DIGITS_ONLY_RE.test(v) && !STREET_WORD_RE.test(v))
        return 'Enter a street or colony name, not only numbers';
      if (v.length > 60) return 'Keep this under 60 characters';
      return null;
    }

    // Landmark is always optional: it strengthens the address (and earns a
    // score point) but never blocks. Street / gali carries the requirement.
    case 'landmark': {
      if (!v) return null;
      if (v.length < 5) return 'Too short — mention a shop, temple, school or office';
      if (v.length > 50) return 'Keep this under 50 characters';
      return null;
    }

    case 'homeType':
      return v ? null : 'Select your home type';

    case 'ownership':
      return v ? null : 'Select property ownership';

    default:
      return null;
  }
}

/** Non-blocking observations. Shown in black, never stop submit. */
export function collectWarnings(form, ctx = {}) {
  const out = [];
  const area = norm(form.area);

  ['building', 'locality', 'landmark'].forEach((k) => {
    const val = norm(form[k]);
    if (val && area && val === area) {
      out.push({ field: k, text: 'Same as your area — is this correct?' });
    }
  });

  if (norm(form.building) && norm(form.building) === norm(form.locality)) {
    out.push({ field: 'locality', text: 'Same as the apartment name — is this correct?' });
  }

  FIELD_ORDER.forEach((k) => {
    if (k !== 'pincode' && PIN_IN_TEXT_RE.test(String(form[k] || ''))) {
      out.push({ field: k, text: 'Pincode removed — it is already captured above' });
    }
  });

  if (String(form.houseNo || '').trim().length > 25) {
    out.push({ field: 'houseNo', text: 'Long house number — the apartment name goes in the next field' });
  }

  // Present but too short to count toward the score — say so at the field,
  // otherwise the strength meter looks arbitrary.
  underLengthFields(form).forEach((k) => {
    const text =
      k === 'area'
        ? 'Add the full area or village name'
        : k === 'locality'
          ? 'Add more detail — the full street, gali or colony name'
          : 'A bit more detail here strengthens your address';
    out.push({ field: k, text });
  });

  if (ctx.city && norm(form.area) && norm(form.area) === norm(ctx.city)) {
    out.push({ field: 'area', text: 'That is the city name — add your smaller area or village if it has one' });
  }

  return out;
}

/**
 * Full-form validation. Call on submit.
 * Returns { errors, warnings, score, ok, firstErrorField }.
 */
export function validateAddress(form, ctx = {}) {
  const errors = {};
  FIELD_ORDER.forEach((name) => {
    const err = validateField(name, form, ctx);
    if (err) errors[name] = err;
  });

  const score = addressScore(form);
  if (score < MIN_SCORE) {
    errors._form = 'Your address needs more detail — add street, area or a landmark';
  }

  const firstErrorField = FIELD_ORDER.find((f) => errors[f]) || null;

  return {
    errors,
    warnings: collectWarnings(form, ctx),
    score,
    ok: Object.keys(errors).length === 0,
    firstErrorField,
  };
}

/** Delivery-label lines, exactly as they will be printed. */
export function assembleLabel(form, ctx = {}) {
  const part = (k) => sanitize(form[k] || '');
  const lines = [];

  const first = [part('houseNo'), part('building')].filter(Boolean).join(', ');
  if (first) lines.push(first);
  if (part('locality')) lines.push(part('locality'));

  const landmark = part('landmark');
  if (landmark) lines.push(LANDMARK_PREFIX_RE.test(landmark) ? landmark : `Near ${landmark}`);

  const areaCity = [part('area'), ctx.city].filter(Boolean).join(', ');
  if (areaCity) lines.push(areaCity);

  const tail = [ctx.state, form.pincode].filter(Boolean).join(' – ');
  if (tail) lines.push(tail);

  return lines;
}

/** Flat payload for the API + analytics. */
export function toPayload(form, ctx = {}) {
  return {
    houseNo: sanitize(form.houseNo),
    buildingName: sanitize(form.building),
    locality: sanitize(form.locality),
    area: sanitize(form.area),
    landmark: sanitize(form.landmark),
    city: ctx.city || '',
    state: ctx.state || '',
    pincode: form.pincode,
    homeType: form.homeType,
    residenceType: form.ownership,
    // legacy shape, for APIs that still expect two free-text lines
    lineOne: [sanitize(form.houseNo), sanitize(form.building)].filter(Boolean).join(', '),
    lineTwo: [sanitize(form.locality), sanitize(form.area)].filter(Boolean).join(', '),
    meta: {
      addressScore: addressScore(form),
      houseNoSignal: houseNoSignal(form.houseNo),
      buildingWasRequired: buildingRequired(form),
    },
  };
}
