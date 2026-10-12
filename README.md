# Equall — structured address screen

Address capture that blocks undeliverable addresses without blocking short ones.
Design rationale, validation table and rollout plan: [SPEC.md](SPEC.md).

Plain React 18, no UI framework, no runtime dependencies beyond React itself.
Drop `src/address/` into the onboarding app as-is.

## Run the demo

```bash
npm install
npm run dev          # http://localhost:5199
```

Submitted payload and every analytics event print to the console.

## v2 — Google Places search

`/current_address_v2` (dev: http://localhost:5199/v2.html) is the same screen with a
"Search your address" box on top. Picking a result **prefills** pincode, building, street and area;
the flat / house number is never taken from Google, and every value still runs through the same
validation. The payload gains `meta.place` (`placeId`, `formattedAddress`, `lat`, `lng`, `prefilled`).

```bash
cp .env.example .env.local   # then set VITE_GOOGLE_MAPS_API_KEY
```

The key's GCP project needs **Maps JavaScript API** and **Places API (New)** enabled; restrict the
key by HTTP referrer. For the deploy, add the same variable in Vercel. Without a key the search box
hides itself and the manual form works as v1.

```jsx
<AddressForm
  renderSearch={(props) => <PlaceSearch apiKey={key} {...props} />}
  ...
/>
```

## Use it

```jsx
import AddressForm from './address/AddressForm';

<AddressForm
  title="Current address"
  onBack={goBack}
  onSubmit={(payload) => api.saveAddress(payload)}   // see SPEC §7 for the shape
  onEvent={(name, data) => analytics.track(name, data)}
  submitting={saving}
/>
```

Permanent-address variant:

```jsx
<AddressForm
  title="Permanent address"
  backLabel="Back to current address"
  onBack={goBack}
  showSameAsCurrent
  sameAsCurrent={same}
  onSameAsCurrentChange={setSame}
  initialValue={same ? currentAddressComponents : undefined}
  onSubmit={save}
/>
```

`initialValue` takes the component keys — `pincode`, `houseNo`, `building`, `locality`, `area`,
`landmark`, `homeType`, `ownership`. Copy components, never concatenated lines.

## Files

| File | Role |
|---|---|
| `AddressForm.jsx` | The screen: fields, blur validation, error summary, scroll-to-first-error |
| `addressValidation.js` | All rules, the coverage score, label assembly, API payload. No React — unit-testable as-is |
| `AddressStrength.jsx` | Coverage meter (replaces the character-count rule) |
| `ConfirmAddressSheet.jsx` | Delivery-label preview before submit |
| `pincodeService.js` | Pincode → city / state, with cache |
| `PlaceSearch.jsx` | v2: Places search combobox |
| `placesService.js` | v2: Maps JS loader, suggestions, Google components → form keys |
| `address.css` | Scoped styles, all under `.eq-*` |

## Before production

1. **Point at the internal pincode master.** Replace `ENDPOINT` in `pincodeService.js` — the default
   is the public India Post API, which disagrees with the production city master on some pincodes
   (see SPEC §9).
2. **Theme tokens.** Colours are CSS custom properties on `.eq-screen` (`--eq-purple`, `--eq-ink`,
   `--eq-error`, …). Point them at the design system, or swap `address.css` for the app's own styling
   — no logic depends on it.
3. **Tune the placeholder list.** `PLACEHOLDER_RE` in `addressValidation.js` currently covers the junk
   found in the analysis sheet's *complete* bucket; extend it once the failing buckets are reviewed.

## Keeping the docs honest

Two scripts replay the reference documents through the real validator, so a rule change cannot leave
a table claiming the old behaviour:

```bash
node docs/verify-logic-tables.mjs   # asserts LOGIC.md §12 — exits non-zero on any mismatch
node docs/generate-scenarios.mjs    # rewrites EXAMPLES_AND_SCENARIOS.md from the validator
```

Run both after touching `addressValidation.js`. `verify-logic-tables.mjs` exists because LOGIC.md §12
drifted once: three must-pass rows with an empty street kept their ✓ after street was made mandatory.
