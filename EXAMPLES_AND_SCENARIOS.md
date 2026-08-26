# Examples & Scenarios — Current Address Screen

Every row below was produced by running the input through the real validator
(`src/address/addressValidation.js`) — this file is generated, not hand-written:

```bash
node docs/generate-scenarios.mjs   # rewrites this file
```

Rules referenced by ID are defined in [../LOGIC.md](../LOGIC.md).
Legend: **BLOCK** = red, submission prevented · **hint** = black, submission allowed.

---

## 1. Happy paths — what the customer sees end to end

### 1.1 Urban flat, everything filled

*Visakhapatnam, apartment, rented*

| Field | Entered |
|---|---|
| Pincode | `530041` → resolves **Visakhapatnam, Andhra Pradesh** (read-only) |
| Home type | Flat / Apartment |
| Apartment / House / Floor number | `Flat 501, 3rd Floor` |
| Apartment name | `NVV Golden Classic` |
| Locality | `Srinivasa Nagar Road` |
| Area / Village | `Madhurawada` |
| Landmark | `Near Mahathi School` |
| Property ownership | Rented |

**Strength:** 5/5 — "Excellent — easy to find"

**Continue →** confirm sheet opens

```
Confirm your address
Your card and all documents will be sent to this address.

Flat 501, 3rd Floor, NVV Golden Classic
Srinivasa Nagar Road
Near Mahathi School
Madhurawada, Visakhapatnam
Andhra Pradesh – 530041
```

**Payload sent on Confirm:**

```json
{
  "houseNo": "Flat 501, 3rd Floor",
  "buildingName": "NVV Golden Classic",
  "locality": "Srinivasa Nagar Road",
  "area": "Madhurawada",
  "landmark": "Near Mahathi School",
  "city": "Visakhapatnam",
  "state": "Andhra Pradesh",
  "pincode": "530041",
  "homeType": "FLAT",
  "residenceType": "RENTED",
  "lineOne": "Flat 501, 3rd Floor, NVV Golden Classic",
  "lineTwo": "Srinivasa Nagar Road, Madhurawada",
  "meta": {
    "addressScore": 5,
    "houseNoSignal": "keyword",
    "buildingWasRequired": true
  }
}
```

### 1.2 Independent urban house, no landmark

*Delhi, gali address, self-owned*

| Field | Entered |
|---|---|
| Pincode | `110044` → resolves **WEST, DELHI** (read-only) |
| Home type | Independent house |
| Apartment / House / Floor number | `H.No 830` |
| Apartment name | — |
| Locality | `Gali No 4` |
| Area / Village | `Mithapur Extension` |
| Landmark | — |
| Property ownership | Self-Owned |

**Strength:** 3/5 — "Okay — a landmark makes you easier to find"

**Continue →** confirm sheet opens

```
Confirm your address
Your card and all documents will be sent to this address.

H.No 830
Gali No 4
Mithapur Extension, WEST
DELHI – 110044
```

**Payload sent on Confirm:**

```json
{
  "houseNo": "H.No 830",
  "buildingName": "",
  "locality": "Gali No 4",
  "area": "Mithapur Extension",
  "landmark": "",
  "city": "WEST",
  "state": "DELHI",
  "pincode": "110044",
  "homeType": "INDEPENDENT",
  "residenceType": "SELF_OWNED",
  "lineOne": "H.No 830",
  "lineTwo": "Gali No 4, Mithapur Extension",
  "meta": {
    "addressScore": 3,
    "houseNoSignal": "keyword",
    "buildingWasRequired": false
  }
}
```

### 1.3 Village, no street name at all

*Rural Andhra — the case the old rules punished*

| Field | Entered |
|---|---|
| Pincode | `517644` → resolves **Chittoor, Andhra Pradesh** (read-only) |
| Home type | Independent house |
| Apartment / House / Floor number | `9-208-1` |
| Apartment name | — |
| Locality | — |
| Area / Village | `Bahadurpet` |
| Landmark | `Near the bus stop` |
| Property ownership | Self-Owned |

**Strength:** 3/5 — "Incomplete — complete the fields marked in red"

**Continue →** blocked

```
Confirm your address
Your card and all documents will be sent to this address.

9-208-1
Near the bus stop
Bahadurpet, Chittoor
Andhra Pradesh – 517644
```

**Payload sent on Confirm:**

```json
{
  "houseNo": "9-208-1",
  "buildingName": "",
  "locality": "",
  "area": "Bahadurpet",
  "landmark": "Near the bus stop",
  "city": "Chittoor",
  "state": "Andhra Pradesh",
  "pincode": "517644",
  "homeType": "INDEPENDENT",
  "residenceType": "SELF_OWNED",
  "lineOne": "9-208-1",
  "lineTwo": "Bahadurpet",
  "meta": {
    "addressScore": 3,
    "houseNoSignal": "slash",
    "buildingWasRequired": false
  }
}
```

### 1.4 Flat with floor in the house field

*Floor typed alongside the unit number*

| Field | Entered |
|---|---|
| Pincode | `110018` → resolves **WEST, DELHI** (read-only) |
| Home type | Flat / Apartment |
| Apartment / House / Floor number | `C 123, 2nd Floor` |
| Apartment name | `Ganga Ram Vatika` |
| Locality | `Ring Road` |
| Area / Village | `Tilak Nagar` |
| Landmark | — |
| Property ownership | Rented |

**Strength:** 4/5 — "Good — clear and complete"

**Continue →** confirm sheet opens

```
Confirm your address
Your card and all documents will be sent to this address.

C 123, 2nd Floor, Ganga Ram Vatika
Ring Road
Tilak Nagar, WEST
DELHI – 110018
```

**Payload sent on Confirm:**

```json
{
  "houseNo": "C 123, 2nd Floor",
  "buildingName": "Ganga Ram Vatika",
  "locality": "Ring Road",
  "area": "Tilak Nagar",
  "landmark": "",
  "city": "WEST",
  "state": "DELHI",
  "pincode": "110018",
  "homeType": "FLAT",
  "residenceType": "RENTED",
  "lineOne": "C 123, 2nd Floor, Ganga Ram Vatika",
  "lineTwo": "Ring Road, Tilak Nagar",
  "meta": {
    "addressScore": 4,
    "houseNoSignal": "alnum",
    "buildingWasRequired": true
  }
}
```

---

## 2. Blocking scenarios

| # | Scenario | Key input | Score | What the customer sees |
|---|---|---|:-:|---|
| B1 | Nothing entered, Continue pressed | houseNo empty, area empty | 0 | **area:** Enter your area or village<br>**houseNo:** Enter your house / flat / door number<br>**locality:** Enter street / gali / colony<br>**form:** Your address needs more detail — add street, area or a landmark |
| B2 | House number left empty | houseNo empty, locality `CV Raman Nagar`, area `Bangalore North` | 3 | **houseNo:** Enter your house / flat / door number |
| B3 | House number has no digit | houseNo `New Ashok Nagar`, locality `Gali No 4`, area `Mithapur` | 3 | **houseNo:** House number must include a digit |
| B4 | Placeholder house number | houseNo `0-0`, locality `Ramalayam Street`, area `Pedapariya` | 3 | **houseNo:** This doesn't look like a real house number |
| B5 | Placeholder "NA" | houseNo `NA`, locality `Ramalayam Street`, area `Pedapariya` | 3 | **houseNo:** House number must include a digit |
| B6 | Pincode typed into the house field | houseNo `530041 Flat 2`, locality `Main Road`, area `Madhurawada` | 3 | **houseNo:** Remove the pincode from this field |
| B7 | Neither street nor landmark | houseNo `9-208-1`, area `Bahadurpet` | 2 | **locality:** Enter street / gali / colony<br>**form:** Your address needs more detail — add street, area or a landmark |
| B8 | Flat without the society name | houseNo `Flat 501`, locality `Main Road`, area `Madhurawada` | 3 | **building:** Enter the apartment or building name |
| B9 | Unit token implies a flat, name missing | houseNo `Flat no-409`, locality `Main Road`, area `Atchuthapuram` | 3 | **building:** Enter the apartment or building name |
| B10 | Area left empty | houseNo `B-5/246-247`, locality `Sec-3 Rohini`, area empty | 2 | **area:** Enter your area or village<br>**form:** Your address needs more detail — add street, area or a landmark |
| B11 | Area is the state name | houseNo `H.No 830`, locality `Gali No 4`, area `Delhi` | 3 | **area:** Enter your area or village, not the state |
| B12 | Area is only digits | houseNo `H.No 830`, locality `Gali No 4`, area `110025` | 3 | **area:** Enter a name, not only numbers |
| B13 | Short area + short locality (score 2) | houseNo `303`, locality `Main`, area `CVR`, landmark `Near park` | 2 | **form:** Your address needs more detail — add street, area or a landmark |
| B14 | Landmark too short, no street | houseNo `9-208-1`, area `Bahadurpet`, landmark `Near` | 2 | **locality:** Enter street / gali / colony<br>**landmark:** Too short — mention a shop, temple, school or office<br>**form:** Your address needs more detail — add street, area or a landmark |
| B15 | Non-Latin script | houseNo `9-208-1`, locality `विनोद नगर`, area `Bahadurpet` | 3 | **locality:** Please type your address in English |
| B16 | Emoji in the apartment name | houseNo `Flat 2`, locality `Main Road`, area `Madhurawada` | 4 | **building:** Please type your address in English |
| B17 | Pincode too short | pincode `53004`, houseNo `H.No 830`, locality `Gali No 4`, area `Madhurawada` | 3 | **pincode:** Enter a valid 6-digit pincode |
| B18 | Pincode not in the master | pincode `999999`, houseNo `H.No 830`, locality `Gali No 4`, area `Madhurawada` | 3 | **pincode:** We couldn't find this pincode — please check |
| B19 | Ownership not selected | houseNo `H.No 830`, locality `Gali No 4`, area `Madhurawada` | 3 | **ownership:** Select property ownership |
| B20 | Home type not selected | houseNo `H.No 830`, locality `Gali No 4`, area `Madhurawada` | 3 | **homeType:** Select your home type |

Screen behaviour is identical across all of them: red text under each failing field,
a red hint above the CTA, the CTA muted (still tappable — tapping re-scrolls to the
first failing field), the strength meter forced red by M-01, and **no top-of-page
summary banner**.

**One case differs — B13.** The coverage gate fails while every individual field is
legal, so nothing is red to point at. There, the CTA hint carries the form-level
reason instead ("Your address needs more detail — add street, area or a landmark"),
the meter shows its own shorter red label so the sentence never prints twice, and the
under-length hints (W-12, W-44) mark the two fields that need more detail.

---

## 3. Warning-only scenarios — these all submit

| # | Scenario | Key input | Score | Hint shown | Submits? |
|---|---|---|:-:|---|:-:|
| W1 | Area equals the city name | houseNo `Hc-4/L`, locality `Harbour Colony`, area `Visakhapatnam` | 4 | area: That is the city name — add your smaller area or village if it has one | yes |
| W2 | Locality repeats the area | houseNo `S1 205`, building `Jayanthi Embearled`, locality `Jayanthi Embearled`, area `Jayanthi Embearled` | 4 | building: Same as your area — is this correct?<br>locality: Same as your area — is this correct?<br>locality: Same as the apartment name — is this correct? | yes |
| W3 | Pincode pasted into the locality | houseNo `WZ-125 A`, locality `Naraina Village 110028`, area `Naraina` | 3 | locality: Pincode removed — it is already captured above | yes |
| W4 | Very long house number | houseNo `13-59/1/2, FF 101, 3rd Floor`, locality `Sujata Nagar`, area `NAD Layout` | 3 | houseNo: Long house number — the apartment name goes in the next field | yes |
| W5 | Area filled but under 4 chars | houseNo `H.No 830`, locality `Gali No 4`, area `CVR` | 3 | area: Add the full area or village name | yes |
| W6 | Locality filled but under 5 chars | houseNo `H.No 830`, locality `Main`, area `Mithapur Extension` | 3 | locality: Add more detail — the full street, gali or colony name | yes |

---

## 4. Punctuation that must never be rejected

The old character rule allowed only `, . / # & ( ) ' -`, so all of these tripped
"Use English letters and numbers only". They are now valid; smart quotes and dashes
are normalised to ASCII on blur (S-05).

| # | Scenario | Input | Accepted? |
|---|---|---|:-:|
| P1 | Colon after H.No | `H.No: 830` | yes |
| P2 | Plus sign joining two plots | `Plot 5 + 6` | yes |
| P3 | Underscore in the locality | `H.No 830` | yes |
| P4 | Curly apostrophe from a phone keyboard | `Rao’s Nilayam` | yes |
| P5 | En-dash instead of hyphen | `Sector-5 – Phase 2` | yes |
| P6 | Curly double quotes | `Sai Nilayam “A” wing` | yes |
| P7 | Slash in S/o | `No.4-A` | yes |

---

## 5. System scenarios (not rule-driven)

| # | Scenario | What happens |
|---|---|---|
| S1 | Customer lands on the page | Meter is grey and neutral: "Fill in your address details to see how complete it is". No red anywhere (M-02) |
| S2 | Typing, not yet left the field | No validation, no error. Meter still updates live |
| S3 | Pincode reaches 6 digits | 350ms debounce, shimmer on the city/state chip, then `✓ City, State` |
| S4 | Pincode typed digit by digit | At most one network request — earlier ones aborted (P-01) |
| S5 | Same pincode re-entered | Served from the session cache, no second request (P-02) |
| S6 | Pincode API times out or 5xx | "Couldn’t check right now". City/state blank. **Submission still allowed** (P-04) |
| S7 | Pincode corrected after the area was typed | Area is kept; only city/state re-resolve (P-03) |
| S8 | Continue tapped while blocked | Scrolls to and focuses the first failing field in FIELD_ORDER |
| S9 | Confirm sheet → Edit | Returns to the form with everything intact, emits `address_confirm_edit` |
| S10 | Confirm sheet → Confirm | Emits `address_submitted` with `meta`, calls `onSubmit(payload)` |
| S11 | Permanent address, "Same as current" ON | Copies **components**, not concatenated lines |
| S12 | Toggling "Same as current" OFF | Copied values stay and remain editable — never cleared |
| S13 | Browser autofill fills every field at once | All rules run at Continue; area accepted exactly as filled |
| S14 | Screen reader on a failing field | Error announced via `role="alert"`, `aria-invalid` set on the input |

---

## 6. Real production rows replayed

All 41 short addresses (word_count ≤ 5) from the sheet's `1_complete` bucket,
mapped into the new components and run through the rule set.

| id | old rule | houseNo | building | locality | area | landmark | score | signal | new outcome |
|---|---|---|---|---|---|---|:-:|---|---|
| 10305 | prompt (<5 words) | `9-208-1` | `bahadurpet` | — | `Bahadurpet` | — | 3 | slash | BLOCK — locality |
| 19008 | passed | `8-119` | `RAVINAGAR NAIDUTHOTA` | — | `Vepagunta VISAKHAPATNAM` | — | 3 | slash | BLOCK — locality |
| 23986 | prompt (<5 words) | `222-54-678` | — | `Chakali veedhi naidupeta` | — | — | 2 | slash | BLOCK — area |
| 24650 | passed | `2-137` | `l` | — | `Pedda Pada Khana` | — | 2 | slash | BLOCK — locality |
| 31668 | prompt (<5 words) | `21-101` | — | `lane 9` | `Kakaninagar` | — | 3 | slash | **PASS** |
| 40090 | passed | `3/92-1` | `Chinthalapalli village` | — | `Chigicherla post` | — | 3 | slash | BLOCK — locality |
| 50417 | prompt (<5 words) | `5-32` | — | `Bc colony` | `Muthukur` | — | 3 | slash | **PASS** |
| 50464 | passed | `25-17-398` | `Guntur` | `6/4 srinivasarao thota` | — | — | 3 | slash | BLOCK — area |
| 52918 | passed | `11-4-6` | — | `Bank road` | `Appikonda street` | — | 3 | slash | **PASS** |
| 53845 | passed | `55-16-8` | `Lig 82` | `Hb colony` | — | — | 3 | slash | BLOCK — area |
| 57319 | passed | `S1` | `Jayanthi embearled` | — | `Jayanthi embearled` | — | 3 | alnum | BLOCK — locality |
| 64486 | passed | `23/450/1` | — | `Arigelavari street` | `Fathekan peta` | — | 3 | slash | **PASS** |
| 64625 | prompt (<5 words) | `5-136` | `Saluchintala` | — | `Saluchintala` | — | 3 | slash | BLOCK — locality |
| 72246 | passed | `D. No 28-156` | — | `Kapu street` | — | — | 2 | keyword | BLOCK — area |
| 83275 | prompt (<5 words) | `1-259` | — | `ramalayam st` | `Kalivelapalem` | — | 3 | slash | **PASS** |
| 94652 | prompt (<5 words) | `Flat no-409` | — | — | `Atchuthapuram` | — | 2 | keyword | BLOCK — building, locality |
| 96649 | passed | `2-84` | — | `Bc colony` | `Jalakanur village` | — | 3 | slash | **PASS** |
| 96679 | passed | `3-34/A` | `lokamudi` | `Eluru road center` | — | — | 3 | slash | BLOCK — area |
| 97033 | prompt (<5 words) | `76-97-270-18` | — | `Weeker Section Colony` | — | — | 2 | slash | BLOCK — area |
| 98189 | prompt (<5 words) | `Door no 1-116/3` | — | — | `Pedagummuluru` | — | 2 | keyword | BLOCK — building, locality |
| 99610 | prompt (<5 words) | `3-4-259 3rd` | — | `street` | `Rajugopalpuram` | — | 3 | slash | **PASS** |
| 99615 | passed | `Flat no 102` | — | — | `M s ramayya` | — | 2 | keyword | BLOCK — building, locality |
| 99744 | prompt (<5 words) | `15-63` | — | `kothavuru colony` | `Aganampudi` | — | 3 | slash | **PASS** |
| 26836 | prompt (<5 words) | `B-5/246-247` | — | `Sec-3 Rohini` | — | — | 2 | slash | BLOCK — area |
| 20433 | passed | `Rz-25A` | — | `gali no11B` | `Durga park` | — | 3 | alnum | **PASS** |
| 63391 | passed | `9/2784` | — | `street no 2` | `Chanderpuri` | — | 3 | slash | **PASS** |
| 67843 | passed | `E-3/328` | — | `Gali No7` | `Sonia Vihar` | — | 3 | slash | **PASS** |
| 58518 | passed | `H-754` | `Flat C3` | `Palam Extension` | — | — | 3 | alnum | BLOCK — area |
| 75900 | prompt (<5 words) | `G-29/95` | — | `SECTOR 3` | `ROHINI` | — | 3 | slash | **PASS** |
| 76750 | passed | `45/11` | — | `Ground floor` | `Ashok Nagar` | — | 3 | slash | **PASS** |
| 75633 | passed | `434/12` | — | `Lakhpat Colony` | `Meethapur Badarpur` | — | 3 | slash | **PASS** |
| 61075 | passed | `G19 1st` | — | `floor` | `Vijay chowk` | — | 3 | alnum | **PASS** |
| 65419 | prompt (<5 words) | `House L-20` | — | `Shastri Nagar` | — | — | 2 | keyword | BLOCK — area |
| 66069 | passed | `RZI-47` | `Tirath Niwas` | — | `West Sagarpur` | — | 3 | alnum | BLOCK — locality |
| 72123 | passed | `B 166` | — | `GOPAL NAGAR` | `NAJAFGARH` | — | 3 | alnum | **PASS** |
| 72166 | passed | `C-19` | — | `G Railway Colony` | `Jangpura` | — | 3 | alnum | **PASS** |
| 93116 | passed | `E 102` | — | `Mansarover Garden` | `Mansarover` | — | 3 | alnum | **PASS** |
| 74541 | passed | `C94` | — | `ganesh nagar` | `Ganesh nagar` | — | 3 | alnum | **PASS** |
| 84598 | passed | `D13` | — | `kiran garden` | `Uttam nagar` | — | 3 | alnum | **PASS** |
| 92483 | passed | `House no 577` | — | `ambedkar marg` | — | — | 2 | keyword | BLOCK — area |
| 68412 | passed | `F-13/2` | — | `Krishna Nagar` | `Krishna Nagar` | — | 3 | slash | **PASS** |

**21 of 41 pass unchanged.** The rest are blocked for a named missing
component — never for being short. Mapping heuristic and full output:
[simulate-short-addresses.mjs](simulate-short-addresses.mjs), [short-address-simulation.txt](short-address-simulation.txt).

---

## 7. Complete copy inventory

Every string the customer can see, gathered from the scenarios above.

| Severity | Message |
|---|---|
| **BLOCK** | Enter a name, not only numbers |
| **BLOCK** | Enter a valid 6-digit pincode |
| **BLOCK** | Enter street / gali / colony |
| **BLOCK** | Enter the apartment or building name |
| **BLOCK** | Enter your area or village |
| **BLOCK** | Enter your area or village, not the state |
| **BLOCK** | Enter your house / flat / door number |
| **BLOCK** | House number must include a digit |
| **BLOCK** | Please type your address in English |
| **BLOCK** | Remove the pincode from this field |
| **BLOCK** | Select property ownership |
| **BLOCK** | Select your home type |
| **BLOCK** | This doesn't look like a real house number |
| **BLOCK** | Too short — mention a shop, temple, school or office |
| **BLOCK** | We couldn't find this pincode — please check |
| **BLOCK** | Your address needs more detail — add street, area or a landmark |
| hint | A bit more detail here strengthens your address |
| hint | Add more detail — the full street, gali or colony name |
| hint | Add the full area or village name |
| hint | Long house number — the apartment name goes in the next field |
| hint | Pincode removed — it is already captured above |
| hint | Same as the apartment name — is this correct? |
| hint | Same as your area — is this correct? |
| hint | That is the city name — add your smaller area or village if it has one |

| Strength meter state | Copy |
|---|---|
| Idle (nothing typed) | Fill in your address details to see how complete it is |
| Any visible blocking error | Incomplete — complete the fields marked in red |
| Score 0–1 | Too little detail |
| Score 2 | Needs more detail |
| Score 3 | Okay — a landmark makes you easier to find |
| Score 4 | Good — clear and complete |
| Score 5 | Excellent — easy to find |

| Other UI copy | |
|---|---|
| CTA hint when blocked | Complete the fields marked in red to continue |
| Confirm sheet title | Confirm your address |
| Confirm sheet subtitle | Your card and all documents will be sent to this address. |
| Confirm sheet actions | Edit address · Confirm |

