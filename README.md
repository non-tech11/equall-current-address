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
