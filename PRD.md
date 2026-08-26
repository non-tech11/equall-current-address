# PRD — Address Capture Redesign (Current & Permanent Address)

| | |
|---|---|
| **Owner** | Anshul (LTCV Credit / Equall) |
| **Status** | Proposed — awaiting sign-off |
| **Date** | 13 Aug 2026 |
| **Surfaces** | Onboarding → Current address, Permanent address |
| **Reference build** | `src/address/` in this repo (working, browser-verified) |
| **Logic spec** | [LOGIC.md](LOGIC.md) — rule IDs, decision tables, test cases |
| **Design notes** | [SPEC.md](SPEC.md) |

---

## 1. TL;DR

Customers submit addresses too short to deliver to. The existing fix — minimum character and word
counts on two free-text lines — blocks legitimate rural addresses while letting genuine junk
through. Replace the two free-text lines with **seven structured components**, derive city/state and
city and state from the pincode, and gate submission on **how many components are present** rather
than how many characters were typed.

---

## 2. Problem

### 2.1 What is happening

Free-text Address Line 1 / Line 2 produce addresses that cannot be delivered to: no house number,
locality missing, line 2 repeating line 1, or the city typed where the area belongs.

### 2.2 Why the current rules cannot fix it

From the address-quality analysis (`1_complete` bucket — addresses the system already rates *strong
signal, no action*):

| line_one | line_two | words | chars | Existing rule outcome |
|---|---|---|---|---|
| `2-137 l` | `Pedda Pada Khana` | 5 | 23 | passes — sits 3 characters above the blocking threshold |
| `222-54-678` | `Chakali veedhi naidupeta` | 4 | 35 | "Looks incomplete" prompt |
| `5-136, Saluchintala` | `Saluchintala` | 3 | 32 | "Looks incomplete" prompt |
| `Flat no-409` | `Atchuthapuram` | 3 | 25 | "Looks incomplete" prompt |
| `B-5/246-247` | `Sec-3 Rohini` | 3 | 24 | "Looks incomplete" prompt |

Andhra Pradesh door-number addresses are short **and** complete. Delhi addresses (gali, block,
floor) are long. Length measures *region*, not *quality*.

The same bucket shows what length rules miss:

| Defect | Real value | Length rule verdict |
|---|---|---|
| Placeholder house number | `0-0, ramayalyam street` | passes |
| Line 2 duplicates line 1 | `S1 Jayanthi embearled` / `Jayanthi embearled` | passes |
| Entire address repeated | cust 64655 — both lines identical, 16 words | passes |
| Line 2 is the city | `I 10 Ganga Ram Vatika Tilak nagar` / `Delhi` | passes |
| Pincode + country in line 1 | `WZ-476 … North West Delhi India 110034` / `SRINAGAR` | passes |

**Root cause:** one free-text blob cannot be validated per-component. Length is the only signal
available, and length is the wrong signal.

---

## 3. Goals / Non-goals

### Goals

| ID | Goal |
|---|---|
| G1 | No submitted address lacking a house/flat/door number |
| G2 | No submitted address lacking a locality-or-landmark level detail |
| G3 | Area captured as its own dedicated field, never mixed into a free-text line |
| G4 | Short-but-complete rural addresses submit without friction |
| G5 | Address-step drop-off does not increase |

### Non-goals

| ID | Out of scope for v1 |
|---|---|
| N1 | Backfilling or re-verifying addresses already captured |
| N2 | Map pin-drop / GPS capture (phase 2) |
| N3 | Address verification against a courier serviceability API |
| N4 | Non-India addresses |
| N5 | OCR / auto-fill of address from an uploaded document |

---

## 4. Success metrics

| Metric | Definition | Target |
|---|---|---|
| M1 — Coverage | Share of submissions with component score ≥4 | ≥75% within 30 days |
| M2 — Undeliverable | RTO / failed-delivery rate on new captures | ↓ vs 30-day pre-launch baseline |
| M3 — Correction load | Address-edit support tickets per 1,000 onboardings | ↓ |
| M4 — Funnel | Address-step completion rate | ≥ pre-launch (guardrail, must not regress) |

Baselines for M1–M4 must be captured before the flag is enabled.

---

## 5. Scope

**In:** Current address screen; Permanent address screen (same component, `Same as current` toggle
copies components); India pincodes only; mobile web + app webview.

**Dependencies:** internal pincode master endpoint (pincode → city, state); city-master
data fix (see R3).

---

## 6. Functional requirements

Priority: **P0** blocks launch · **P1** wanted at launch · **P2** follow-up.

### 6.1 Structure

| ID | Pri | Requirement |
|---|---|---|
| FR-01 | P0 | Address Line 1 / Line 2 free-text fields are removed and replaced by the components in §6.2 |
| FR-02 | P0 | Pincode is the first field on the page |
| FR-03 | P0 | City and State are read-only, derived from pincode, and never typed by the customer |
| FR-04 | P0 | Area / Village is free-form text — no list matching, no spelling check against the pincode master |
| FR-05 | P0 | Payload carries both the components and legacy `lineOne`/`lineTwo` strings (dual-write) |
| FR-06 | P1 | Home type (Flat/Apartment · Independent house) is captured and drives the Apartment-name requirement |

### 6.2 Fields

| ID | Field | Required | Max | Notes |
|---|---|---|---|---|
| FR-10 | Pincode | Yes | 6 | Numeric only, drives FR-03 / FR-04 |
| FR-11 | City, State | Auto | — | Read-only |
| FR-12 | Home type | Yes | — | Flat/Apartment · Independent house |
| FR-13 | Apartment / House / Floor number | Yes | 40 | Non-empty (see LOGIC V-20); no digit requirement |
| FR-14 | Apartment name | Conditional | 60 | Required when home type = Flat, or house no. carries a unit token |
| FR-15 | Locality (street, gali, colony) | Conditional | 60 | Required unless Landmark present |
| FR-16 | Area / Village | Yes | 60 | Free-form text, no list matching |
| FR-17 | Landmark | Conditional | 50 | Required when Locality empty; otherwise optional and nudged |
| FR-18 | Property ownership | Yes | — | Self-Owned · Rented (unchanged from today) |

### 6.3 Validation behaviour

| ID | Pri | Requirement |
|---|---|---|
| FR-20 | P0 | Submission is gated on component coverage score ≥3, not on character or word count |
| FR-21 | P0 | All character/word-count rules from the current validation sheet are removed |
| FR-22 | P0 | Blocking is expressed at field level plus a red hint and blocked state on the Continue CTA — no top-of-page summary banner |
| FR-23 | P0 | Non-blocking prompts render black at field level only, and never prevent submission |
| FR-24 | P0 | Field validation fires on blur, never per keystroke |
| FR-25 | P0 | The CTA blocked state and its hint appear only after Continue is pressed |
| FR-26 | P0 | The blocked CTA stays tappable; pressing it scrolls to and focuses the first blocking field |
| FR-27 | P1 | A live strength meter shows the coverage score and what would improve it, and turns red whenever a blocking error is visible |
| FR-28 | P1 | On blur, text fields are trimmed, inner whitespace collapsed, stray 6-digit pincodes stripped |

### 6.4 Confirmation

| ID | Pri | Requirement |
|---|---|---|
| FR-30 | P0 | Before submit, a sheet shows the assembled delivery label exactly as the courier will read it |
| FR-31 | P0 | The sheet offers Edit address / Confirm; Confirm submits, Edit returns to the form |
| FR-32 | P1 | Outstanding non-blocking warnings repeat on the sheet |

### 6.5 Permanent address

| ID | Pri | Requirement |
|---|---|---|
| FR-40 | P0 | `Same as current` copies **components**, not concatenated lines |
| FR-41 | P0 | Turning the toggle off leaves the copied values editable, not cleared |
| FR-42 | P1 | Permanent address runs the identical rule set — no relaxed variant |

### 6.6 Accessibility & platform

| ID | Pri | Requirement |
|---|---|---|
| FR-50 | P0 | Every field has a programmatic label; errors announced via `role="alert"`; `aria-invalid` on failure |
| FR-51 | P0 | Segmented controls are radio groups; the area picker is a `combobox` with arrow-key navigation |
| FR-52 | P1 | Touch targets ≥44px; page usable at 320px width and at 200% text zoom |
| FR-53 | P1 | Correct mobile keyboards: numeric for pincode; `autocomplete` hints on address fields |

---

## 7. Copy deck

### Labels & helper text

| Field | Label | Placeholder | Helper |
|---|---|---|---|
| Pincode | Pincode * | Enter pincode | City and state fill in automatically |
| Home type | What kind of home is this? * | — | — |
| House no. | Apartment / House / Floor number * | House / flat / floor / door number | Include the floor if you have one — e.g. Flat 501, 3rd Floor · 9-208-1 · H.No 830 |
| Apartment name | Apartment name * / (optional) | e.g. NVV Golden Classic | Society, tower or building name |
| Locality | Locality (street, gali, colony) | Street, gali or colony | e.g. Gali no 5, Mittal Colony · 4th Cross Road |
| Area | Area / Village * | e.g. Madhurawada | Your area, colony or village name |
| Landmark | Landmark (optional) | Nearby shop, temple, school or office | e.g. Near Mahathi School · Behind DRM office |
| Ownership | Property ownership * | — | — |

### Messages

Full list with rule IDs in [LOGIC.md §4](LOGIC.md). Headlines:

- Blocking, form level: "Your address needs more detail — add street, area or a landmark"
- Blocking, house no.: "Enter your house / flat / door number" · "This doesn't look like a real house number"
- Blocking, locality: "Enter street / gali / colony" — required with no landmark escape; landmark itself never blocks
- CTA hint when blocked: "Complete the fields marked in red to continue"
- Strength meter when blocked: "Incomplete — complete the fields marked in red"
- Confirm sheet: "Your card and all documents will be sent to this address."

---

## 8. Flow

```
Pincode ──► resolve ──► City/State shown (read-only) + Area list loaded
                              │
                              ▼
     Home type → House no. → Apartment name* → Locality → Area → Landmark → Ownership
                              │
                       strength meter updates live
                              │
                        [ Continue ]
                              │
                ┌─────────────┴──────────────┐
          errors exist                    clean
                │                            │
   red summary + scroll to          Confirm sheet (delivery label)
   first blocking field                      │
                                    Edit ◄───┴───► Confirm → submit
```

---

## 9. Data contract

Payload shape, `meta` fields and legacy line mapping: [LOGIC.md §10](LOGIC.md).

Dual-write of `lineOne`/`lineTwo` means KYC, card issuance and courier handoff need no coordinated
release.

---

## 10. Analytics

| Event | Payload | Question it answers |
|---|---|---|
| `address_pincode_resolved` | pincode | City/state resolution health |
| `address_pincode_failed` | pincode, reason | Master gaps, API health |
| `address_field_error` | field, message | Which rule costs the most friction |
| `address_submit_blocked` | fields, score, firstErrorField | Where the funnel breaks |
| `address_confirm_shown`, `address_confirm_edit` | score | Does the label preview cause edits? |
| `address_submitted` | full `meta` (score, houseNoSignal) | Quality trend vs baseline |

`meta.houseNoSignal` reuses the `signal` taxonomy from the analysis sheet (`keyword` / `slash` /
`alnum` / `no_prefix` / `none`) so the before/after mix is directly comparable.

---

## 11. Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | More fields ⇒ higher drop-off | Funnel | Continue never disabled; blur-only validation; strength meter as progress not punishment; M4 as launch guardrail |
| R2 | Pincode master lacks the customer’s village | Blocking dead-end | Area is free-form text — there is no list to be absent from |
| R3 | City master is wrong for some pincodes — `110025 → BUDAUN` with state `DELHI` in 3 production rows | Wrong city printed on the confirm sheet | Fix the master rows before enabling the flag |
| R4 | Public pincode API disagrees with production city data — `517644` returns *Chittoor*, production says *Tirupati* | Customer sees an unexpected city | Point `pincodeService.ENDPOINT` at the internal master before launch |
| R5 | Pincode API latency or outage | Customer cannot proceed | Cache; on failure allow manual area entry and never hard-block on the lookup itself |
| R6 | Placeholder blocklist too narrow | Junk still passes | Extend `PLACEHOLDER_RE` once the failing analysis buckets are reviewed (see §13) |
| R7 | Rules mismatch between web and app | Inconsistent data | `addressValidation.js` is framework-free and the single source of truth; app must consume it, not reimplement |

---

## 12. Rollout

1. Capture M1–M4 baselines.
2. Fix R3 (city master) and R4 (point at internal master).
3. Ship behind a flag, Current address only, 10% → 50% → 100% with M4 watched at each step.
4. Permanent address one week after Current reaches 100%.
5. Dual-write throughout; no backfill (N1).
6. Phase 2 (post-launch): map pin-drop with reverse-geocode cross-check — >5 km mismatch against the
   entered pincode raises a non-blocking "Is this the right area?".

---

## 13. Open questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | Failing buckets `2_*` / `3_*` of the analysis sheet were never reviewed — the reader truncated at `1_complete`. Needed to tune the placeholder and junk lists. | Anshul | No — v1 ships on the patterns that leaked into the complete bucket |
| Q2 | Which internal endpoint serves pincode → city / state? | Eng | **Yes** — R4 |
| Q3 | Do downstream systems have a max length on `lineOne` / `lineTwo`? Components can now exceed today's 100-char cap when concatenated. | Eng | **Yes** — truncation strategy needed |
| Q4 | Is Home type acceptable as a new mandatory field, or should the Apartment-name rule rely on the house-no. unit token alone? | Product | No — token-only fallback already implemented |

---

## 14. Appendix — evidence

Source sheets:

- Address quality / bucketing: `1LH7LD-mzPP37cfuganNi_GZhYMFttNzfp1ogSePnoBc`
- Existing validation rules: `1nvkgZiwmO4nnguKKNdqkS9srWNNTY05MkPT0bDEmlYo`

Rules being retired, verbatim from the validation sheet:

| Existing rule | Type | Disposition |
|---|---|---|
| Line 1&2 combined `<20 characters` | Blocking | **Removed** — threshold sits only 3 characters below the shortest real address in the complete bucket (`2-137 l` / `Pedda Pada Khana`, 23 chars) |
| Line 1&2 combined `<5 words` | Non-blocking | **Removed** — fires on 3-word complete AP addresses |
| Line 1 `Min 10` characters | Mandatory | **Removed** — house no. field min is 2 chars (`2-137 l` is valid) |
| Line 1 no-digit → prompt | Non-blocking | Dropped — a house number may legitimately carry no digit |
| Landmark optional, max-length only | Non-blocking | **Now conditionally mandatory** when Locality is empty |
| Allowed chars, only-numbers-not-allowed | Blocking | **Retained**, applied per component |
