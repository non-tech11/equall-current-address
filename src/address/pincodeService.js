/**
 * Pincode → city / state / locality list.
 *
 * Default implementation hits the public India Post API. Swap `ENDPOINT`
 * (or pass your own `fetcher`) for the internal PIN master so the locality
 * list matches what operations and the courier partner actually use.
 */

const ENDPOINT = (pin) => `https://api.postalpincode.in/pincode/${pin}`;

const cache = new Map();

export class PincodeNotFound extends Error {
  constructor(pin) {
    super(`Pincode ${pin} not found`);
    this.name = 'PincodeNotFound';
    this.code = 'NOT_FOUND';
  }
}

const clean = (s = '') => String(s).replace(/\s+/g, ' ').trim();

/** Drop "X B.O", "X S.O", "X H.O" suffixes and dedupe post-office names. */
function toLocalities(postOffices = []) {
  const seen = new Map();
  postOffices.forEach((po) => {
    const name = clean(po.Name || '').replace(/\s+(B\.?O|S\.?O|H\.?O)$/i, '');
    if (!name) return;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
    // also expose the sub-district / block, often the village name people use
    [po.Block, po.Division].forEach((extra) => {
      const e = clean(extra || '');
      if (e && e.toLowerCase() !== 'na' && !seen.has(e.toLowerCase())) seen.set(e.toLowerCase(), e);
    });
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * @returns {Promise<{pincode:string, city:string, state:string, localities:string[]}>}
 * @throws {PincodeNotFound}
 */
export async function lookupPincode(pincode, { signal, fetcher = fetch } = {}) {
  const pin = String(pincode).trim();
  if (!/^[1-9]\d{5}$/.test(pin)) throw new PincodeNotFound(pin);
  if (cache.has(pin)) return cache.get(pin);

  const res = await fetcher(ENDPOINT(pin), { signal });
  if (!res.ok) throw new Error(`Pincode lookup failed: ${res.status}`);

  const json = await res.json();
  const first = Array.isArray(json) ? json[0] : json;
  if (!first || first.Status !== 'Success' || !Array.isArray(first.PostOffice)) {
    throw new PincodeNotFound(pin);
  }

  const po = first.PostOffice;
  const result = {
    pincode: pin,
    // District is the city field the credit systems expect
    city: clean(po[0].District || po[0].Region || ''),
    state: clean(po[0].State || ''),
    localities: toLocalities(po),
  };

  cache.set(pin, result);
  return result;
}

/** Test/offline seam — lets Storybook and unit tests run without network. */
export function seedPincode(pin, data) {
  cache.set(String(pin), { pincode: String(pin), localities: [], ...data });
}
