/**
 * Replays the SHORT addresses from the analysis sheet through the new
 * validator. Source rows are verbatim from the `1_complete` bucket, filtered to
 * word_count <= 5 — i.e. exactly the rows the existing rules flag as
 * "too short" or "looks incomplete".
 */
import {
  validateAddress,
  addressScore,
  houseNoSignal,
} from '/Users/User/equall-address-form/src/address/addressValidation.js';

// id, line_one, line_two, city, state, pincode, word_count, residence
const ROWS = [
  [10305, '9-208-1 bahadurpet', 'Bahadurpet', 'Tirupati', 'ANDHRA PRADESH', '517644', 3, 'SELF_OWNED'],
  [19008, '8-119  RAVINAGAR NAIDUTHOTA', 'Vepagunta VISAKHAPATNAM', 'VISAKHAPATANAM', 'ANDHRA PRADESH', '530047', 5, 'SELF_OWNED'],
  [23986, '222-54-678', 'Chakali veedhi naidupeta', 'SPSR NELLORE', 'ANDHRA PRADESH', '524126', 4, 'RENTED'],
  [24650, '2-137 l', 'Pedda Pada Khana', 'KURNOOL', 'ANDHRA PRADESH', '518001', 5, 'SELF_OWNED'],
  [31668, '21-101, lane 9', 'Kakaninagar', 'VISAKHAPATANAM', 'ANDHRA PRADESH', '530009', 4, 'SELF_OWNED'],
  [40090, 'Chinthalapalli village 3/92-1', 'Chigicherla post', 'Sri Sathya Sai', 'ANDHRA PRADESH', '515672', 5, 'SELF_OWNED'],
  [50417, '5-32,Bc colony', 'Muthukur', 'SPSR NELLORE', 'ANDHRA PRADESH', '524344', 4, 'SELF_OWNED'],
  [50464, '25-17-398 Guntur', '6/4 srinivasarao thota', 'GUNTUR', 'ANDHRA PRADESH', '522004', 5, 'SELF_OWNED'],
  [52918, '11-4-6 Bank road', 'Appikonda street', 'VISAKHAPATANAM', 'ANDHRA PRADESH', '531162', 5, 'RENTED'],
  [53845, '55-16-8 Lig 82', 'Hb colony', 'VISAKHAPATANAM', 'ANDHRA PRADESH', '530022', 5, 'SELF_OWNED'],
  [57319, 'S1 Jayanthi embearled', 'Jayanthi embearled', 'VISAKHAPATANAM', 'ANDHRA PRADESH', '530026', 5, 'RENTED'],
  [64486, '23/450/1,Arigelavari street', 'Fathekan peta', 'SPSR NELLORE', 'ANDHRA PRADESH', '524003', 5, 'SELF_OWNED'],
  [64625, '5-136, Saluchintala', 'Saluchintala', 'SPSR NELLORE', 'ANDHRA PRADESH', '524137', 3, 'SELF_OWNED'],
  [72246, 'D. No 28-156', 'Kapu street', 'Anakapalli', 'ANDHRA PRADESH', '531116', 5, 'SELF_OWNED'],
  [83275, '1-259 ramalayam st', 'Kalivelapalem', 'SPSR NELLORE', 'ANDHRA PRADESH', '524346', 4, 'SELF_OWNED'],
  [94652, 'Flat no-409', 'Atchuthapuram', 'Anakapalli', 'ANDHRA PRADESH', '531011', 3, 'RENTED'],
  [96649, '2-84, Bc colony', 'Jalakanur village', 'Nandyal', 'ANDHRA PRADESH', '518405', 5, 'SELF_OWNED'],
  [96679, '3-34/A, lokamudi', 'Eluru road center', 'Eluru', 'ANDHRA PRADESH', '521333', 5, 'SELF_OWNED'],
  [97033, '76-97-270-18', 'Weeker Section Colony', 'KURNOOL', 'ANDHRA PRADESH', '518003', 4, 'SELF_OWNED'],
  [98189, 'Door no 1-116/3', 'Pedagummuluru', 'Anakapalli', 'ANDHRA PRADESH', '531083', 4, 'SELF_OWNED'],
  [99610, '3-4-259 3rd street', 'Rajugopalpuram', 'SPSR NELLORE', 'ANDHRA PRADESH', '524126', 4, 'RENTED'],
  [99615, 'Flat no 102', 'M s ramayya', 'VISAKHAPATANAM', 'ANDHRA PRADESH', '531173', 6, 'RENTED'],
  [99744, '15-63 kothavuru colony', 'Aganampudi', 'VISAKHAPATANAM', 'ANDHRA PRADESH', '530053', 4, 'RENTED'],
  [26836, 'B-5/246-247', 'Sec-3 Rohini', 'NORTH WEST', 'DELHI', '110085', 3, 'SELF_OWNED'],
  [20433, 'Rz-25A, gali no11B', 'Durga park', 'SOUTH WEST', 'DELHI', '110045', 5, 'SELF_OWNED'],
  [63391, '9/2784 , street no 2', 'Chanderpuri', 'SHAHDARA', 'DELHI', '110031', 5, 'SELF_OWNED'],
  [67843, 'E-3/328 Gali No7', 'Sonia Vihar', 'NORTH EAST', 'DELHI', '110090', 5, 'SELF_OWNED'],
  [58518, 'H-754, Flat C3', 'Palam Extension', 'NEW DELHI', 'DELHI', '110077', 5, 'SELF_OWNED'],
  [75900, 'G-29/95 SECTOR 3', 'ROHINI', 'NORTH WEST', 'DELHI', '110085', 4, 'SELF_OWNED'],
  [76750, '45/11 Ground floor', 'Ashok Nagar', 'WEST', 'DELHI', '110018', 5, 'RENTED'],
  [75633, '434/12, Lakhpat Colony', 'Meethapur Badarpur', 'SOUTH', 'DELHI', '110044', 5, 'SELF_OWNED'],
  [61075, 'G19 1st floor', 'Vijay chowk', 'EAST', 'DELHI', '110092', 5, 'RENTED'],
  [65419, 'House L-20', 'Shastri Nagar', 'NORTH WEST', 'DELHI', '110052', 4, 'SELF_OWNED'],
  [66069, 'Tirath Niwas, RZI-47', 'West Sagarpur', 'NEW DELHI', 'DELHI', '110046', 5, 'SELF_OWNED'],
  [72123, 'B 166 GOPAL NAGAR', 'NAJAFGARH', 'WEST', 'DELHI', '110043', 5, 'SELF_OWNED'],
  [72166, 'C-19 G Railway Colony', 'Jangpura', 'SOUTH', 'DELHI', '110014', 5, 'SELF_OWNED'],
  [93116, 'E 102 Mansarover Garden', 'Mansarover', 'WEST', 'DELHI', '110015', 5, 'SELF_OWNED'],
  [74541, 'C94 ganesh nagar', 'Ganesh nagar', 'EAST', 'DELHI', '110092', 5, 'RENTED'],
  [84598, 'D13 kiran garden', 'Uttam nagar', 'WEST', 'DELHI', '110059', 5, 'SELF_OWNED'],
  [92483, 'House no 577', 'ambedkar marg', 'EAST', 'DELHI', '110092', 5, 'RENTED'],
  [68412, 'F-13/2 Krishna Nagar', 'Krishna Nagar', 'SHAHDARA', 'DELHI', '110051', 5, 'RENTED'],
];

/* ---- mapping the old two lines into the new components ------------------ */

const KEYWORD = /^(h\.?|hno|no\.?|d\.?|dno|door|flat|plot|house|room|shop|qtr|block|rz|wz|rzi?)$/i;
const NUMERICISH = /\d/;
const STREETY = /\b(gali|galli|street|st|road|rd|lane|marg|sector|sec|cross|colony|nagar|garden|puram|pet|peta|veedhi|vidhi|chowk|bazar|phase|pocket|thota|floor|extension|extn)\b/i;
const LANDMARKY = /^(near|behind|beside|opp|opposite|front|back)\b/i;
const UNIT = /^(flat|f\.?\s?no|tf-?\d|gf|ff|sf|s-?\d|apt|apartment|unit|block|room|door)\b/i;

/** Pull the house number off line_one, return [houseNo, remainder]. */
function splitLineOne(l1) {
  const parts = l1.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    const idx = parts.findIndex((p) => NUMERICISH.test(p));
    const houseNo = idx >= 0 ? parts[idx] : parts[0];
    const rest = parts.filter((_, i) => i !== (idx >= 0 ? idx : 0)).join(', ');
    return [houseNo, rest];
  }
  const tok = l1.split(/\s+/).filter(Boolean);
  // first token carrying a digit, plus any keyword / short letter-prefix
  // immediately before it ("B 166", "E 102", "House L-20", "D. No 28-156")
  const d = tok.findIndex((t) => NUMERICISH.test(t));
  if (d < 0) return [tok.join(' '), ''];
  let start = d;
  while (start > 0 && (KEYWORD.test(tok[start - 1]) || /^[A-Za-z.]{1,4}$/.test(tok[start - 1]))) start--;
  let end = d + 1;
  while (end < tok.length && NUMERICISH.test(tok[end])) end++;
  const houseNo = tok.slice(start, end).join(' ');
  const rest = [...tok.slice(0, start), ...tok.slice(end)].join(' ').trim();
  return [houseNo, rest];
}

/** Distribute line_two (and line_one's remainder) into locality / area / landmark. */
function mapRow(row) {
  const [, l1, l2] = row;
  const [houseNo, rest1] = splitLineOne(l1);

  let building = '';
  let locality = '';
  let landmark = '';
  let area = '';

  if (rest1) (STREETY.test(rest1) ? (locality = rest1) : (building = rest1));

  const l2parts = l2.split(',').map((s) => s.trim()).filter(Boolean);
  if (LANDMARKY.test(l2)) {
    landmark = l2;
  } else if (l2parts.length > 1) {
    if (!locality) locality = l2parts[0];
    area = l2parts[l2parts.length - 1];
  } else if (STREETY.test(l2) && !locality) {
    locality = l2;
  } else {
    area = l2;
  }
  // whatever is left un-placed becomes the area, since Area is mandatory
  if (!area) area = locality && locality !== l2 ? l2 : '';

  return {
    pincode: row[5],
    houseNo,
    building,
    locality,
    area,
    landmark,
    homeType: UNIT.test(houseNo) ? 'FLAT' : 'INDEPENDENT',
    ownership: row[7],
  };
}

/* ---- old rules, for the before/after column ---------------------------- */
function oldVerdict(l1, l2, wc) {
  const combined = `${l1} ${l2}`.trim();
  if (combined.length < 20) return 'BLOCKED (<20 chars)';
  if (wc < 5) return 'prompt (<5 words)';
  return 'passed';
}

/* ---- run --------------------------------------------------------------- */
const out = [];
let pass = 0;
let block = 0;
const ruleHits = {};
const warnHits = {};

for (const row of ROWS) {
  const [id, l1, l2, city, state, , wc] = row;
  const form = mapRow(row);
  const ctx = { city, state, pinStatus: 'done' };
  const { errors, warnings, score, ok } = validateAddress(form, ctx);

  const blockingIds = Object.keys(errors);
  blockingIds.forEach((k) => (ruleHits[k] = (ruleHits[k] || 0) + 1));
  warnings.forEach((w) => (warnHits[w.field] = (warnHits[w.field] || 0) + 1));
  ok ? pass++ : block++;

  out.push({
    id,
    old: oldVerdict(l1, l2, wc),
    houseNo: form.houseNo,
    building: form.building || '—',
    locality: form.locality || '—',
    area: form.area || '—',
    landmark: form.landmark || '—',
    score,
    signal: houseNoSignal(form.houseNo),
    result: ok ? 'PASS' : `BLOCK: ${blockingIds.map((k) => `${k}`).join(', ')}`,
    why: ok ? '' : Object.values(errors)[0],
  });
}

console.log(`rows simulated: ${ROWS.length}   pass: ${pass}   block: ${block}\n`);
console.log('id\told verdict\t\thouseNo\tbuilding\tlocality\tarea\tlandmark\tscore\tsignal\tnew result');
for (const r of out) {
  console.log(
    [r.id, r.old, r.houseNo, r.building, r.locality, r.area, r.landmark, r.score, r.signal, r.result, r.why]
      .join(' | '),
  );
}
/* ---- what the OLD rules actually did to these rows -------------------- */
const under20 = ROWS.filter((r) => `${r[1]} ${r[2]}`.trim().length < 20);
const under5w = ROWS.filter((r) => r[6] < 5);
console.log(`\nold rules on these ${ROWS.length} rows:`);
console.log(`  combined <20 chars  → BLOCKED: ${under20.length}` +
  (under20.length ? ` (${under20.map((r) => r[0]).join(', ')})` : ' — none in this bucket'));
console.log(`  <5 words            → prompt : ${under5w.length}`);
const lens = ROWS.map((r) => `${r[1]} ${r[2]}`.trim().length).sort((a, b) => a - b);
console.log(`  combined length: min ${lens[0]}, median ${lens[Math.floor(lens.length / 2)]}, max ${lens[lens.length - 1]}`);

/* ---- how much MORE the customer must type ------------------------------ */
const need = { 0: 0, 1: 0, 2: 0 };
out.forEach((r) => {
  if (r.result === 'PASS') return need[0]++;
  const missing = new Set();
  if (r.result.includes('area')) missing.add('area');
  if (r.result.includes('locality') || r.result.includes('landmark')) missing.add('locality-or-landmark');
  if (r.result.includes('building')) missing.add('apartment name');
  if (r.result.includes('houseNo')) missing.add('house no');
  need[Math.min(2, missing.size)]++;
});
console.log(`\nfields the customer must add: none ${need[0]}, one ${need[1]}, two+ ${need[2]}`);

console.log('\nblocking rule frequency:', JSON.stringify(ruleHits, null, 1));
console.log('warning field frequency:', JSON.stringify(warnHits, null, 1));

const dist = {};
out.forEach((r) => (dist[r.score] = (dist[r.score] || 0) + 1));
console.log('score distribution:', JSON.stringify(dist));
