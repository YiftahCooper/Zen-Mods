// Builds the published Sine runtime folder <repo>/context-menu-editor/ from this
// development folder. `node build.mjs --check` writes nothing and fails unless the
// runtime folder holds exactly the files this build would produce, byte for byte.
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir, rename, unlink, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {posix} from 'node:path';

const root = new URL('./', import.meta.url);
const runtimeRoot = new URL('../../context-menu-editor/', root);
const require = createRequire(new URL('.backup-scratch/deps/package.json', root));
const {build} = require('esbuild');

// Hand-edited runtime files, copied unchanged. Directories are copied recursively.
const STATIC_FILES = ['theme.json', 'preferences.json', 'style.css', 'README.md', 'LICENSE', 'THIRD_PARTY.md',
  'assets/catalog.json', 'assets/zen-browser-icons.json'];
const STATIC_DIRECTORIES = ['licenses', 'assets/packs'];
const BUNDLE = 'context-menu-editor.uc.js';

async function listFiles(base, relative) {
  const entries = await readdir(new URL(relative + '/', base), {withFileTypes: true}).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = relative + '/' + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(base, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function listRuntime() {
  const entries = await readdir(runtimeRoot, {withFileTypes: true}).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) files.push(...await listFiles(runtimeRoot, entry.name));
    else if (entry.isFile()) files.push(entry.name);
  }
  return files.sort();
}

const manifest = JSON.parse(await readFile(new URL('theme.json', root), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('theme.json needs a plain x.y.z version.');

const sources = {name: 'local-sources', setup(builder) {
  builder.onResolve({filter: /.*/}, args => {
    const path = posix.normalize(posix.join(args.importer ? posix.dirname(args.importer) : '', args.path));
    const allowed = (path.startsWith('src/') && /\.m?js$/.test(path)) || path === 'assets/catalog.json';
    if (!allowed) throw new Error('Unexpected bundle input: ' + path);
    return {path, namespace: 'project'};
  });
  builder.onLoad({filter: /.*/, namespace: 'project'}, async args => ({
    contents: await readFile(new URL(args.path, root), 'utf8'),
    loader: args.path.endsWith('.json') ? 'json' : 'js',
  }));
}};

const result = await build({
  entryPoints: ['src/entry.mjs'], absWorkingDir: fileURLToPath(root), plugins: [sources],
  tsconfigRaw: {compilerOptions: {}}, bundle: true, format: 'iife', platform: 'browser',
  target: 'firefox128', write: false, charset: 'utf8',
  banner: {js: '// Context Menu Editor ' + manifest.version + ' — generated from src/entry.mjs.\n' +
    '// Run node build.mjs; native qualification is reported separately.'},
});

const expected = new Map([[BUNDLE, Buffer.from(result.outputFiles[0].text, 'utf8')]]);
for (const name of STATIC_FILES) expected.set(name, await readFile(new URL(name, root)));
for (const directory of STATIC_DIRECTORIES) {
  for (const name of await listFiles(root, directory)) expected.set(name, await readFile(new URL(name, root)));
}

const actual = await listRuntime();
const missing = [...expected.keys()].filter(name => !actual.includes(name)).sort();
const extra = actual.filter(name => !expected.has(name));
const changed = [];
for (const [name, bytes] of expected) {
  if (missing.includes(name)) continue;
  const current = await readFile(new URL(name, runtimeRoot));
  if (!current.equals(bytes)) changed.push(name);
}

if (process.argv.includes('--check')) {
  if (missing.length || extra.length || changed.length) {
    for (const [label, names] of [['missing', missing], ['unexpected', extra], ['different', changed]]) {
      for (const name of names) console.error(label + ': context-menu-editor/' + name);
    }
    console.error('FAIL: the runtime folder does not match this source. Run npm run build.');
    process.exitCode = 1;
  } else {
    console.log('PASS: context-menu-editor/ matches the build (' + expected.size + ' files).');
  }
} else {
  const scratch = new URL('.backup-scratch/build/', root);
  await mkdir(scratch, {recursive: true});
  for (const name of [...missing, ...changed]) {
    const target = new URL(name, runtimeRoot);
    await mkdir(new URL('./', target), {recursive: true});
    const temporary = new URL('part-' + process.pid + '-' + name.replaceAll('/', '_'), scratch);
    try {
      await writeFile(temporary, expected.get(name));
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  for (const name of extra) await unlink(new URL(name, runtimeRoot));
  console.log('Built context-menu-editor/: ' + (missing.length + changed.length) + ' written, ' +
    extra.length + ' removed, ' + expected.size + ' files (' + BUNDLE + ' ' + expected.get(BUNDLE).length + ' bytes).');
}
