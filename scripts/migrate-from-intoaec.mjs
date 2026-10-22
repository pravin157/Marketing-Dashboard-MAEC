import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dstRoot = path.resolve(__dirname, '..');
const srcRoot = path.resolve(dstRoot, '..', 'marketing_dashboard');

function brand(text) {
  return text
    .replace(/IntoAEC/g, 'MAEC')
    .replace(/intoaec\.ai/g, 'maec.ai')
    .replace(/intoaec\.com/g, 'maec.ai')
    .replace(/@intoaec/g, '@maec')
    .replace(/intoaec/gi, 'maec')
    .replace(/<span class="brand-mark">IA<\/span>/g, '<span class="brand-mark">MA</span>');
}

const dirs = [
  'src/lib',
  'src/styles',
  'src/components',
  'src/app/api/data',
  'src/app/api/refresh',
  'src/app/api/analytics/countries',
  'src/app/api/analytics/dimension-values',
  'src/app/api/analytics/filter',
  'src/app/api/gsc',
  'src/app/api/gsc/sites',
  'src/app/api/gsc/page-indexing',
  'src/app/api/gsc/indexing',
  'src/app/api/gsc/indexing/inspect',
  'src/app/api/gsc/url-inspection',
  'src/app/api/core-web-vitals',
  'src/app/api/pagespeed/analyze',
  'public/js',
  'data',
];

for (const d of dirs) {
  fs.mkdirSync(path.join(dstRoot, d), { recursive: true });
}

function patchBackend(content, filename) {
  let out = brand(content);
  out = out.replace(
    /dotenv\.config\(\{\s*path:\s*path\.join\(__dirname,\s*'\.env'\)\s*\}\);/g,
    "dotenv.config({ path: path.join(process.cwd(), '.env') });"
  );
  if (filename === 'gsc.js') {
    out = out.replace(
      /const DB_FILE = path\.join\(__dirname, 'gsc_url_inspections\.json'\);/,
      "const DB_FILE = path.join(process.cwd(), 'data', 'gsc_url_inspections.json');"
    );
  }
  return out;
}

for (const file of ['analysis.js', 'gsc.js', 'pagespeed.js']) {
  const raw = fs.readFileSync(path.join(srcRoot, file), 'utf8');
  fs.writeFileSync(path.join(dstRoot, 'src/lib', file), patchBackend(raw, file));
  console.log('copied', file);
}

const bench = brand(fs.readFileSync(path.join(srcRoot, 'benchmarks_config.js'), 'utf8'));
fs.writeFileSync(path.join(dstRoot, 'public/benchmarks_config.js'), bench);
fs.writeFileSync(path.join(dstRoot, 'src/lib/benchmarks_config.js'), bench);
console.log('copied benchmarks_config.js');

const html = fs.readFileSync(path.join(srcRoot, 'index.html'), 'utf8');
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = html.match(/<body>([\s\S]*?)<script>/);
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);

if (!styleMatch || !bodyMatch || !scriptMatch) {
  console.error('Failed to parse index.html parts', {
    style: !!styleMatch,
    body: !!bodyMatch,
    script: !!scriptMatch,
  });
  process.exit(1);
}

fs.writeFileSync(path.join(dstRoot, 'src/styles/dashboard.css'), brand(styleMatch[1]));
console.log('wrote dashboard.css', styleMatch[1].length);

const bodyHtml = brand(bodyMatch[1].trim());
fs.writeFileSync(path.join(dstRoot, 'src/lib/dashboard-body.html'), bodyHtml);
console.log('wrote dashboard-body.html', bodyHtml.length);

let script = brand(scriptMatch[1]);
const readyHelper = `
function __maecOnReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}
`;
script = readyHelper + script.replace(
  /document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{/g,
  '__maecOnReady(() => {'
);

fs.writeFileSync(path.join(dstRoot, 'public/js/dashboard-app.js'), script);
console.log('wrote dashboard-app.js', script.length);

fs.writeFileSync(
  path.join(dstRoot, 'data/gsc_url_inspections.json'),
  JSON.stringify({ pages: {} }, null, 2)
);
console.log('migration complete');
