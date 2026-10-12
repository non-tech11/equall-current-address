# Address screen v2 — Google Places search

Implementation notes for the v2 address screen. Read alongside [README.md](README.md) (how the screen
is used) and [SPEC.md](SPEC.md) (why the validation works the way it does).

- **Live demo:** https://equall-address-v2.vercel.app/current_address_v2
- **Local:** `npm run dev` → http://localhost:5199/v2.html
- **Branch:** `feat/places-search-v2`

---

## 1. What v2 adds

v2 is the v1 screen with a **"Search your address"** box at the top of the form card. The customer types
a society, street or area name, picks a Google suggestion, and the structured fields below are
**prefilled**. The customer then adds the flat / house number and checks the rest.

Ground rules the implementation keeps:

1. **Search only prefills, it never submits.** Every prefilled value goes through the same
   `validateAddress()` as typed input. No rule in `addressValidation.js` changed.
2. **The flat / house number never comes from Google.** Google almost never has unit numbers for
   Indian addresses. After a pick, focus jumps to that field.
3. **City and state still come from the pincode lookup** (`pincodeService.js`), not from Google.
   Google fills the pincode, and the existing pincode effect resolves city / state as it always did.
   This keeps city / state consistent with the PIN master that operations uses.
4. **Without a key, or if Google fails, the screen behaves exactly like v1.** The search box hides
   itself or shows a one-line notice, and the manual fields work as normal.
5. **v1 is unchanged.** The only change to `AddressForm.jsx` is an optional `renderSearch` prop. v1
   doesn't pass it.

---

## 2. Files

| File | Status | Role |
|---|---|---|
| `src/address/placesService.js` | new | Loads the Maps JS script, fetches suggestions, resolves place details, maps Google address components onto form keys. No React. |
| `src/address/PlaceSearch.jsx` | new | The combobox UI: debounced input, dropdown, keyboard navigation, error states. |
| `src/address/AddressForm.jsx` | changed | New optional `renderSearch` prop, `applyPlace()` merge handler, `meta.place` on the payload. |
| `src/address/address.css` | changed | `.eq-psearch*` styles appended at the end. |
| `src/v2/main.jsx` | new | v2 demo harness. Reads the key and passes `PlaceSearch` into `AddressForm`. |
| `v2.html` | new | Second Vite entry page. |
| `vite.config.js` | changed | Multi-page build: `index.html` (v1) and `v2.html` (v2). |
| `vercel.json` | changed | Rewrites `/current_address_v2` → `/v2.html`. |
| `.env.example` | new | Documents `VITE_GOOGLE_MAPS_API_KEY`. |
| `.gitignore` | changed | Ignores `.env.local` and `.env.*.local`. |

No new npm dependencies. The Maps script is injected at runtime by `loadPlaces()`.

---

## 3. How it works

### 3.1 Flow

```
customer types ≥3 chars
  └─ 250 ms debounce
      └─ suggest()  → AutocompleteSuggestion.fetchAutocompleteSuggestions (India only, en-IN)
          └─ dropdown of { main, secondary } suggestions
customer picks one
  └─ resolve()  → placePrediction.toPlace().fetchFields(addressComponents, formattedAddress,
  │                                                       displayName, location, types)
  └─ toComponents(place)  → { pincode?, houseNo?, building?, locality?, area? }
  └─ onSelect({ components, place })
      └─ AddressForm.applyPlace()
          ├─ merge components into form state
          ├─ mark those fields touched (so their validation shows straight away)
          ├─ store place facts for the payload
          └─ focus House / Flat no. (or Home type if Google did return a number)
pincode changes → existing pincode effect → city / state
```

### 3.2 Script loading (`loadPlaces`)

- Injects `https://maps.googleapis.com/maps/api/js?key=…&v=weekly&loading=async&language=en&region=IN&callback=…`
  once, then calls `google.maps.importLibrary('places')`.
- The promise is cached. On failure it is cleared so a later keystroke can retry.
- If `window.google.maps.importLibrary` already exists (another part of the host app loaded Maps),
  it reuses it instead of injecting a second script.
- `window.gm_authFailure` rejects the load if Google refuses the key. It only fires during load; a key
  that fails later surfaces as a thrown error from `fetchAutocompleteSuggestions`, which
  `PlaceSearch` handles the same way.

> **Integration note:** if the onboarding app already loads the Maps JS API with its own loader, keep a
> single loader. Two `<script>` tags with different parameters will conflict.

### 3.3 Billing sessions

One `AutocompleteSessionToken` covers every keystroke up to the pick, so Google bills the whole search
as one session. `fetchFields()` on the picked place ends the session, and `PlaceSearch` drops the
token so the next search starts a new one. A search the customer abandons without picking is billed
per request. Check current Places API (New) pricing before rollout.

### 3.4 Field mapping (`toComponents`)

| Form field | Taken from Google | Notes |
|---|---|---|
| `pincode` | `postal_code` | Only if it is a valid 6-digit Indian PIN. |
| `houseNo` | `street_number`, `subpremise` | Rarely present in India. Usually left empty for the customer. |
| `building` | `premise`, else `displayName` when the place type is `premise` / `subpremise` / `establishment` / `point_of_interest` | `displayName` is skipped if it just repeats a road, sublocality or town name. |
| `locality` (street) | `route`, else `sublocality_level_3` | Often empty for societies; the customer types it (street is mandatory). |
| `area` | `sublocality_level_2, sublocality_level_1` (narrowest first), else `neighborhood`, else `locality` | The `locality` fallback is there for villages and small towns, where it is the village name. |
| `landmark`, `homeType`, `ownership` | — | Never filled. |

Values are whitespace-collapsed and clipped to the inputs' `maxLength` (house no. 40, building /
street / area 60). Keys with no value are omitted, so the merge never blanks a field.

Example (picked "Prestige Shantiniketan", Bengaluru): building `Prestige Shantiniketan`, area
`Thigalarapalya, Krishnarajapuram`, pincode `560048` → city `Bangalore`, state `Karnataka` from the
pincode lookup. Street and flat no. left for the customer.

### 3.5 `AddressForm` changes

```jsx
<AddressForm
  renderSearch={({ onSelect, onEvent }) => (
    <PlaceSearch apiKey={key} onSelect={onSelect} onEvent={onEvent} />
  )}
  /* …all v1 props unchanged… */
/>
```

- `renderSearch` is rendered at the top of the form card. When it is absent nothing renders (v1).
- `applyPlace({ components, place })` merges components, marks them touched, records the place, then
  focuses the next field after a `requestAnimationFrame`.
- On confirm, if a place was picked: `payload.meta.place` is set.

### 3.6 Payload addition

```json
"meta": {
  "addressScore": 3,
  "houseNoSignal": "...",
  "buildingWasRequired": true,
  "place": {
    "placeId": "ChIJ...",
    "formattedAddress": "Prestige Shantiniketan, Thigalarapalya, ...",
    "lat": 12.99,
    "lng": 77.72,
    "prefilled": ["pincode", "building", "area"]
  }
}
```

`meta.place` is absent when the customer did not use search. The backend should treat it as optional.
`lat` / `lng` are the coordinates of the picked Google place, not a verified residence location.

### 3.7 Analytics events

New events, sent through the existing `onEvent` prop:

| Event | Data | When |
|---|---|---|
| `address_place_selected` | `{ filled: string[] }` | A suggestion was picked and resolved. |
| `address_places_failed` | `{ reason: string }` | Script load, suggestions or place details failed. |

All v1 events are unchanged.

### 3.8 `PlaceSearch` UI behaviour

- Minimum 3 characters, 250 ms debounce. Stale responses are dropped.
- Keyboard: ↓ / ↑ move, Enter picks, Esc closes. ARIA combobox / listbox roles with
  `aria-activedescendant`.
- Options use `onMouseDown preventDefault` so a tap lands before the input's blur closes the list
  (blur closes after 150 ms).
- States: idle, loading (spinner), unavailable (no key or an error). With no key and no query typed,
  only a one-line "search is unavailable" notice renders.
- The dropdown footer shows "powered by Google" as text (see §6).

---

## 4. Setup

### 4.1 Google Cloud

1. Enable **Maps JavaScript API** and **Places API (New)** on the GCP project. The legacy "Places API"
   is not used.
2. Restrict the key:
   - **Application restriction:** HTTP referrers — production domain(s),
     `equall-address-v2.vercel.app`, preview domains you need, `localhost:5199`.
   - **API restriction:** only the two APIs above.
3. Set a quota / budget alert. This is a browser key: anyone who opens the page can read it, so the
   restrictions are the protection.

### 4.2 Local

```bash
cp .env.example .env.local     # set VITE_GOOGLE_MAPS_API_KEY
npm install
npm run dev                    # http://localhost:5199/v2.html
```

`VITE_` variables are inlined into the bundle at **build time** — restart the dev server after
changing `.env.local`, and rebuild after changing the key in Vercel.

### 4.3 Vercel

The demo is a separate Vercel project, `equall-address-v2`. The existing `equall-address-form`
project (v1) is untouched.

- The current deployment was made from the CLI with the key passed as a one-off build variable.
  **Save it to the project** (production and preview), otherwise the next build ships without search:
  ```bash
  vercel env add VITE_GOOGLE_MAPS_API_KEY production
  vercel env add VITE_GOOGLE_MAPS_API_KEY preview
  ```
  Keep the `VITE_` name when the CLI warns about it; the app only reads `VITE_` variables in the
  browser.
- The project is not connected to the GitHub repo yet. Connect it (or deploy v2 from the main
  project) once the branch is merged.
- `/` on that project redirects to `/current_address` (v1), as in the original project. Share the
  `/current_address_v2` path.

---

## 5. Integrating into the onboarding app

1. Copy `src/address/` as today; `PlaceSearch.jsx` and `placesService.js` come with it.
2. Provide the key from the app's own config (env var / remote config). Don't hard-code it.
3. Pass `renderSearch` to the `AddressForm` instances that should have search (current address, and
   permanent address if wanted). For permanent address with "Same as current" on, consider not
   rendering search.
4. Reuse the app's existing Maps loader if there is one (§3.2).
5. Accept the optional `meta.place` in the save-address API and persist `placeId`, `lat`, `lng` if
   they are useful for verification / field visits.
6. Wire the two new events into the analytics dashboard. Useful metrics: share of submissions with
   `meta.place`, which fields get prefilled, failure rate, and whether search changes the
   `address_submit_blocked` rate.

---

## 6. Known gaps / TODO before production

| # | Gap | Suggested fix |
|---|---|---|
| 1 | A pick **overwrites** values the customer already typed in the fields Google returns. | Only fill empty fields, or confirm before overwriting. |
| 2 | A **second pick** doesn't clear fields the first pick filled but the second doesn't return (e.g. an old building name stays). | On pick, clear the previously prefilled keys (`place.prefilled`) before merging. |
| 3 | `meta.place.prefilled` doesn't record whether the customer **edited** a prefilled value afterwards. | Compare final values with the prefilled values at submit and add an `edited` list. |
| 4 | Attribution is plain "powered by Google" text. | Check Google Maps Platform attribution requirements for autocomplete shown without a map; use the official logo asset if required. |
| 5 | `area` falls back to Google's `locality`; for an urban pick with no sublocality this is the city name (e.g. "Bengaluru"). | Skip the fallback when `locality` equals the pincode city, or limit it to non-urban results. |
| 6 | No unit tests for `toComponents()`. | It is pure: add fixture-based tests with real `addressComponents` from a range of urban, society and rural picks. |
| 7 | `gm_authFailure` is global and only rejects during load. | Fine for the demo. In the app, centralise it in the shared Maps loader. |
| 8 | No location bias. | Optionally pass `locationBias` from the customer's pincode / city once known. |

---

## 7. Test checklist

- [ ] No key set → notice shows, manual form works, submit payload has no `meta.place`.
- [ ] Wrong / restricted key → `address_places_failed` fires, form still works.
- [ ] Society pick (e.g. "Prestige Shantiniketan") → building, area, pincode filled; city / state
      resolve; focus on flat no.
- [ ] Road pick (e.g. "100 Feet Road Indiranagar") → street and area filled.
- [ ] Village / small-town pick → area is the village name, pincode correct.
- [ ] Keyboard only: type, ↓, Enter, then Tab through the form.
- [ ] Mobile width: dropdown fits, tapping an option picks it (does not just close the list).
- [ ] Submit after pick → `meta.place` present with `placeId`, `lat`, `lng`, `prefilled`.
- [ ] v1 (`/current_address`) unchanged: no search box, same payload.
- [ ] `node docs/verify-logic-tables.mjs` still passes.
