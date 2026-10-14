const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loadComponent(file, state = []) {
  const filename = path.resolve(file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const originalRequire = mod.require.bind(mod);
  let index = 0;
  mod.require = (name) => name.startsWith('.') ? loadComponent(path.resolve(path.dirname(filename), name) + '.ts') : name.startsWith('@/') ? loadComponent(name.slice(2) + (fs.existsSync(name.slice(2) + '.ts') ? '.ts' : '.tsx')) : name === 'react' ? {
    ...React,
    useState: (initial) => [state[index++] ?? initial, () => {}],
    useMemo: (fn) => fn(), useRef: () => ({ current: null }), useEffect: () => {},
  } : originalRequire(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((n) => nodes(n, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
const groups = [{ district: 'Salamanca', total: 100, missingPhone: 0,
  zones: ['Castellana', 'Recoletos', 'Goya'].map(name => ({ name, total: 30, missingPhone: 0 })) }];
for (const query of ['Castellana', 'Recoletos']) {
  const { ZoneFilter } = loadComponent('components/admin/particulares/zone-filter.tsx', [true, query]);
  let value;
  const tree = ZoneFilter({ groups, value: '', onChange: v => { value = v; } });
  const button = nodes(tree, 'button').find(b => renderToStaticMarkup(b).includes(`>${query}</span>`));
  assert.ok(button, `Searching ${query} must keep the matching neighborhood visible`);
  button.props.onClick();
  assert.equal(value, `z:${query}`, 'Selecting a neighborhood must not select the district');
}
const { ZoneFilter } = loadComponent('components/admin/particulares/zone-filter.tsx', [true, 'Castellana']);
let selection;
const tree = ZoneFilter({ groups, value: 'd:Salamanca', onChange: v => { selection = v; } });
const castellana = nodes(tree, 'button').find(b => renderToStaticMarkup(b).includes('>Castellana</span>'));
assert.ok(!castellana.props.disabled, 'A neighborhood must allow narrowing a selected district');
castellana.props.onClick();
assert.equal(selection, 'z:Castellana');

const { AdMap } = loadComponent('components/admin/particulares/ad-map.tsx', [null, null, 'idle', 1024]);
const exact = { lat: 40.427, lng: -3.686, precision: 'exact' };
const approx = { ...exact, precision: 'approximate' };
const renderMap = (point, estimate = null) => renderToStaticMarkup(loadComponent('components/admin/particulares/ad-map.tsx', [null, null, 'idle', 1024]).AdMap({ resolvedLocation: { point, estimate }, height: 288 }));
assert.match(renderMap(exact), /tile.openstreetmap.org/);
assert.match(renderMap(exact), /Pin del anuncio/);
assert.doesNotMatch(renderMap(exact), /rounded-full border border-gold/);
assert.match(renderMap(approx), /rounded-full border border-gold/);
assert.match(renderMap(approx, { ...exact, lng: -3.684 }), /Punto según la dirección/);
assert.doesNotMatch(renderMap(exact, { ...exact, lng: -3.686 }), /Punto según la dirección/);
console.log('Particulares: neighborhood selection and shared map presentation passed.');

async function checkResolution() {
  const { resolveShareLocation } = loadComponent('lib/particulares/share-location.ts');
  const row = { latitude: 40.427, longitude: -3.686, location_precision: 'exact', address: 'Calle de Goya, 36', zone: 'Goya' };
  const noLookup = async () => { throw new Error('Exact points do not need geocoding'); };
  assert.deepEqual(await resolveShareLocation(row, noLookup), { point: exact, estimate: null });
  const lookup = async q => {
    assert.match(q, /Calle de Goya, 36/);
    return { lat: 40.428, lng: -3.684, hasHouseNumber: true };
  };
  const pair = await resolveShareLocation({ ...row, location_precision: 'approximate' }, lookup);
  assert.equal(pair.point.precision, 'approximate');
  assert.equal(pair.estimate.lng, -3.684);
  const geocoded = await resolveShareLocation({ address: row.address, zone: 'Goya' }, lookup);
  assert.equal(geocoded.point.precision, 'approximate');
  assert.equal(geocoded.estimate, null);
  const zone = await resolveShareLocation({ zone: 'Recoletos' }, async () => ({ lat: 40.42, lng: -3.68, hasHouseNumber: false }));
  assert.equal(zone.point.precision, 'zone');
  assert.deepEqual(await resolveShareLocation({}, noLookup), { point: null, estimate: null });
  assert.deepEqual(await resolveShareLocation({ ...row, location_precision: 'approximate' }, async () => null), { point: approx, estimate: null });
  assert.ok(!('address' in pair));
  console.log('Particulares: exact, approximate, address estimate, zone and geocoder failure passed.');
}
checkResolution().catch(e => { console.error(e); process.exitCode = 1; });
