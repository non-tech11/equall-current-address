/**
 * Google Places (New) search → address components.
 *
 * Uses the Maps JavaScript API's programmatic `AutocompleteSuggestion` so the
 * dropdown can be styled like the rest of the screen. Needs two APIs enabled
 * on the key's GCP project: "Maps JavaScript API" and "Places API (New)".
 *
 * Search only PREFILLS the structured fields — every value still goes through
 * the same validation as typed input, and the flat / house number is never
 * taken from Google (it almost never has one for Indian addresses).
 */

let loading = null;

/** Injects the Maps JS bootstrap once and resolves with the places library. */
export function loadPlaces(apiKey) {
  if (!apiKey) return Promise.reject(new Error('Missing Google Maps API key'));
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) return resolve();

    const cb = '__eqMapsReady';
    window[cb] = () => {
      delete window[cb];
      resolve();
    };
    // A bad / unrestricted-referrer key loads fine and then fails here.
    window.gm_authFailure = () => reject(new Error('Google Maps rejected the API key'));

    const s = document.createElement('script');
    s.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&language=en&region=IN&callback=${cb}`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps script failed to load'));
    document.head.appendChild(s);
  })
    .then(() => window.google.maps.importLibrary('places'))
    .catch((err) => {
      loading = null;
      throw err;
    });

  return loading;
}

/**
 * @returns {Promise<Array<{id:string, main:string, secondary:string, prediction:object}>>}
 */
export async function suggest(apiKey, input, sessionToken) {
  const { AutocompleteSuggestion } = await loadPlaces(apiKey);
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    includedRegionCodes: ['in'],
    language: 'en-IN',
    region: 'in',
  });

  return suggestions
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      id: p.placeId,
      main: p.mainText?.text || p.text.text,
      secondary: p.secondaryText?.text || '',
      prediction: p,
    }));
}

export async function newSessionToken(apiKey) {
  const { AutocompleteSessionToken } = await loadPlaces(apiKey);
  return new AutocompleteSessionToken();
}

/** Resolves a suggestion to place details. Ends the billing session. */
export async function resolve(suggestion) {
  const place = suggestion.prediction.toPlace();
  await place.fetchFields({
    fields: ['addressComponents', 'formattedAddress', 'displayName', 'location', 'types'],
  });
  return place;
}

const MAX = { building: 60, locality: 60, area: 60 };

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Types that mean the picked result is a named building / society, not a road or area. */
const NAMED_PLACE = ['premise', 'subpremise', 'establishment', 'point_of_interest'];

/**
 * Maps Google address components onto the form's component keys.
 * Returns only the keys it could fill — callers merge, never replace.
 */
export function toComponents(place) {
  const comps = place.addressComponents || [];
  const get = (type) => comps.find((c) => c.types.includes(type))?.longText || '';

  const route = get('route');
  const sub1 = get('sublocality_level_1');
  const sub2 = get('sublocality_level_2');
  const sub3 = get('sublocality_level_3');
  const neighborhood = get('neighborhood');
  // villages and small towns carry their own name in `locality`
  const town = get('locality');

  // Area, narrowest-first: "HAL 2nd Stage, Indiranagar"
  const areaParts = [...new Set([sub2, sub1].filter(Boolean))];
  const area = areaParts.length ? areaParts.join(', ') : neighborhood || town;

  // Street: the road; failing that, the lane-level sublocality (gali / cross)
  const street = route || (sub3 && !areaParts.includes(sub3) ? sub3 : '');

  const premise = get('premise');
  const name = place.displayName || '';
  const isNamed = (place.types || []).some((t) => NAMED_PLACE.includes(t));
  const building =
    premise ||
    (isNamed && name && ![route, sub1, sub2, sub3, town].includes(name) ? name : '');

  const houseNo = [get('street_number'), get('subpremise')].filter(Boolean).join(', ');

  const out = {
    pincode: /^[1-9]\d{5}$/.test(get('postal_code')) ? get('postal_code') : '',
    houseNo: clip(houseNo, 40),
    building: clip(building, MAX.building),
    locality: clip(street, MAX.locality),
    area: clip(area, MAX.area),
  };

  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}
