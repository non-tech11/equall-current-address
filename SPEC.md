# Current / Permanent Address Screen — Redesign Spec

**Goal:** stop customers submitting short or undeliverable addresses, without blocking the
short-but-complete ones.
**Owner:** Anshul · **Status:** proposed · **Date:** 13 Aug 2026

---

## 1. Why the current rules don't work

Evidence: address-quality sheet, `1_complete` bucket (~180 rows, all flagged *strong signal /
action = None*, i.e. addresses the system considers good).

| line_one | line_two | words | combined chars | current rule verdict |
|---|---|---|---|---|
| `222-54-678` | `Chakali veedhi naidupeta` | 4 | 34 | non-blocking prompt fires |
| `2-137 l` | `Pedda Pada Khana` | 5 | 23 | **blocked** (<20 chars per line intent) |
| `5-136, Saluchintala` | `Saluchintala` | 3 | 31 | prompt fires |
| `Flat no-409` | `Atchuthapuram` | 3 | 24 | prompt fires |
| `B-5/246-247` | `Sec-3 Rohini` | 3 | 23 | prompt fires |

Andhra Pradesh door-number addresses are legitimately short. Delhi addresses (gali, block, floor)
are legitimately long. **Length measures region, not quality.**

Meanwhile, junk passes the length rules today — all from the same "complete" bucket:

| Defect | Example |
|---|---|
| Placeholder house number | `0-0, ramayalyam street` |
| Line 2 duplicates line 1 | `S1 Jayanthi embearled` / `Jayanthi embearled` |
| Whole address repeated verbatim | cust 64655, both lines identical |
| Line 2 is just the city | `I 10 Ganga Ram Vatika Tilak nagar` / `Delhi` |
| Pincode + country stuffed into line 1 | `WZ-476 … North West Delhi India 110034` / `SRINAGAR` |

**Conclusion:** replace the length gate with a *component coverage* gate, and capture components
in separate fields so each one can be checked on its own.

---

## 2. Field structure

Free-text Address Line 1 / Line 2 are removed. Hierarchy runs narrow → wide.

| # | Field | Required | Max | Notes |
|---|---|---|---|---|
| 1 | **Pincode** | Yes | 6 | Entered first; drives everything below |
| 2 | City, State | auto | — | Read-only, resolved from pincode, never typed |
| 3 | **Home type** — Flat/Apartment · Independent house | Yes | — | Decides whether #5 is mandatory |
| 4 | **Apartment / House / Floor number** | Yes | 40 | Must contain a digit |
| 5 | **Apartment name** | Conditional | 60 | Mandatory when home type = Flat, or house no. starts with a unit token (`Flat`, `F.No`, `TF-`, `S1`, `Block`, `Room`, `Door`) |
| 6 | **Locality** (street, gali, colony) | Conditional | 60 | Mandatory unless a Landmark is given |
| 7 | **Area / Village** | Yes | 60 | **Free-form text.** No matching against any list — village and colony names are too varied to gate on |
| 8 | **Landmark** | Conditional | 50 | Mandatory when Locality is empty; otherwise optional and nudged |
| 9 | **Property ownership** — Self-Owned · Rented | Yes | — | Unchanged from today |

Why this beats validating free text:

- **Area is its own field** ⇒ the city can no longer be typed where the area belongs; the value stays free-form so no village is ever a dead end.
- **House number in its own field** ⇒ the digit rule is unambiguous; no regex guessing over prose.
- **Locality *or* Landmark** ⇒ villages with no street name pass via landmark; city addresses with
  no landmark pass via street. Nobody is blocked, no field is silently empty.
- **Duplicate detection is trivial** ⇒ compare fields to each other instead of parsing one blob.

---

## 3. The gate: component coverage, not length

Score = how many of these five are filled to their minimum length (house no. 2, apartment name 3,
locality 5, area 4, landmark 5 characters).

| Score | Meter | Message | Behaviour |
|---|---|---|---|
| 0 · nothing typed yet | ○○○○○ grey | "Fill in your address details to see how complete it is" | — (S-02) |
| 0–1 | ●○○○○ red | "Too little detail" | Blocking |
| 2 | ●●○○○ red | "Needs more detail" | Blocking |
| 3 | ●●●○○ amber | "Okay — a landmark makes you easier to find" | Passes |
| 4 | ●●●●○ green | "Good — clear and complete" | Passes |
| 5 | ●●●●● green | "Excellent — easy to find" | Passes |

Minimum score to submit = **3**. This threshold is not arbitrary — every legitimate address shape
reaches it naturally:

- Village: house no + area + landmark = 3
- Independent urban house: house no + locality + area = 3
- Flat: house no + apartment name + area (+ locality or landmark) = 4

A vague address cannot reach 3 without supplying real detail.

---

## 4. Field-level validation

| Field | Rule | Type | Message |
|---|---|---|---|
| Pincode | `^[1-9]\d{5}$` and resolvable in the master | Blocking | "Enter a valid 6-digit pincode" / "We couldn't find this pincode — please check" |
| Area | ≥3 chars, not digits-only, ≠ state name | Blocking | "Enter your area or village" |
| Area | = city name | Non-blocking | "That is the city name — add your smaller area or village if it has one" |
| House number | non-empty, contains a digit | Blocking | "Enter your house / flat / door number" · "House number must include a digit" |
| House number | not a placeholder (`0`, `0-0`, `00`, `NA`, `nil`, `xx`, `test`) | Blocking | "This doesn't look like a real house number" |
| House number | contains a 6-digit pincode | Blocking | "Remove the pincode from this field" |
| House number | >25 chars | Non-blocking | "Long house number — the apartment name goes in the next field" |
| Apartment name | ≥3 chars when required | Blocking | "Enter the apartment or building name" |
| Locality | required when Landmark empty | Blocking | "Enter street / gali / colony — or add a landmark instead" |
| Locality | digits-only with no street word (`gali`, `road`, `sector`, `colony`, `nagar`, `cross` …) | Blocking | "Enter a street or colony name, not only numbers" |
| Landmark | required when Locality empty | Blocking | "Add a nearby landmark so we can find you" |
| Landmark | present but <5 chars | Blocking | "Too short — mention a shop, temple, school or office" |
| Landmark | empty | Non-blocking | "Couriers find addresses faster with a landmark" |
| Any text field | characters outside `A–Z a–z 0–9 space , . / # & ( ) ' -` | Blocking | "Use English letters and numbers only" |
| Any text field | contains a 6-digit pincode | Non-blocking, auto-stripped on blur | "Pincode removed — it is already captured above" |
| Apartment name / Locality / Landmark | equals the Area value | Non-blocking | "Same as your area — is this correct?" |
| Whole form | score < 3 | Blocking | "Your address needs more detail — add street, area or a landmark" |

Colour convention (per the existing validation sheet): blocking = **red**, at field level *and* in the
top-of-page summary. Non-blocking = **black**, field level only.

---

## 5. Interaction rules

1. Validate **on blur**, never per keystroke. Per-keystroke red drives abandonment.
2. Blocking shows on the CTA — red hint above it plus a muted, aria-disabled button — not in a summary banner.
3. **The blocked CTA stays tappable.** Tapping it scrolls to and focuses the first bad
   field. A disabled button hides the reason it is disabled.
4. Pincode resolves with a shimmer placeholder on city/state — never a blank flash.
5. Area is free-form text. Nothing is matched against the pincode master — village and colony names
   it does not carry are common, and a spelling nag on a correct value costs more than it saves.
6. On blur: trim, collapse inner whitespace, strip leading/trailing separators, strip stray pincodes.
7. "Same as current" on the permanent-address screen copies **components**, not concatenated lines.
8. Accessibility: every field labelled, errors in `role="alert"`, `aria-invalid` on failure, segmented
   controls are real radio groups, combobox implements `role="combobox"` + arrow-key navigation.

---

## 6. Final gate — confirm sheet

Before submit, the assembled delivery label is shown as the courier will read it:

```
Flat 501, NVV Golden Classic
Srinivasa Nagar Road
Near Mahathi School
Pothinamallayapalem, Visakhapatnam
Andhra Pradesh – 530041
```

Non-blocking warnings repeat here. Actions: **Edit address** / **Confirm**.

Rationale: seeing the label is what makes people fix a vague address. Inline red errors are what
make them abandon.

---

## 7. Data contract

```jsonc
{
  "houseNo": "Flat 501",
  "buildingName": "NVV Golden Classic",
  "locality": "Srinivasa Nagar Road",
  "area": "Pothinamallayapalem",
  "landmark": "Near Mahathi School",
  "city": "Visakhapatnam",
  "state": "Andhra Pradesh",
  "pincode": "530041",
  "homeType": "FLAT",
  "residenceType": "RENTED",

  // legacy compatibility for APIs still expecting two lines
  "lineOne": "Flat 501, NVV Golden Classic",
  "lineTwo": "Srinivasa Nagar Road, Pothinamallayapalem",

  "meta": {
    "addressScore": 5,
    "houseNoSignal": "keyword",   // keyword | slash | alnum | no_prefix | none
    "buildingWasRequired": true
  }
}
```

`meta.houseNoSignal` mirrors the `signal` column in the analysis sheet, so the before/after mix is
directly comparable once this ships.

---

## 8. Analytics events

| Event | Payload | Use |
|---|---|---|
| `address_pincode_resolved` | pincode | City/state resolution health |
| `address_pincode_failed` | pincode, reason | Master gaps / API health |
| `address_field_error` | field, message | Which rule hurts most |
| `address_submit_blocked` | fields, score, firstErrorField | Funnel drop diagnosis |
| `address_confirm_shown` / `address_confirm_edit` | score | Does the label preview cause edits? |
| `address_submitted` | full `meta` | Quality tracking over time |

Success metrics: share of submissions with score ≥4 (target ↑), undeliverable / RTO rate (target ↓),
address-edit support tickets (target ↓), address-step drop-off (must not rise).

---

## 9. Dependencies and known gaps

1. **Pincode master.** The reference build uses the public India Post API. Swap `ENDPOINT` in
   `pincodeService.js` for the internal master so city and state match what ops and the courier
   partner use. The two disagree today — e.g. `517644` returns district *Chittoor* from India Post
   while the production rows record city *Tirupati*.
2. **City master defect.** Pincode `110025` maps to city `BUDAUN` with state `DELHI` in three
   production rows. Fix before launch — once city is derived from the pincode, that row produces a
   visibly wrong city on the confirm sheet.
3. **Failing buckets not analysed.** The source sheet was read only through the `1_complete` bucket;
   the `2_*` / `3_*` rows were not visible. Placeholder and junk patterns in this spec are the ones
   that leaked into the *complete* bucket. Sharing the failing buckets would let the placeholder list
   and street-word list be tuned against real rejections.

---

## 10. Rollout

1. Ship behind a flag on the current-address screen only; permanent address follows one week later.
2. Dual-write: components **and** the legacy `lineOne` / `lineTwo` strings, so downstream systems
   (KYC, card issuance, courier handoff) need no coordinated release.
3. Backfill is not required. Existing addresses keep their two-line form; only new captures are
   structured.
4. Phase 2: map pin-drop confirmation with a reverse-geocode cross-check against the entered
   pincode; >5 km mismatch raises a non-blocking "Is this the right area?".
