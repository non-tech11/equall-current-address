# Current Address Screen — PRD & Logic

**Owner:** Anshul · **Status:** proposed · **Date:** 13 Aug 2026 · **Surfaces:** Onboarding → Current
address, Permanent address · **Live prototype:** `/current_address`

---

# PART A — PRD (2 pages)

## A1. Problem

Customers submit addresses too short to deliver to. The current defence — minimum character and word
counts over two free-text lines — fails in both directions.

**It blocks real addresses.** From the address-quality sheet's `1_complete` bucket (rows the system
already rates *strong signal, no action needed*):

| line_one | line_two | words | chars | Current rule |
|---|---|---|---|---|
| `2-137 l` | `Pedda Pada Khana` | 5 | 23 | passes — 3 characters above the blocking threshold |
| `222-54-678` | `Chakali veedhi naidupeta` | 4 | 35 | "looks incomplete" |
| `5-136, Saluchintala` | `Saluchintala` | 3 | 32 | "looks incomplete" |
| `Flat no-409` | `Atchuthapuram` | 3 | 25 | "looks incomplete" |

**It passes junk.** Same bucket:

| Defect | Real value |
|---|---|
| Placeholder house number | `0-0, ramayalyam street` |
| Line 2 duplicates line 1 | `S1 Jayanthi embearled` / `Jayanthi embearled` |
| Line 2 is the city | `I 10 Ganga Ram Vatika Tilak nagar` / `Delhi` |
| Pincode + country in line 1 | `WZ-476 … North West Delhi India 110034` / `SRINAGAR` |

Andhra Pradesh door-number addresses are short and complete; Delhi addresses are long. **Length
measures region, not quality.** And a single free-text blob cannot be checked component by component,
so length is the only signal available.

## A2. Solution in one line

Capture the address as **structured components**, derive city and state from the **pincode**, and gate
submission on **how many components are present** — never on character count.

## A3. Goals

| | |
|---|---|
| G1 | No submission without a house / flat / floor number |
| G2 | No submission without locality-or-landmark level detail |
| G3 | Area captured as its own dedicated field, never mixed into a free-text line |
| G4 | Short-but-complete rural addresses submit with no friction |
| G5 | Address-step drop-off does not increase |

**Out of scope:** backfill of existing addresses · map pin-drop (phase 2) · courier serviceability
check · non-India addresses · OCR autofill.

## A4. The page

| # | Field | Required | Max | Behaviour |
|---|---|---|---|---|
| 1 | **Pincode** | Yes | 6 | First field. Resolves city and state |
| 2 | City, State | auto | — | Read-only, never typed |
| 3 | **Home type** — Flat/Apartment · Independent house | Yes | — | Decides whether #5 is mandatory |
| 4 | **Apartment / House / Floor number** | Yes | 40 | Must contain a digit |
| 5 | **Apartment name** | Conditional | 60 | Mandatory for flats, or when #4 starts with a unit token |
| 6 | **Locality** (street, gali, colony) | Conditional | 60 | Mandatory unless a Landmark is given |
| 7 | **Area / Village** | Yes | 60 | **Free-form text.** No matching against any list — village and colony names are too varied to gate on |
| 8 | **Landmark** | Conditional | 50 | Mandatory when Locality is empty; otherwise optional and nudged |
| 9 | **Property ownership** — Self-Owned · Rented | Yes | — | Unchanged from today |

Why it works where free text could not:

- Area is its own field ⇒ the city can no longer land where the area belongs, and the value is free-form so no village is ever a dead end.
- House number has its own field ⇒ "must contain a digit" is unambiguous and safe to block on.
- Locality **or** Landmark ⇒ villages with no street pass via landmark; cities with no landmark pass
  via street. Neither population is blocked, and no field is left silently empty.
- Duplicate detection is a string comparison between fields, not a heuristic over one blob.

## A5. Validation model

Two severities, matching the existing convention: **blocking = red** (field level + the CTA),
**non-blocking = black** (field level only).

Two independent gates, both of which must pass:

- **Gate A — field rules.** Digit in the house number, placeholder blocklist, locality-or-landmark,
  character set, selects chosen, per-field lengths.
- **Gate B — coverage score ≥ 3.** Catches *missing* content that no single field rule names.

Interaction rules that protect the funnel:

1. Validate on blur, never per keystroke.
2. Blocking shows **on the Continue CTA** — red hint plus a muted, `aria-disabled` button — with no
   top-of-page summary banner. The CTA stays tappable so it re-points at the offending field.
3. The strength meter turns red whenever a blocking error is visible, whatever the score says.
4. Before submit, a sheet shows the assembled **delivery label** exactly as the courier will read it.

## A6. Metrics

| | Metric | Target |
|---|---|---|
| M1 | Submissions with score ≥4 | ≥75% within 30 days |
| M2 | RTO / failed delivery on new captures | ↓ vs 30-day baseline |
| M3 | Address-edit support tickets per 1,000 onboardings | ↓ |
| M4 | Address-step completion (guardrail) | ≥ pre-launch |

## A7. Risks

| | Risk | Mitigation |
|---|---|---|
| R1 | More fields ⇒ drop-off | Blur-only validation; strength meter as progress; M4 as launch guardrail |
| R2 | Master missing a village | Area is free-form text — there is no list to be absent from |
| R3 | City master wrong: `110025 → BUDAUN` with state `DELHI` (3 production rows) | Fix rows before enabling the flag |
| R4 | Public pincode API ≠ production data (`517644` → *Chittoor* vs *Tirupati*) | Point at the internal master before launch |
| R5 | Pincode API latency / outage | Cache; network failure never blocks submission |
| R6 | Placeholder blocklist too narrow | Extend once the failing analysis buckets are reviewed |

## A8. Rollout

Baselines → fix R3/R4 → flag on Current address at 10% / 50% / 100% watching M4 → Permanent address a
week later → dual-write `lineOne`/`lineTwo` throughout, no backfill → phase 2 adds map pin-drop with a
reverse-geocode cross-check.

**Decisions needed:** which internal endpoint serves pincode → city/state (blocking); downstream length
caps on `lineOne`/`lineTwo` (blocking).

---
---

# PART B — Logic

Rule IDs are stable and match `src/address/addressValidation.js`. If code and this document disagree,
the code is the bug.

## B1. Address strength — the full logic

### B1.1 What it measures

Coverage of components. Never text volume.

```js
SCORE_MIN = {          // minimum characters to earn the point
  houseNo:  2,
  building: 3,
  locality: 5,
  area:     4,
  landmark: 5,
}

score = count of fields where trim(value).length >= SCORE_MIN[field]   // 0..5
MIN_SCORE = 3                                                          // below this, submission blocks
```

### B1.2 Which fields count, and why the others don't

| Field | Counts | Reason |
|---|:-:|---|
| House / Floor no. | ✅ | variable component |
| Apartment name | ✅ | variable component |
| Locality | ✅ | variable component |
| Area | ✅ | variable component |
| Landmark | ✅ | variable component |
| Pincode | ❌ | always mandatory — a constant in every score measures nothing |
| Home type | ❌ | always mandatory, not part of the delivery label |
| Ownership | ❌ | credit attribute, not an address component |

### B1.3 Per-field minimum length

A filled-but-short field earns **no point**. Thresholds differ because the shortest *real* value
differs by field:

| Field | Min | Shortest real values | What falls below |
|---|:-:|---|---|
| House / Floor no. | 2 | `L-20`, `303`, `2-137 l` | a single character |
| Apartment name | 3 | `S5`, `TF-6` | initials |
| **Locality** | **5** | `Sec-3`, `MG Rd`, `Gali no 5` | no findable street |
| **Area** | **4** | `Vapi`, `Ooty`, `Eluru` | an abbreviation, not a place |
| Landmark | 5 | `Near park` | not a landmark |

Each under-length field shows a black hint, so the meter is never mysterious:

| ID | Condition | Message |
|---|---|---|
| W-12 | `area` filled, <4 chars | "Add the full area or village name" |
| W-44 | `locality` filled, <5 chars | "Add more detail — the full street, gali or colony name" |
| W-45 | `houseNo` / `building` / `landmark` filled but under minimum | "A bit more detail here strengthens your address" |

### B1.4 Score → display → gate

| Score | Meter | Copy | Submit |
|---|---|---|---|
| 0 · nothing typed yet | ○○○○○ grey | "Fill in your address details to see how complete it is" | — (M-02) |
| 0–1 | ●○○○○ red | "Too little detail" | blocked (V-70) |
| 2 | ●●○○○ red | "Needs more detail" | blocked (V-70) |
| 3 | ●●●○○ amber | "Okay — a landmark makes you easier to find" | allowed |
| 4 | ●●●●○ green | "Good — clear and complete" | allowed |
| 5 | ●●●●● green | "Excellent — easy to find" | allowed |

The meter updates **live on keystroke** — unlike errors, which wait for blur. Progress feedback pulls
detail out of people; red while typing pushes them out of the funnel.

### B1.5 Blocked state overrides the label

| ID | Rule |
|---|---|
| M-01 | While any blocking error is *visible* (a touched field, or all fields once Continue was pressed), the meter renders red with "Incomplete — complete the fields marked in red", regardless of score. Dot count still follows the score |
| M-03 | **Form-level-only block.** When the coverage gate fails but no field has an error, the CTA hint carries `errors._form` and the meter keeps its shorter score label — the same sentence never prints twice |
| M-02 | **Idle state.** Score 0 with nothing flagged yet — i.e. the customer has just landed — renders grey and neutral: "Fill in your address details to see how complete it is". Never red on arrival |

Without M-01 the meter contradicts itself: apartment name + locality + area with **no house number**
scores 3 and would read as fine directly above a red House-number field.

### B1.6 Why the threshold is 3

| Shape | Components naturally present | Score |
|---|---|---|
| Village, no street name | house no + area + landmark | 3 ✓ |
| Independent urban house | house no + locality + area | 3 ✓ |
| Flat / apartment | house no + apartment name + area + (locality or landmark) | 4 ✓ |
| Vague — `303, Uttam Nagar` | house no + area | 2 ✗ |

Not 4: a village address genuinely has no building name and no street name — 4 would block exactly the
population the old rule already wrongly blocked. Not 2: house no + area *is* the vague case.

### B1.7 Worked examples (real rows)

| Address as components | Score | Verdict |
|---|:-:|---|
| `9-208-1` · — · — · `Bahadurpet` · `Near bus stop` | 3 | passes (old rule blocked it) |
| `Flat 501` · `NVV Golden Classic` · `Srinivasa Nagar Rd` · `Pothinamallayapalem` · `Near Mahathi School` | 5 | passes |
| `H.No 830` · — · `Gali No 4` · `Mithapur Extn` · — | 3 | passes |
| `303` · — · `Main` · `CVR` · `Near park` | 2 | blocked — `Main` (4) and `CVR` (3) under minimum |
| `0-0` · — · `ramayalyam street` · `Pedapariya` · — | 3 | blocked anyway by V-22 (placeholder) |

### B1.8 What strength does not claim

Not correctness — `Flat 501, Fake Society, Nowhere` scores 5; correctness comes from the master-backed
area and the human check on the confirm sheet. Not length. Not courier serviceability.

## B2. Requiredness matrix

| Field | Required when | Optional when |
|---|---|---|
| Pincode, Home type, House no., Area, Ownership | always | — |
| **Apartment name** | `homeType === 'FLAT'` **or** `houseNo` matches `UNIT_TOKEN_RE` | otherwise |
| **Locality** | `landmark` <5 chars | `landmark` ≥5 chars |
| **Landmark** | `locality` <3 chars | `locality` ≥3 chars |

```js
UNIT_TOKEN_RE = /^(flat|f\.?\s?no|tf-?\d|gf|ff|sf|s-?\d|apt|apartment|unit|block|room|door)\b/i
```

Locality ⇄ Landmark truth table:

```
locality  landmark   verdict
  no        no       BLOCK both (V-40, V-50)
  yes       no       OK — urban address
  no        yes      OK — village address, no street to name
  yes       yes      OK — best case
```

## B3. Rule catalogue

**B** = blocking (red, prevents submit) · **N** = non-blocking (black, informational).

| ID | Field | Sev | Condition | Message |
|---|---|---|---|---|
| V-00 | any text | B | non-ASCII after normalisation (other script, emoji) | "Please type your address in English" |
| V-00b | any text | B | symbol outside the permissive ASCII set | "Remove special symbols from this field" |
| V-01 | pincode | B | empty | "Enter your 6-digit pincode" |
| V-02 | pincode | B | fails `/^[1-9]\d{5}$/` | "Enter a valid 6-digit pincode" |
| V-03 | pincode | B | master says not found | "We couldn't find this pincode — please check" |
| V-10 | area | B | <3 chars | "Enter your area or village" |
| V-11 | area | B | digits/punctuation only | "Enter a name, not only numbers" |
| V-12 | area | B | equals the state name | "Enter your area or village, not the state" |
| V-13 | area | B | >60 chars | "Keep this under 60 characters" |
| W-10 | area | N | equals the city name | "That is the city name — add your smaller area or village if it has one" |
| V-20 | houseNo | B | empty | "Enter your house / flat / door number" |
| V-21 | houseNo | B | contains no digit | "House number must include a digit" |
| V-22 | houseNo | B | matches `PLACEHOLDER_RE` | "This doesn't look like a real house number" |
| V-23 | houseNo | B | contains a 6-digit pincode | "Remove the pincode from this field" |
| V-24 | houseNo | B | >40 chars | "Too long — put the apartment name in the next field" |
| W-20 | houseNo | N | >25 chars | "Long house number — the apartment name goes in the next field" |
| V-30 | building | B | required and <3 chars | "Enter the apartment or building name" |
| V-31 | building | B | required and digits only | "Enter a name, not only numbers" |
| V-32 | building | B | >60 chars | "Keep this under 60 characters" |
| V-40 | locality | B | empty | "Enter street / gali / colony" |
| V-41 | locality | B | non-empty and <3 chars | "Too short — add the street, gali or colony name" |
| V-42 | locality | B | digits only and no street word | "Enter a street or colony name, not only numbers" |
| V-43 | locality | B | >60 chars | "Keep this under 60 characters" |
| V-50 | landmark | — | (removed — landmark is optional and never blocks on being empty) | — |
| V-51 | landmark | B | non-empty and <5 chars | "Too short — mention a shop, temple, school or office" |
| V-52 | landmark | B | >50 chars | "Keep this under 50 characters" |
| V-60 | homeType | B | unset | "Select your home type" |
| V-61 | ownership | B | unset | "Select property ownership" |
| W-70 | building/locality/landmark | N | equals the area value | "Same as your area — is this correct?" |
| W-71 | locality | N | equals the apartment name | "Same as the apartment name — is this correct?" |
| W-72 | any non-pincode | N | contains a 6-digit pincode | "Pincode removed — it is already captured above" |
| V-70 | form | B | coverage score <3 | "Your address needs more detail — add street, area or a landmark" |
| W-12 / W-44 / W-45 | area / locality / others | N | under the score minimum (B1.3) | see B1.3 |

```js
PLACEHOLDER_RE = /^(0|00|0\s?0|na|n\s?a|nil|none|null|x+|test|abcd?|asdf|same|home)$/
STREET_WORD_RE = /\b(gali|galli|street|st|road|rd|lane|marg|sector|block|cross|colony|nagar|
                    puram|pet|peta|veedhi|vidhi|chowk|bazar|phase|pocket)\b/i
```

`STREET_WORD_RE` is the escape hatch that keeps real values alive under V-42: `Gali no 20`,
`Street No 1`, `Sec-3 Rohini`, `Road No-10`, `Chakali veedhi`.

V-21 is the most important rule on the page — the old sheet's non-blocking prompt, promoted to
blocking. It is only safe to block *because* the house number now has its own field.

## B4. Validation timing

| Trigger | Runs | Displays |
|---|---|---|
| Keystroke | strength score only | meter |
| Blur | that field's rules + dependents | that field's error or hint |
| Pincode reaches 6 digits | debounced 350ms lookup | city/state chip |
| Continue | everything + the form gate | all field errors, CTA hint + blocked CTA, blocked meter, focus first error |
| Confirm | nothing new | submit |

Errors are computed continuously but shown only when `touched[field] || continuePressed`. The full
rule set recomputes from `(form, ctx)` on every change, so filling `landmark` instantly clears
`locality`'s error with no extra wiring.

## B5. Pincode resolution

```
not 6 digits → idle            (city/state blank)
6 valid digits → debounce 350ms → loading (shimmer on the city/state chip)
   ├── success            → done       city + state shown
   ├── master says no     → not_found  V-03 blocks
   └── network / 5xx      → error      NOT blocking: manual area entry, submit allowed
```

| ID | Rule |
|---|---|
| P-01 | In-flight requests aborted when the pincode changes (`AbortController`) |
| P-02 | Resolved pincodes cached for the session — re-entry is instant |
| P-03 | Changing the pincode leaves `area` untouched — it is free-form, so fixing a pincode typo never wipes it |
| P-04 | Network `error` never hard-blocks; only `not_found` blocks (V-03) |
| P-05 | Shimmer while loading — never a blank flash or a stale city |

Area list = master post-office names with `B.O`/`S.O`/`H.O` suffixes stripped, plus each record's Block
and Division (often the village name customers actually use), deduped case-insensitively, sorted.

Area is free-form — nothing is matched against the master, so there is no source to record and
no list to fall out of.

## B6. Submit gate

```
on Continue:
  recompute all rules
  if any blocking error:
      red error on every failing field
      "Complete the fields marked in red to continue" above the CTA
      CTA → blocked state (muted, aria-disabled, still tappable)
      meter → blocked state (M-01)
      scroll to + focus the first blocking field in FIELD_ORDER
      emit address_submit_blocked { fields, score, firstErrorField }
  else:
      emit address_confirm_shown { score }
      open the confirm sheet
        Edit    → back to form (address_confirm_edit)
        Confirm → address_submitted { meta } → onSubmit(payload)
```

`FIELD_ORDER = pincode, area, houseNo, building, locality, landmark, homeType, ownership` — drives both
the focus order and the error ordering.

## B7. Sanitisation (on blur)

| ID | Applies to | Transform |
|---|---|---|
| S-01 | all text | collapse whitespace runs to one space |
| S-02 | all text | strip leading/trailing whitespace, commas, dots, hyphens |
| S-03 | building, locality, area, landmark | remove `\b[1-9]\d{5}\b`, then re-run S-01/S-02 |
| S-05 | all text | smart quotes/dashes (`’ “ ” – —`) → ASCII, before any rule runs |
| S-04 | houseNo | S-01 + S-02 only — a stray pincode **blocks** (V-23) instead of being deleted |

S-03 neutralises `WZ-476 SHAKURPUR VILLAGE Saraswati Vihar North West Delhi India 110034`; W-72
explains what happened. The asymmetry in S-04 is deliberate: silently deleting digits from a house
number could produce a wrong-but-plausible value.

## B8. Delivery label

```
line 1:  [houseNo, building]   joined ", "
line 2:  locality
line 3:  landmark              prefixed "Near " unless it already starts with
                               near|behind|beside|opp|opposite|next|in front|front of|above|below
line 4:  [area, city]          joined ", "
line 5:  [state, pincode]      joined " – "
```

The prefix check prevents "Near Behind DRM office" — real data contains `Behind drm office`,
`Back side of brahmmam temple`, `Front Of Shive Mandir`.

## B9. Payload

```jsonc
{
  "houseNo": "Flat 501", "buildingName": "NVV Golden Classic",
  "locality": "Srinivasa Nagar Road", "area": "Pothinamallayapalem",
  "landmark": "Near Mahathi School",
  "city": "Visakhapatnam", "state": "Andhra Pradesh", "pincode": "530041",
  "homeType": "FLAT", "residenceType": "RENTED",

  "lineOne": "Flat 501, NVV Golden Classic",                  // legacy dual-write
  "lineTwo": "Srinivasa Nagar Road, Pothinamallayapalem",     // legacy dual-write

  "meta": { "addressScore": 5, "houseNoSignal": "keyword",
}
```

`meta.houseNoSignal` reuses the analysis sheet's `signal` taxonomy — first match wins:

| Value | Test | Example |
|---|---|---|
| `keyword` | starts with `h.no`/`d.no`/`door`/`flat`/`plot`/`house`/`room`/`shop`/`qtr`/`block` | `H.No 830` |
| `slash` | `/\d+\s?[-/]\s?\d/` | `9-208-1`, `B-5/246-247` |
| `alnum` | `/^[a-z]{1,3}[\s-]?\d/i` | `RZ 66`, `C-76` |
| `no_prefix` | contains any digit | `303` |
| `none` | no digit | blocked by V-21 |

Landmark has no legacy home — send it as its own field or it is lost.

## B10. Edge cases

| ID | Case | Behaviour |
|---|---|---|
| E-01 | Master has no area for a real village | Irrelevant — area is free-form, nothing is checked against the master |
| E-02 | Pincode API down | Manual area entry; submit allowed (P-04) |
| E-03 | Pincode edited after area filled | Area kept; only city/state re-resolve (P-03) |
| E-04 | Only master entry is the city name | Allowed; W-10 nudge |
| E-05 | House genuinely has no number | Blocked by V-21 — deliberate; monitor `address_field_error` volume on V-21 by pincode in week 1 |
| E-06 | Landmark typed into Locality | Passes if it has a street word; both print on the label anyway |
| E-07 | Locality = Area | W-70, submits |
| E-08 | Flat with no society name | V-30 blocks; escape is Independent house |
| E-09 | Pincode pasted into Locality/Area/Landmark | Stripped (S-03) + W-72 |
| E-10 | Pincode pasted into House number | Blocked (V-23), never auto-edited |
| E-11 | Non-Latin script or emoji | V-00 blocks; punctuation never does |
| E-12 | Autofill fills everything at once | Rules run at Continue; area accepted as typed |
| E-13 | `Same as current` on Permanent address | Copies components; editable after toggling off |
| E-14 | Score 3 with all-short values | Allowed by design — a real village address |

## B11. Test cases

### Must pass

| # | pincode | houseNo | building | locality | area | landmark | Score |
|---|---|---|---|---|---|---|:-:|
| T-01 | 517644 | `9-208-1` | — | — | `Bahadurpet` | `Near bus stop` | 3 |
| T-02 | 518001 | `2-137 l` | — | — | `Pedda Pada Khana` | `Near panchayat office` | 3 |
| T-03 | 524126 | `222-54-678` | — | `Chakali veedhi` | `Naidupeta` | — | 3 |
| T-04 | 531011 | `Flat no-409` | `Sai Residency` | — | `Atchuthapuram` | — | 3 |
| T-05 | 110085 | `B-5/246-247` | — | `Sec-3 Rohini` | `Rohini` | — | 3 |
| T-06 | 530041 | `Flat 501` | `NVV Golden Classic` | `Srinivasa Nagar Rd` | `Pothinamallayapalem` | `Near Mahathi School` | 5 |
| T-07 | 110044 | `H.No 830` | — | `Gali No 4` | `Mithapur Extension` | — | 3 |

### Must block

| # | Input | Rule |
|---|---|---|
| T-20 | houseNo `0-0` | V-22 |
| T-21 | houseNo `New Ashok Nagar` | V-21 |
| T-22 | houseNo empty (all else filled) | V-20 + S-01 on the meter |
| T-23 | locality empty + landmark empty | V-40 + V-50 |
| T-24 | area `Delhi` with state `DELHI` | V-12 |
| T-25 | area `110025` | V-11 |
| T-26 | homeType `FLAT`, building empty | V-30 |
| T-27 | houseNo `Flat 501`, homeType `INDEPENDENT`, building empty | V-30 via UNIT_TOKEN_RE |
| T-28 | houseNo `530041 Flat 2` | V-23 |
| T-29 | pincode `53004` | V-02 |
| T-31 | houseNo `303`, locality `Main`, area `CVR` | V-70 (score 2 — both under minimum) + W-44 + W-12 |
| T-33 | locality in Devanagari, or emoji anywhere | V-00 |
| T-35 | `H.No: 830` · `Plot 5 + 6` · `NEW_COLONY` · `Rao’s Nilayam` · `Sector-5 – Phase 2` | **none — all valid.** Smart `’` and `–` normalised to ASCII on blur (S-05) |
| T-35 | `H.No: 830` · `Plot 5 + 6` · `Rao’s Nilayam` · `Sector-5 – Phase 2` | none — all valid, smart punctuation normalised |
| T-34 | ownership unset | V-61 |

### Must warn only

| # | Input | Rule |
|---|---|---|
| T-40 | area = city | W-10 |
| T-41 | locality = area | W-70 |
| T-44 | locality `Naraina Village 110028` | W-72 + S-03 |
| T-45 | houseNo `13-59/1/2, FF 101, 3rd Floor` | W-20 |

### Behavioural

| # | Case | Expected |
|---|---|---|
| T-60 | Type without blurring | no error shown; meter still updates |
| T-61 | Continue on an empty form | every field red, CTA blocked + hint, focus on Pincode, **no summary banner** |
| T-62 | Change pincode after filling area | area preserved, city/state re-resolve |
| T-63 | Network killed, valid pincode | "Couldn't check right now"; manual area; submit allowed |
| T-64 | Re-enter the same pincode | served from cache, no second request |
| T-65 | Type a pincode digit by digit | at most one request (350ms debounce, prior aborted) |
| T-67 | Screen reader on a blocking field | announced via `role="alert"`, `aria-invalid` set |
