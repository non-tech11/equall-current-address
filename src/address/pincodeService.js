/**
 * Pincode → city / state.
 *
 * Default implementation hits the public India Post API. Swap `ENDPOINT`
 * (or pass your own `fetcher`) for the internal PIN master so the city and
 * state match what operations and the courier partner actually use.
 *
 * Area / Village is deliberately NOT derived from here — it is free-form text
 * the customer types, with no matching against any list.
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

/**
 * @returns {Promise<{pincode:string, city:string, state:string}>}
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
  if (!first || first.Status !== 'Success' || !Array.isArray(first.PostOffice) || !first.PostOffice[0]) {
    throw new PincodeNotFound(pin);
  }

  const po = first.PostOffice[0];
  const result = {
    pincode: pin,
    // District is the city field the credit systems expect
    city: clean(po.District || po.Region || ''),
    state: clean(po.State || ''),
  };

  cache.set(pin, result);
  return result;
}

/** Test/offline seam — lets Storybook and unit tests run without network. */
export function seedPincode(pin, data) {
  cache.set(String(pin), { pincode: String(pin), ...data });
}
