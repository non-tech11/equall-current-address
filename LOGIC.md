# Logic Spec — Address Capture

Companion to [PRD.md](PRD.md). Every rule has an ID for QA traceability. This document matches the
implementation in `src/address/addressValidation.js` exactly — if they diverge, the code is the bug.

---

## 1. Form state

```js
form = {
  pincode:   '',        // 6 digits, numeric only
  homeType:  '',        // 'FLAT' | 'INDEPENDENT'
  houseNo:   '',        // Apartment / House / Floor number
  building:  '',        // Apartment name
  locality:  '',        // Street / gali / colony
  area:      '',        // Area / village — free-form text
  landmark:  '',        // Landmark
  ownership: '',        // 'SELF_OWNED' | 'RENTED'
}

ctx = {                 // derived, not typed
  city:       '',       // from pincode master
  state:      '',       // from pincode master
  pinStatus:  'idle',   // idle | loading | done | not_found | error
}
```

`city` and `state` are never part of `form` — they cannot be edited, so they cannot be wrong in a way
the customer controls.

---

## 2. Requiredness matrix

Requiredness is **dynamic**. Three fields change state based on other fields.

| Field | Required when | Optional when |
|---|---|---|
| Pincode | always | — |
| Home type | always | — |
| House number | always | — |
| **Apartment name** | `homeType === 'FLAT'` **OR** `houseNo` matches `UNIT_TOKEN_RE` | otherwise |
| **Locality** | `landmark` is empty (<5 chars) | `landmark` has ≥5 chars |
| **Area** | always | — |
| **Landmark** | `locality` is empty (<3 chars) | `locality` has ≥3 chars |
| Ownership | always | — |

### Locality ⇄ Landmark: exactly-one-of

```
locality present  landmark present   verdict
     no                 no           BLOCK both (V-40, V-50)
     yes                no           OK  — urban address, no landmark needed
     no                 yes          OK  — village address, no street to name
     yes                yes          OK  — best case
```

This pair is what makes short rural addresses pass. `5-136, Saluchintala` has no street name; it
supplies a landmark instead and clears the gate.

### UNIT_TOKEN_RE — makes Apartment name mandatory

```js
/^(flat|f\.?\s?no|tf-?\d|gf|ff|sf|s-?\d|apt|apartment|unit|block|room|door)\b/i
```

Rationale from production data: `Flat no 102` / `M s ramayya` and `S1 Jayanthi embearled` prove that
when a customer starts with a unit token, the building identity is the missing piece.

---

## 3. Validation timing

| Trigger | What runs | What is displayed |
|---|---|---|
| Keystroke | nothing | nothing (never validate per keystroke — V-T1) |
| Field blur | all rules for that field, plus any field that depends on it | that field's error/warning only |
| Pincode = 6 digits | debounced 350ms master lookup | city/state chip |
| Continue pressed | every rule + the form-level gate | all field errors + red hint above the CTA + CTA in blocked state + focus first blocking field |
| Confirm pressed | nothing new | submit |

Errors are computed continuously but **shown** only when `touched[field] || continuePressed`. This is
why the form never flashes red while typing yet is fully validated at submit.

Dependency re-validation is automatic: the full rule set is recomputed from `(form, ctx)` on every
change, so editing `landmark` immediately clears `locality`'s error without extra wiring.

---

## 4. Rule catalogue

Severity: **B** = blocking (red, field + summary, prevents submit) · **N** = non-blocking (black,
field only).

### 4.1 Character set — applies to every text field

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-00 | B | contains a non-ASCII character after normalisation — Devanagari, Telugu, emoji | "Please type your address in English" |
| V-00b | B | contains a symbol outside the permissive ASCII set | "Remove special symbols from this field" |

Runs before every field-specific rule. Punctuation is deliberately permissive — `H.No: 830`,
`Plot 5 + 6`, `NEW_COLONY`, `S/o Ramesh` and `Flat 501 "A" wing` are all valid. Smart quotes and
dashes from mobile keyboards are normalised to ASCII first (S-05), never rejected. What remains
blocked is another script or emoji, and control
characters that break courier label printing.

### 4.2 Pincode

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-01 | B | empty | "Enter your 6-digit pincode" |
| V-02 | B | fails `/^[1-9]\d{5}$/` | "Enter a valid 6-digit pincode" |
| V-03 | B | `pinStatus === 'not_found'` | "We couldn't find this pincode — please check" |

Input is filtered to digits and capped at 6 on entry, so V-02 fires only on short input or a leading
zero. `pinStatus === 'error'` (network failure) is **not** blocking — see §6.

### 4.3 Area / Village

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-10 | B | trimmed length < 3 | "Enter your area or village" |
| V-11 | B | matches `/^[\d\W_]+$/` (digits/punctuation only) | "Enter a name, not only numbers" |
| V-12 | B | `norm(area) === norm(state)` | "Enter your area or village, not the state" |
| V-13 | B | length > 60 | "Keep this under 60 characters" |
| W-10 | N | `norm(area) === norm(city)` | "That is the city name — add your smaller area or village if it has one" |

**Why area == city is a warning, not a block:** the pincode master itself returns the city name as a
valid post-office name for some pincodes (e.g. `530041` → "Visakhapatnam"). Blocking would reject a
value that is genuinely correct. In small towns the area really is the town.

**Area is free-form.** Nothing is matched against the pincode master: village, colony and
extension names it does not carry are common, and a spelling nag on a correct value costs more than it saves.

### 4.4 Apartment / House / Floor number

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-20 | B | empty | "Enter your house / flat / door number" |
| V-21 | — | (removed — a house number is no longer required to contain a digit) | — |
| V-22 | B | `norm(v)` matches `PLACEHOLDER_RE` | "This doesn't look like a real house number" |
| V-23 | B | contains `/\b[1-9]\d{5}\b/` | "Remove the pincode from this field" |
| V-24 | B | length > 40 | "Too long — put the apartment name in the next field" |
| W-20 | N | length > 25 | "Long house number — the apartment name goes in the next field" |

```js
PLACEHOLDER_RE = /^(0|00|0\s?0|na|n\s?a|nil|none|null|x+|test|abcd?|asdf|same|home)$/
```

Sourced from real junk: `0-0, ramayalyam street` normalises to `0 0` and is caught by V-22.

V-21 (house number must contain a digit) has been removed. Even on its own field the rule fires on
`New Ashok Nagar` typed by someone whose house genuinely has no number, and on rural plots and
survey-number addresses. V-22's placeholder list still catches the junk values the rule was aimed at
(`0-0`, `NA`, `XX`), so blocking on a missing numeral bought nothing and cost real addresses.

Note the asymmetry with §8: a stray pincode is **stripped silently** from other fields but **blocks**
here, because silently deleting digits from a house number could produce a wrong-but-plausible value.

### 4.5 Apartment name

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-30 | B | required (§2) and length < 3 | "Enter the apartment or building name" |
| V-31 | B | required and digits/punctuation only | "Enter a name, not only numbers" |
| V-32 | B | length > 60 (required or not) | "Keep this under 60 characters" |

### 4.6 Locality (street, gali, colony)

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-40 | — | (removed — locality is optional; coverage gate blocks a thin address) | — |
| V-41 | B | non-empty and length < 3 | "Too short — add the street, gali or colony name" |
| V-42 | B | digits/punctuation only **and** no street word | "Enter a street or colony name, not only numbers" |
| V-43 | B | length > 60 | "Keep this under 60 characters" |

```js
STREET_WORD_RE = /\b(gali|galli|street|st|road|rd|lane|marg|sector|block|cross|colony|
                    nagar|puram|pet|peta|veedhi|vidhi|chowk|bazar|phase|pocket)\b/i
```

The street-word escape hatch exists so real values survive V-42: `Gali no 20`, `Street No 1`,
`Sec-3 Rohini`, `Road No-10`, `Chakali veedhi` are all digits-plus-a-street-word and must pass.

### 4.7 Landmark

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-50 | — | (removed — landmark is optional and never blocks on being empty) | — |
| V-51 | B | non-empty and length < 5 | "Too short — mention a shop, temple, school or office" |
| V-52 | B | length > 50 | "Keep this under 50 characters" |

### 4.8 Selects

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-60 | B | `homeType` unset | "Select your home type" |
| V-61 | B | `ownership` unset | "Select property ownership" |

### 4.9 Cross-field warnings

| ID | Sev | Condition | Message |
|---|---|---|---|
| W-70 | N | `norm(building)`, `norm(locality)` or `norm(landmark)` equals `norm(area)` | "Same as your area — is this correct?" |
| W-71 | N | `norm(building) === norm(locality)` | "Same as the apartment name — is this correct?" |
| W-72 | N | any non-pincode field contains a 6-digit pincode | "Pincode removed — it is already captured above" |

W-70 is the structural answer to `S1 Jayanthi embearled` / `Jayanthi embearled` and to the
`I 10 Ganga Ram Vatika Tilak nagar` / `Delhi` pattern: with components, duplication is a direct
string comparison instead of a heuristic over one blob.

### 4.10 Form-level gate

| ID | Sev | Condition | Message |
|---|---|---|---|
| V-70 | B | coverage score < 3 (§5) | "Your address needs more detail — add street, area or a landmark" |

---

## 5. Coverage score

```js
SCORE_MIN = {            // minimum length to earn the point
  houseNo:  2,
  building: 3,
  locality: 5,
  area:     4,
  landmark: 5,
}
score = count of fields where trim(value).length >= SCORE_MIN[field]   // 0..5
MIN_SCORE = 3
```

`pincode`, `homeType` and `ownership` are excluded — they are always mandatory, so including them
would inflate every score by a constant and measure nothing.

### Per-field minimums

A field that is filled but too short earns **no point**. Thresholds differ because the shortest
*real* value differs by field:

| Field | Min for credit | Shortest real values | A value below it |
|---|:-:|---|---|
| House / Floor no. | 2 | `L-20`, `303`, `2-137 l` | is a single character — no address has one |
| Apartment name | 3 | `S5`, `TF-6` blocks | is initials, unusable on a label |
| **Locality** | **5** | `Sec-3`, `MG Rd`, `Gali no 5` | carries no street a courier can find |
| **Area** | **4** | `Vapi`, `Ooty`, `Eluru` | is an abbreviation, not a place name |
| Landmark | 5 | `Near park` | is not a landmark |

| ID | Sev | Condition | Message |
|---|---|---|---|
| W-12 | N | `area` filled, length < 4 | "Add the full area or village name" |
| W-44 | N | `locality` filled, length < 5 | "Add more detail — the full street, gali or colony name" |
| W-45 | N | `houseNo` / `building` / `landmark` filled but under its minimum | "A bit more detail here strengthens your address" |

These are non-blocking, but they are shown **at the field**: without them the meter looks arbitrary —
the customer typed something, and the dot did not light up. Note the interaction with the blocking
rules: a 3-character locality clears V-41 (min 3) yet earns no point, so the honest reason it cannot
proceed is coverage, and W-44 says where to add detail.

### Blocked state overrides the score

| ID | Rule |
|---|---|
| M-01 | While any blocking error is **visible** (a touched field, or every field once Continue has been pressed), the meter renders red with "Incomplete — complete the fields marked in red", whatever the score says |
| M-03 | **Form-level-only block.** When the coverage gate fails but no field has an error, the CTA hint carries `errors._form` and the meter keeps its shorter score label — the same sentence never prints twice |
| M-02 | **Idle state.** Score 0 with nothing flagged yet (page just loaded) renders grey and neutral: "Fill in your address details to see how complete it is". No red on arrival |

M-02 exists because score 0 otherwise maps to "Too little detail" — greeting a customer with a red
verdict before they have typed a character reads as an accusation rather than guidance. The red state
is earned, not the default.

Reason: coverage can read 3/5 with a mandatory field still empty — apartment name + locality + area
and no house number. Showing "Okay — a landmark makes you easier to find" above a red House-number field contradicts itself.
The score still drives the dot count; only the tone and text are overridden.

| Score | Meter | Copy | Submit |
|---|---|---|---|
| 0 · nothing typed yet | ○○○○○ grey | "Fill in your address details to see how complete it is" | — (M-02) |
| 0–1 | ●○○○○ red | "Too little detail" | blocked (V-70) |
| 2 | ●●○○○ red | "Needs more detail" | blocked (V-70) |
| 3 | ●●●○○ amber | "Okay — a landmark makes you easier to find" | allowed |
| 4 | ●●●●○ green | "Good — clear and complete" | allowed |
| 5 | ●●●●● green | "Excellent — easy to find" | allowed |

**Why 3 is the right threshold.** Every legitimate address shape reaches it without padding, and no
vague address reaches it without real detail:

| Shape | Components present | Score |
|---|---|---|
| Village, no street | houseNo + area + landmark | 3 ✓ |
| Independent urban house | houseNo + locality + area | 3 ✓ |
| Flat / apartment | houseNo + building + area (+ locality or landmark) | 4 ✓ |
| House number + area only | houseNo + area | 2 ✗ |

The field-level rules and the score are deliberately redundant: V-40/V-50 already force a third
component, so V-70 is a backstop that also covers future field additions.

---

## 6. Pincode resolution — state machine

```
                 pincode changes
                       │
        ┌──────────────┴───────────────┐
   not 6 digits                  6 valid digits
        │                              │
      idle                    debounce 350ms
   (city/state blank,                  │
                                  loading  ──► shimmer on the city/state chip
                                       │
                    ┌──────────────────┼───────────────────┐
                  success          Status≠Success        network/5xx
                    │                  │                    │
                  done             not_found              error
          city/state shown     V-03 blocks           NOT blocking:
          (area is typed)      "check pincode"        "Couldn't check right now",
                                                     manual area entry still allowed
```

Rules:

- **P-01** In-flight requests are aborted when the pincode changes again (`AbortController`).
- **P-02** Resolved pincodes are cached for the session; re-entry is instant, no refetch.
- **P-03** Changing the pincode leaves `area` untouched — it is free-form and not derived from the
  pincode, so correcting a typo never wipes what the customer typed.
- **P-04** `error` (network) never hard-blocks: the customer can still type an area and submit. Only
  `not_found` (the master answered, and said no) blocks via V-03.
- **P-05** City/state show a shimmer while loading, never a blank flash or a stale value.

### Area list construction

From the master's post-office records: post-office names with `B.O` / `S.O` / `H.O` suffixes
stripped, plus each record's Block and Division (often the village name customers actually use),
deduplicated case-insensitively and sorted alphabetically.

---

## 7. Submit gate — decision table

```
on Continue:
  continuePressed = true
  recompute all rules
  if any blocking error:
      show every field-level error in red
      show "Complete the fields marked in red to continue" above the CTA
      render the CTA in its blocked state (aria-disabled, muted) — still tappable
      strength meter switches to its blocked state (M-01)
      scroll to + focus the first blocking field in FIELD_ORDER
      emit address_submit_blocked { fields, score, firstErrorField }
      STOP
  else:
      emit address_confirm_shown { score }
      open confirm sheet
        Edit    → close sheet, emit address_confirm_edit, return to form
        Confirm → emit address_submitted { meta }, call onSubmit(payload)
```

`FIELD_ORDER` = `pincode, area, houseNo, building, locality, landmark, homeType, ownership` — the
order the summary lists errors in and the order the first-error focus follows.

Blocking is expressed **on the CTA**, not in a top-of-page summary banner (FR-22). The button reads as
unavailable but stays tappable: tapping it again re-scrolls to the offending field, so the customer is
never left with a dead control and no explanation.

---

## 8. Sanitisation pipeline (on blur)

| Step | Applies to | Transform |
|---|---|---|
| S-01 | all text fields | collapse runs of whitespace to one space |
| S-02 | all text fields | strip leading/trailing whitespace, commas, dots, hyphens |
| S-03 | building, locality, area, landmark | remove any `\b[1-9]\d{5}\b` (stray pincode), then re-run S-01/S-02 |
| S-05 | all text | smart quotes/dashes (`’ “ ” – —`) → ASCII, before any rule runs |
| S-04 | houseNo | S-01 + S-02 only — a stray pincode **blocks** via V-23 instead of being deleted |

S-03 is what neutralises `WZ-476 SHAKURPUR VILLAGE Saraswati Vihar North West Delhi India 110034`:
the pincode is removed and W-72 tells the customer why.

---

## 9. Delivery-label assembly

Input `(form, ctx)` → ordered lines, blanks omitted:

```
line 1:  [houseNo, building]  joined ", "
line 2:  locality
line 3:  landmark             prefixed "Near " unless it already starts with
                              near|behind|beside|opp|opposite|next|in front|front of|above|below
line 4:  [area, city]         joined ", "
line 5:  [state, pincode]     joined " – "
```

Example:

```
Flat 501, NVV Golden Classic
Srinivasa Nagar Road
Near Mahathi School
Pothinamallayapalem, Visakhapatnam
Andhra Pradesh – 530041
```

The prefix check prevents "Near Behind DRM office" — real data contains `Behind drm office`,
`Back side of brahmmam temple`, `Front Of Shive Mandir`.

---

## 10. Output payload

```jsonc
{
  "houseNo": "Flat 501",
  "buildingName": "NVV Golden Classic",
  "locality": "Srinivasa Nagar Road",
  "area": "Pothinamallayapalem",
  "landmark": "Near Mahathi School",
  "city": "Visakhapatnam",          // from master, not typed
  "state": "Andhra Pradesh",        // from master, not typed
  "pincode": "530041",
  "homeType": "FLAT",
  "residenceType": "RENTED",

  "lineOne": "Flat 501, NVV Golden Classic",                   // legacy dual-write
  "lineTwo": "Srinivasa Nagar Road, Pothinamallayapalem",      // legacy dual-write

  "meta": {
    "addressScore": 5,
    "houseNoSignal": "keyword",
    "buildingWasRequired": true
  }
}
```

### Legacy mapping

| Legacy field | Built from |
|---|---|
| `lineOne` | `houseNo` + `building`, joined ", " |
| `lineTwo` | `locality` + `area`, joined ", " |

Landmark has no legacy home — it must be sent as its own field, or it is lost. Open question Q3 in
the PRD covers downstream length caps on these two strings.

### houseNoSignal classification

Evaluated top to bottom, first match wins. Mirrors the `signal` column of the analysis sheet.

| Value | Test | Real example |
|---|---|---|
| `keyword` | starts with `h.no`/`hno`/`d.no`/`dno`/`door`/`flat`/`plot`/`house`/`room`/`shop`/`qtr`/`quarter`/`block` | `H.No 830`, `Flat no 102` |
| `slash` | `/\d+\s?[-/]\s?\d/` | `9-208-1`, `76-97-270-18`, `B-5/246-247` |
| `alnum` | `/^[a-z]{1,3}[\s-]?\d/i` | `RZ 66`, `WZ-125 A`, `C-76` |
| `no_prefix` | contains any digit | `303`, `22-199/1` |
| `none` | no digit | accepted — named or survey-number houses |

---

## 11. Edge cases

| ID | Case | Behaviour |
|---|---|---|
| E-01 | Pincode master has no area for a real village | Irrelevant — area is free-form, nothing is checked against the master |
| E-02 | Pincode API down | `pinStatus: error`; city/state blank; manual area allowed; submit **not** blocked (P-04) |
| E-03 | Customer edits pincode after filling area | Area kept; only city/state re-resolve (P-03) |
| E-04 | Area list's only entry is the city name | Allowed; W-10 nudge only |
| E-05 | House genuinely has no number (rural plot) | Accepted — V-21 removed. The customer types the door / survey / plot identifier the courier uses, digit or not; V-22 still blocks placeholder junk |
| E-06 | Landmark typed into Locality | Passes V-42 if it has a street word, else blocked. Not further policed — both fields print on the label anyway |
| E-07 | Same value in Locality and Area | W-70 warning, submits |
| E-08 | Flat with no society name (small building) | V-30 blocks if home type = Flat. Escape: pick Independent house, or put the owner/building identifier in Apartment name |
| E-09 | Pincode pasted into Locality/Area/Landmark | Silently stripped (S-03) + W-72 explains |
| E-10 | Pincode pasted into House number | Blocked by V-23, never auto-edited (S-04) |
| E-11 | Non-Latin script or emoji | V-00 blocks; punctuation never does |
| E-12 | Autofill fills every field at once | All rules run at Continue; area accepted as typed |
| E-13 | `Same as current` on Permanent address | Copies components; toggling off leaves values editable (FR-40/41) |
| E-14 | Score 3 but all short values | Allowed by design — `9-208-1` + `Bahadurpet` + landmark is a real, deliverable address |

---

## 12. Test cases

Drawn from real rows in the `1_complete` bucket, re-expressed as components. `✓` = submits.

### Must pass (regressions the old length rules caused)

| # | pincode | houseNo | building | locality | area | landmark | homeType | Score | Expect |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | 517644 | `9-208-1` | — | — | `Bahadurpet` | `Near bus stop` | INDEPENDENT | 3 | ✓ |
| T-02 | 518001 | `2-137 l` | — | — | `Pedda Pada Khana` | `Near panchayat office` | INDEPENDENT | 3 | ✓ |
| T-03 | 524126 | `222-54-678` | — | `Chakali veedhi` | `Naidupeta` | — | INDEPENDENT | 3 | ✓ |
| T-04 | 531011 | `Flat no-409` | `Sai Residency` | — | `Atchuthapuram` | — | FLAT | 3 | ✓ |
| T-05 | 110085 | `B-5/246-247` | — | `Sec-3` | `Rohini` | — | INDEPENDENT | 3 | ✓ |
| T-06 | 530041 | `Flat 501` | `NVV Golden Classic` | `Srinivasa Nagar Rd` | `Pothinamallayapalem` | `Near Mahathi School` | FLAT | 5 | ✓ |
| T-07 | 110044 | `H.No 830` | — | `Gali No 4` | `Mithapur Extension` | — | INDEPENDENT | 3 | ✓ |
| T-08 | 530004 | `Hc-4/L` | — | `Harbour colony` | `Visakhapatnam` | `Behind DRM office` | INDEPENDENT | 4 | ✓ + W-10 |

### Must block

| # | Input | Rule | Expected message |
|---|---|---|---|
| T-20 | houseNo `0-0` | V-22 | "This doesn't look like a real house number" |
| T-21 | houseNo `New Ashok Nagar` | — | accepted (V-21 removed) |
| T-22 | houseNo empty | V-20 | "Enter your house / flat / door number" |
| T-23 | locality empty + landmark empty | coverage gate | "Your address needs more detail — add street, area or a landmark" |
| T-24 | area `Delhi`, state `DELHI` | V-12 | "Enter your area or village, not the state" |
| T-25 | area `110025` | V-11 | "Enter a name, not only numbers" |
| T-26 | homeType `FLAT`, building empty | V-30 | "Enter the apartment or building name" |
| T-27 | houseNo `Flat 501`, homeType `INDEPENDENT`, building empty | V-30 via UNIT_TOKEN_RE | "Enter the apartment or building name" |
| T-28 | houseNo `530041 Flat 2` | V-23 | "Remove the pincode from this field" |
| T-29 | pincode `53004` | V-02 | "Enter a valid 6-digit pincode" |
| T-30 | pincode `999999` (master says no) | V-03 | "We couldn't find this pincode — please check" |
| T-31 | houseNo + area only, both filled | V-70 (score 2) | "Your address needs more detail…" |
| T-32 | landmark `Near` (4 chars), locality empty | V-51 | "Too short — mention a shop, temple, school or office" |
| T-33 | locality `विनोद नगर` | V-00 | "Please type your address in English" |
| T-35 | houseNo `H.No: 830`, locality `Sector-5 – Phase 2`, building `Rao’s Nilayam` | — | all valid; smart `–` and `’` normalised to ASCII on blur |
| T-34 | ownership unset | V-61 | "Select property ownership" |

### Must warn, not block

| # | Input | Rule | Expected |
|---|---|---|---|
| T-40 | area = city (`Visakhapatnam`) | W-10 | black hint, submits |
| T-41 | locality `Jayanthi embearled`, area `Jayanthi embearled` | W-70 | black hint, submits |
| T-44 | locality `Naraina Village 110028` | W-72 + S-03 | pincode stripped on blur, hint shown, submits |
| T-45 | houseNo `13-59/1/2, FF 101, 3rd Floor` (28 chars) | W-20 | black hint, submits |

### Behavioural

| # | Case | Expected |
|---|---|---|
| T-60 | Type into any field, do not blur | no error shown (V-T1) |
| T-61 | Press Continue on an empty form | red summary lists all blocking items; focus lands on Pincode |
| T-62 | Change pincode after filling area | area preserved, city/state re-resolve (P-03) |
| T-63 | Kill the network, enter a valid pincode | "Couldn't check right now"; manual area entry works; submit allowed (P-04) |
| T-64 | Enter pincode, then re-enter the same one | resolves from cache, no second request (P-02) |
| T-65 | Type a pincode fast, digit by digit | at most one request fires (350ms debounce, prior aborted — P-01) |
| T-67 | Screen reader on a blocking field | error announced via `role="alert"`; `aria-invalid` set |
