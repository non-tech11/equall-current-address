/**
 * Generates EXAMPLES_AND_SCENARIOS.md by running every scenario through the
 * real validator, so the document cannot drift from the code.
 *
 *   node docs/generate-scenarios.mjs
 */
import { writeFileSync } from 'node:fs';
import {
  validateAddress,
  assembleLabel,
  strengthLabel,
  houseNoSignal,
  toPayload,
} from '../src/address/addressValidation.js';
import { ROWS, mapRow, oldVerdict } from './simulate-short-addresses.mjs';

const AP = { city: 'Visakhapatnam', state: 'Andhra Pradesh', pinStatus: 'done' };
const DL = { city: 'WEST', state: 'DELHI', pinStatus: 'done' };

const form = (o = {}) => ({
  pincode: '530041',
  homeType: 'INDEPENDENT',
  houseNo: '',
  building: '',
  locality: '',
  area: '',
  landmark: '',
  ownership: 'SELF_OWNED',
  ...o,
});

/** Run one scenario and return everything the screen would show. */
function run(f, ctx = AP) {
  const res = validateAddress(f, ctx);
  const blocked = Object.keys(res.errors).length > 0;
  const idle = res.score === 0 && !blocked;
  const meter = idle
    ? 'Fill in your address details to see how complete it is'
    : blocked
      ? 'Incomplete — complete the fields marked in red'
      : strengthLabel(res.score).text;
  return { ...res, blocked, meter, label: assembleLabel(f, ctx) };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|') || '—';
const q = (s) => (s ? `\`${String(s).replace(/\|/g, '\\|')}\`` : '—');

/* ------------------------------------------------------------------ */
/* 1. Happy paths                                                      */
/* ------------------------------------------------------------------ */
const HAPPY = [
  {
    name: 'Urban flat, everything filled',
    who: 'Visakhapatnam, apartment, rented',
    ctx: AP,
    f: form({
      pincode: '530041', homeType: 'FLAT', houseNo: 'Flat 501, 3rd Floor',
      building: 'NVV Golden Classic', locality: 'Srinivasa Nagar Road',
      area: 'Madhurawada', landmark: 'Near Mahathi School', ownership: 'RENTED',
    }),
  },
  {
    name: 'Independent urban house, no landmark',
    who: 'Delhi, gali address, self-owned',
    ctx: DL,
    f: form({
      pincode: '110044', homeType: 'INDEPENDENT', houseNo: 'H.No 830',
      locality: 'Gali No 4', area: 'Mithapur Extension',
    }),
  },
  {
    name: 'Village, no street name at all',
    who: 'Rural Andhra — the case the old rules punished',
    ctx: { city: 'Chittoor', state: 'Andhra Pradesh', pinStatus: 'done' },
    f: form({
      pincode: '517644', homeType: 'INDEPENDENT', houseNo: '9-208-1',
      area: 'Bahadurpet', landmark: 'Near the bus stop',
    }),
  },
  {
    name: 'Flat with floor in the house field',
    who: 'Floor typed alongside the unit number',
    ctx: DL,
    f: form({
      pincode: '110018', homeType: 'FLAT', houseNo: 'C 123, 2nd Floor',
      building: 'Ganga Ram Vatika', locality: 'Ring Road', area: 'Tilak Nagar',
      ownership: 'RENTED',
    }),
  },
];

/* ------------------------------------------------------------------ */
/* 2. Blocking scenarios                                               */
/* ------------------------------------------------------------------ */
const BLOCKS = [
  ['Nothing entered, Continue pressed', form(), AP],
  ['House number left empty', form({ building: 'Salarpuria Silverwoods', locality: 'CV Raman Nagar', area: 'Bangalore North' }), AP],
  ['House number has no digit', form({ houseNo: 'New Ashok Nagar', locality: 'Gali No 4', area: 'Mithapur' }), AP],
  ['Placeholder house number', form({ houseNo: '0-0', locality: 'Ramalayam Street', area: 'Pedapariya' }), AP],
  ['Placeholder "NA"', form({ houseNo: 'NA', locality: 'Ramalayam Street', area: 'Pedapariya' }), AP],
  ['Pincode typed into the house field', form({ houseNo: '530041 Flat 2', locality: 'Main Road', area: 'Madhurawada' }), AP],
  ['Neither street nor landmark', form({ houseNo: '9-208-1', area: 'Bahadurpet' }), AP],
  ['Flat without the society name', form({ homeType: 'FLAT', houseNo: 'Flat 501', locality: 'Main Road', area: 'Madhurawada' }), AP],
  ['Unit token implies a flat, name missing', form({ homeType: 'INDEPENDENT', houseNo: 'Flat no-409', locality: 'Main Road', area: 'Atchuthapuram' }), AP],
  ['Area left empty', form({ houseNo: 'B-5/246-247', locality: 'Sec-3 Rohini' }), DL],
  ['Area is the state name', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Delhi' }), DL],
  ['Area is only digits', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: '110025' }), DL],
  ['Short area + short locality (score 2)', form({ houseNo: '303', locality: 'Main', area: 'CVR', landmark: 'Near park' }), AP],
  ['Landmark too short, no street', form({ houseNo: '9-208-1', area: 'Bahadurpet', landmark: 'Near' }), AP],
  ['Non-Latin script', form({ houseNo: '9-208-1', locality: 'विनोद नगर', area: 'Bahadurpet' }), AP],
  ['Emoji in the apartment name', form({ homeType: 'FLAT', houseNo: 'Flat 2', building: 'Sai Nilayam 🏠', locality: 'Main Road', area: 'Madhurawada' }), AP],
  ['Pincode too short', form({ pincode: '53004', houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Madhurawada' }), AP],
  ['Pincode not in the master', form({ pincode: '999999', houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Madhurawada' }), { ...AP, pinStatus: 'not_found' }],
  ['Ownership not selected', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Madhurawada', ownership: '' }), AP],
  ['Home type not selected', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Madhurawada', homeType: '' }), AP],
];

/* ------------------------------------------------------------------ */
/* 3. Warning-only scenarios                                           */
/* ------------------------------------------------------------------ */
const WARNS = [
  ['Area equals the city name', form({ houseNo: 'Hc-4/L', locality: 'Harbour Colony', area: 'Visakhapatnam', landmark: 'Behind DRM office' }), AP],
  ['Locality repeats the area', form({ houseNo: 'S1 205', building: 'Jayanthi Embearled', locality: 'Jayanthi Embearled', area: 'Jayanthi Embearled' }), AP],
  ['Pincode pasted into the locality', form({ houseNo: 'WZ-125 A', locality: 'Naraina Village 110028', area: 'Naraina' }), DL],
  ['Very long house number', form({ houseNo: '13-59/1/2, FF 101, 3rd Floor', locality: 'Sujata Nagar', area: 'NAD Layout' }), AP],
  ['Area filled but under 4 chars', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: 'CVR', landmark: 'Near the temple' }), AP],
  ['Locality filled but under 5 chars', form({ houseNo: 'H.No 830', locality: 'Main', area: 'Mithapur Extension', landmark: 'Near the temple' }), AP],
];

/* ------------------------------------------------------------------ */
/* 4. Punctuation that must be accepted                                */
/* ------------------------------------------------------------------ */
const PUNCT = [
  ['Colon after H.No', form({ houseNo: 'H.No: 830', locality: 'Gali No 4', area: 'Mithapur Extension' }), DL],
  ['Plus sign joining two plots', form({ houseNo: 'Plot 5 + 6', locality: 'Gali No 4', area: 'Mithapur Extension' }), DL],
  ['Underscore in the locality', form({ houseNo: 'H.No 830', locality: 'NEW_COLONY', area: 'Mithapur Extension' }), DL],
  ['Curly apostrophe from a phone keyboard', form({ houseNo: 'H.No 830', building: 'Rao’s Nilayam', locality: 'Gali No 4', area: 'Mithapur Extension' }), DL],
  ['En-dash instead of hyphen', form({ houseNo: 'H.No 830', locality: 'Sector-5 – Phase 2', area: 'Mithapur Extension' }), DL],
  ['Curly double quotes', form({ homeType: 'FLAT', houseNo: 'Flat 501', building: 'Sai Nilayam “A” wing', locality: 'Gali No 4', area: 'Mithapur Extension' }), DL],
  ['Slash in S/o', form({ houseNo: 'No.4-A', locality: 'S/o Ramesh Street', area: 'Mithapur Extension' }), DL],
];

/* ------------------------------------------------------------------ */
/* markdown                                                           */
/* ------------------------------------------------------------------ */
const L = [];
const p = (s = '') => L.push(s);

p('# Examples & Scenarios — Current Address Screen');
p('');
p('Every row below was produced by running the input through the real validator');
p('(`src/address/addressValidation.js`) — this file is generated, not hand-written:');
p('');
p('```bash');
p('node docs/generate-scenarios.mjs   # rewrites this file');
p('```');
p('');
p('Rules referenced by ID are defined in [../LOGIC.md](../LOGIC.md).');
p('Legend: **BLOCK** = red, submission prevented · **hint** = black, submission allowed.');
p('');
p('---');
p('');
p('## 1. Happy paths — what the customer sees end to end');
p('');

HAPPY.forEach((h, i) => {
  const r = run(h.f, h.ctx);
  const pay = toPayload(h.f, h.ctx);
  p(`### 1.${i + 1} ${h.name}`);
  p('');
  p(`*${h.who}*`);
  p('');
  p('| Field | Entered |');
  p('|---|---|');
  p(`| Pincode | ${q(h.f.pincode)} → resolves **${h.ctx.city}, ${h.ctx.state}** (read-only) |`);
  p(`| Home type | ${h.f.homeType === 'FLAT' ? 'Flat / Apartment' : 'Independent house'} |`);
  p(`| Apartment / House / Floor number | ${q(h.f.houseNo)} |`);
  p(`| Apartment name | ${q(h.f.building)} |`);
  p(`| Locality | ${q(h.f.locality)} |`);
  p(`| Area / Village | ${q(h.f.area)} |`);
  p(`| Landmark | ${q(h.f.landmark)} |`);
  p(`| Property ownership | ${h.f.ownership === 'RENTED' ? 'Rented' : 'Self-Owned'} |`);
  p('');
  p(`**Strength:** ${r.score}/5 — "${r.meter}"`);
  p('');
  if (r.warnings.length) {
    p('**Hints shown (non-blocking):**');
    p('');
    r.warnings.forEach((w) => p(`- ${w.field}: ${w.text}`));
    p('');
  }
  p(`**Continue →** ${r.ok ? 'confirm sheet opens' : 'blocked'}`);
  p('');
  p('```');
  p('Confirm your address');
  p('Your card and all documents will be sent to this address.');
  p('');
  r.label.forEach((line) => p(line));
  p('```');
  p('');
  p('**Payload sent on Confirm:**');
  p('');
  p('```json');
  p(JSON.stringify({ ...pay, meta: pay.meta }, null, 2));
  p('```');
  p('');
});

p('---');
p('');
p('## 2. Blocking scenarios');
p('');
p('| # | Scenario | Key input | Score | What the customer sees |');
p('|---|---|---|:-:|---|');
BLOCKS.forEach(([name, f, ctx], i) => {
  const r = run(f, ctx);
  const msgs = Object.entries(r.errors)
    .map(([k, v]) => `**${k === '_form' ? 'form' : k}:** ${v}`)
    .join('<br>');
  const key = [
    f.pincode !== '530041' ? `pincode ${q(f.pincode)}` : null,
    f.houseNo ? `houseNo ${q(f.houseNo)}` : 'houseNo empty',
    f.locality ? `locality ${q(f.locality)}` : null,
    f.area ? `area ${q(f.area)}` : 'area empty',
    f.landmark ? `landmark ${q(f.landmark)}` : null,
  ].filter(Boolean).join(', ');
  p(`| B${i + 1} | ${cell(name)} | ${cell(key)} | ${r.score} | ${msgs} |`);
});
p('');
p('Screen behaviour is identical across all of them: red text under each failing field,');
p('a red hint above the CTA, the CTA muted (still tappable — tapping re-scrolls to the');
p('first failing field), the strength meter forced red by M-01, and **no top-of-page');
p('summary banner**.');
p('');
p('**One case differs — B13.** The coverage gate fails while every individual field is');
p('legal, so nothing is red to point at. There, the CTA hint carries the form-level');
p('reason instead ("Your address needs more detail — add street, area or a landmark"),');
p('the meter shows its own shorter red label so the sentence never prints twice, and the');
p('under-length hints (W-12, W-44) mark the two fields that need more detail.');
p('');

p('---');
p('');
p('## 3. Warning-only scenarios — these all submit');
p('');
p('| # | Scenario | Key input | Score | Hint shown | Submits? |');
p('|---|---|---|:-:|---|:-:|');
WARNS.forEach(([name, f, ctx], i) => {
  const r = run(f, ctx);
  const hints = r.warnings.map((w) => `${w.field}: ${w.text}`).join('<br>') || '—';
  const key = [
    f.houseNo ? `houseNo ${q(f.houseNo)}` : null,
    f.building ? `building ${q(f.building)}` : null,
    f.locality ? `locality ${q(f.locality)}` : null,
    f.area ? `area ${q(f.area)}` : null,
  ].filter(Boolean).join(', ');
  p(`| W${i + 1} | ${cell(name)} | ${cell(key)} | ${r.score} | ${hints} | ${r.ok ? 'yes' : 'no'} |`);
});
p('');

p('---');
p('');
p('## 4. Punctuation that must never be rejected');
p('');
p('The old character rule allowed only `, . / # & ( ) \' -`, so all of these tripped');
p('"Use English letters and numbers only". They are now valid; smart quotes and dashes');
p('are normalised to ASCII on blur (S-05).');
p('');
p('| # | Scenario | Input | Accepted? |');
p('|---|---|---|:-:|');
PUNCT.forEach(([name, f, ctx], i) => {
  const r = run(f, ctx);
  const shown = f.building?.match(/[’“”]/) ? f.building : f.locality?.match(/[–—]/) ? f.locality : f.houseNo;
  const charErr = Object.values(r.errors).some((m) => /English|special symbols/.test(m));
  p(`| P${i + 1} | ${cell(name)} | ${q(shown)} | ${charErr ? 'NO — blocked' : 'yes'} |`);
});
p('');

p('---');
p('');
p('## 5. System scenarios (not rule-driven)');
p('');
p('| # | Scenario | What happens |');
p('|---|---|---|');
p('| S1 | Customer lands on the page | Meter is grey and neutral: "Fill in your address details to see how complete it is". No red anywhere (M-02) |');
p('| S2 | Typing, not yet left the field | No validation, no error. Meter still updates live |');
p('| S3 | Pincode reaches 6 digits | 350ms debounce, shimmer on the city/state chip, then `✓ City, State` |');
p('| S4 | Pincode typed digit by digit | At most one network request — earlier ones aborted (P-01) |');
p('| S5 | Same pincode re-entered | Served from the session cache, no second request (P-02) |');
p('| S6 | Pincode API times out or 5xx | "Couldn’t check right now". City/state blank. **Submission still allowed** (P-04) |');
p('| S7 | Pincode corrected after the area was typed | Area is kept; only city/state re-resolve (P-03) |');
p('| S8 | Continue tapped while blocked | Scrolls to and focuses the first failing field in FIELD_ORDER |');
p('| S9 | Confirm sheet → Edit | Returns to the form with everything intact, emits `address_confirm_edit` |');
p('| S10 | Confirm sheet → Confirm | Emits `address_submitted` with `meta`, calls `onSubmit(payload)` |');
p('| S11 | Permanent address, "Same as current" ON | Copies **components**, not concatenated lines |');
p('| S12 | Toggling "Same as current" OFF | Copied values stay and remain editable — never cleared |');
p('| S13 | Browser autofill fills every field at once | All rules run at Continue; area accepted exactly as filled |');
p('| S14 | Screen reader on a failing field | Error announced via `role="alert"`, `aria-invalid` set on the input |');
p('');

p('---');
p('');
p('## 6. Real production rows replayed');
p('');
p(`All ${ROWS.length} short addresses (word_count ≤ 5) from the sheet's \`1_complete\` bucket,`);
p('mapped into the new components and run through the rule set.');
p('');
p('| id | old rule | houseNo | building | locality | area | landmark | score | signal | new outcome |');
p('|---|---|---|---|---|---|---|:-:|---|---|');
let pass = 0;
ROWS.forEach((row) => {
  const f = mapRow(row);
  const ctx = { city: row[3], state: row[4], pinStatus: 'done' };
  const r = run(f, ctx);
  if (r.ok) pass++;
  const outcome = r.ok
    ? '**PASS**'
    : `BLOCK — ${Object.entries(r.errors).filter(([k]) => k !== '_form').map(([k]) => k).join(', ')}`;
  p(`| ${row[0]} | ${oldVerdict(row[1], row[2], row[6])} | ${q(f.houseNo)} | ${q(f.building)} | ${q(f.locality)} | ${q(f.area)} | ${q(f.landmark)} | ${r.score} | ${houseNoSignal(f.houseNo)} | ${outcome} |`);
});
p('');
p(`**${pass} of ${ROWS.length} pass unchanged.** The rest are blocked for a named missing`);
p('component — never for being short. Mapping heuristic and full output:');
p('[simulate-short-addresses.mjs](simulate-short-addresses.mjs), [short-address-simulation.txt](short-address-simulation.txt).');
p('');

p('---');
p('');
p('## 7. Complete copy inventory');
p('');
p('Every string the customer can see, gathered from the scenarios above.');
p('');
const msgs = new Set();
[...BLOCKS, ...WARNS, ...PUNCT].forEach(([, f, ctx]) => {
  const r = run(f, ctx);
  Object.values(r.errors).forEach((m) => msgs.add(`BLOCK|${m}`));
  r.warnings.forEach((w) => msgs.add(`hint|${w.text}`));
});
p('| Severity | Message |');
p('|---|---|');
[...msgs].sort().forEach((m) => {
  const [sev, text] = m.split('|');
  p(`| ${sev === 'BLOCK' ? '**BLOCK**' : 'hint'} | ${cell(text)} |`);
});
p('');
p('| Strength meter state | Copy |');
p('|---|---|');
p('| Idle (nothing typed) | Fill in your address details to see how complete it is |');
p('| Any visible blocking error | Incomplete — complete the fields marked in red |');
[0, 2, 3, 4, 5].forEach((s) => {
  if (s === 0) return p(`| Score 0–1 | ${strengthLabel(1).text} |`);
  p(`| Score ${s} | ${strengthLabel(s).text} |`);
});
p('');
p('| Other UI copy | |');
p('|---|---|');
p('| CTA hint when blocked | Complete the fields marked in red to continue |');
p('| Confirm sheet title | Confirm your address |');
p('| Confirm sheet subtitle | Your card and all documents will be sent to this address. |');
p('| Confirm sheet actions | Edit address · Confirm |');
p('');

writeFileSync(new URL('../EXAMPLES_AND_SCENARIOS.md', import.meta.url), `${L.join('\n')}\n`);
console.log(`wrote EXAMPLES_AND_SCENARIOS.md — ${L.length} lines`);
