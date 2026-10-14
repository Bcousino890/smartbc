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
  mod.require = (name) => name === 'react' ? {
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

const { ParticularLocation } = loadComponent('app/a/[token]/particular-location.tsx');
const map = (props) => renderToStaticMarkup(ParticularLocation(props));
assert.match(map({ zone: 'Recoletos', latitude: 40.427, longitude: -3.686 }), /marker=40.427,-3.686/);
assert.match(map({ zone: 'Castellana', latitude: null, longitude: null }), /Castellana%2C%20Madrid%2C%20Espa%C3%B1a/);
assert.match(map({ zone: 'Recoletos', latitude: 91, longitude: -3.686 }), /Zona aproximada/);
assert.equal(map({ zone: null, latitude: null, longitude: null }), '');
assert.equal(map({ zone: null, latitude: NaN, longitude: 0 }), '');
console.log('Particulares: neighborhood selection and public location map passed.');
