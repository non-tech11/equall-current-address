/**
 * Asserts LOGIC.md §12's test tables against the real validator.
 *
 *   node docs/verify-logic-tables.mjs
 *
 * The must-pass rows are the `1_complete` addresses the component-coverage
 * design exists to accept; the must-block rows are the ones product decided to
 * stop. Both drifted from the code once already (empty-street rows kept a ✓
 * after V-40 was restored), so they are checked here rather than by eye.
 * Exits non-zero on the first mismatch.
 */
import { validateAddress } from '../src/address/addressValidation.js';

const AP = { city: 'Visakhapatnam', state: 'Andhra Pradesh', pinStatus: 'done' };
const at = (city, state) => ({ city, state, pinStatus: 'done' });

const form = (o) => ({
  pincode: '530041', homeType: 'INDEPENDENT', houseNo: '', building: '',
  locality: '', area: '', landmark: '', ownership: 'SELF_OWNED', ...o,
});

/** id, form, ctx, expected score. `✓` rows must submit. */
const MUST_PASS = [
  ['T-01', form({ pincode: '517644', houseNo: '9-208-1', locality: 'Ward 3', area: 'Bahadurpet', landmark: 'Near bus stop' }), at('Chittoor', 'Andhra Pradesh'), 4],
  ['T-02', form({ pincode: '518001', houseNo: '2-137 l', locality: 'Panchayat road', area: 'Pedda Pada Khana', landmark: 'Near panchayat office' }), at('Kurnool', 'Andhra Pradesh'), 4],
  ['T-03', form({ pincode: '524126', houseNo: '222-54-678', locality: 'Chakali veedhi', area: 'Naidupeta' }), at('Nellore', 'Andhra Pradesh'), 3],
  ['T-04', form({ pincode: '531011', homeType: 'FLAT', houseNo: 'Flat no-409', building: 'Sai Residency', locality: 'Main Road', area: 'Atchuthapuram' }), AP, 4],
  ['T-05', form({ pincode: '110085', houseNo: 'B-5/246-247', locality: 'Sec-3', area: 'Rohini' }), at('North West Delhi', 'Delhi'), 3],
  ['T-06', form({ pincode: '530041', homeType: 'FLAT', houseNo: 'Flat 501', building: 'NVV Golden Classic', locality: 'Srinivasa Nagar Rd', area: 'Pothinamallayapalem', landmark: 'Near Mahathi School' }), AP, 5],
  ['T-07', form({ pincode: '110044', houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Mithapur Extension' }), at('South Delhi', 'Delhi'), 3],
  ['T-08', form({ pincode: '530004', houseNo: 'Hc-4/L', locality: 'Harbour colony', area: 'Visakhapatnam', landmark: 'Behind DRM office' }), AP, 4],
];

/** id, form, ctx, the field the block must land on. */
const MUST_BLOCK = [
  ['T-20', form({ houseNo: '0-0', locality: 'Ramalayam Street', area: 'Pedapariya' }), AP, 'houseNo'],
  ['T-22', form({ locality: 'Gali No 4', area: 'Mithapur' }), AP, 'houseNo'],
  ['T-23', form({ houseNo: '9-208-1', area: 'Bahadurpet' }), AP, 'locality'],
  // The three 1_complete rows that carry no street — T-01, T-02 and T-04 as sourced.
  ['T-23a', form({ pincode: '517644', houseNo: '9-208-1', area: 'Bahadurpet', landmark: 'Near bus stop' }), at('Chittoor', 'Andhra Pradesh'), 'locality'],
  ['T-23b', form({ pincode: '518001', houseNo: '2-137 l', area: 'Pedda Pada Khana', landmark: 'Near panchayat office' }), at('Kurnool', 'Andhra Pradesh'), 'locality'],
  ['T-23c', form({ pincode: '531011', homeType: 'FLAT', houseNo: 'Flat no-409', building: 'Sai Residency', area: 'Atchuthapuram' }), AP, 'locality'],
  ['T-24', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Delhi' }), at('South West Delhi', 'DELHI'), 'area'],
  ['T-25', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: '110025' }), at('South Delhi', 'Delhi'), 'area'],
  ['T-26', form({ homeType: 'FLAT', houseNo: 'Flat 501', locality: 'Main Road', area: 'Madhurawada' }), AP, 'building'],
  ['T-27', form({ homeType: 'INDEPENDENT', houseNo: 'Flat no-409', locality: 'Main Road', area: 'Atchuthapuram' }), AP, 'building'],
  ['T-28', form({ houseNo: '530041 Flat 2', locality: 'Main Road', area: 'Madhurawada' }), AP, 'houseNo'],
  ['T-31', form({ houseNo: '303', locality: 'Main', area: 'CVR', landmark: 'Near park' }), AP, '_form'],
  ['T-32', form({ houseNo: '9-208-1', area: 'Bahadurpet', landmark: 'Near' }), AP, 'landmark'],
  ['T-33', form({ houseNo: '9-208-1', locality: 'विनोद नगर', area: 'Bahadurpet' }), AP, 'locality'],
  ['T-34', form({ houseNo: 'H.No 830', locality: 'Gali No 4', area: 'Madhurawada', ownership: '' }), AP, 'ownership'],
];

const fails = [];

for (const [id, f, ctx, score] of MUST_PASS) {
  const r = validateAddress(f, ctx);
  if (!r.ok) fails.push(`${id} must pass but blocks: ${JSON.stringify(r.errors)}`);
  else if (r.score !== score) fails.push(`${id} passes but scores ${r.score}, table says ${score}`);
  else console.log(`${id}  pass  score ${r.score}`);
}

for (const [id, f, ctx, field] of MUST_BLOCK) {
  const r = validateAddress(f, ctx);
  if (r.ok) fails.push(`${id} must block but passes`);
  else if (!r.errors[field]) fails.push(`${id} blocks on ${Object.keys(r.errors).join(', ')}, table says ${field}`);
  else console.log(`${id}  block on ${field}  "${r.errors[field]}"`);
}

if (fails.length) {
  console.error(`\n${fails.length} mismatch(es) between LOGIC.md §12 and the validator:`);
  fails.forEach((m) => console.error(`  - ${m}`));
  process.exit(1);
}
console.log(`\nLOGIC.md §12 matches the validator — ${MUST_PASS.length} must-pass, ${MUST_BLOCK.length} must-block.`);
