#!/usr/bin/env node
// Cross-platform static scanner for risky patterns in VanillaDatabase source.
// Usage: node .claude/skills/vanilla-frontend-security/scripts/scan.mjs [target=frontend|server|all] [--json]
// Output lists leads for manual triage; a hit is NOT a confirmed vulnerability.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) ?? 'frontend';
const asJson = args.includes('--json');
const showInfo = args.includes('--info');
const root = process.cwd();

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'data', '.claude', 'vanilladatabase', 'docs', 'tests', 'examples']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html']);

const RULES = {
  frontend: [
    ['XSS-SINK', 'high', /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/],
    ['CODE-EXEC', 'high', /\beval\s*\(|new Function\s*\(|set(Timeout|Interval)\(\s*['"`]/],
    ['TOKEN-STORAGE', 'medium', /(localStorage|sessionStorage)\.(setItem|getItem)\([^)]*(token|jwt|session|secret|key)/i],
    ['COOKIE-ACCESS', 'medium', /document\.cookie/],
    ['OPEN-REDIRECT', 'medium', /location\.(href|assign|replace)\s*(=|\()\s*[^'"`\s]/],
    ['WINDOW-OPEN', 'low', /window\.open\(/],
    ['BLANK-NO-REL', 'low', /target=["']_blank["'](?![^>]*noopener)/],
    ['POSTMESSAGE', 'medium', /postMessage\(|addEventListener\(\s*['"]message['"]/],
    ['JS-URL', 'high', /href=\{[^}]*\}|src=\{[^}]*\}/],
    ['SECRET-LOG', 'medium', /console\.(log|debug|info)\([^)]*(token|password|secret|apikey)/i],
    ['PROTO-POLLUTION', 'medium', /__proto__|Object\.assign\(\s*\{\}\s*,\s*(req|data|payload|body|json)/i],
    ['REGEX-DOS', 'low', /\([^)]*[+*]\)[+*]|\(\.\*\)[+*]/],
    ['NON-NULL-API', 'info', /await\s+res\.json\(\)\)\s*as\s+/],
    ['TS-ANY', 'info', /:\s*any\b|as any\b/],
    ['TODO-FIXME', 'info', /TODO|FIXME|HACK|XXX/],
  ],
  server: [
    ['SQL-CONCAT', 'high', /(prepare|exec|run|all|get)\(\s*[`'"][^`'"]*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)[^`'"]*\$\{/i],
    ['SQL-PLUS', 'high', /(SELECT|INSERT|UPDATE|DELETE)[^;\n]*['"]\s*\+\s*\w+/i],
    ['PATH-JOIN-INPUT', 'high', /(path\.)?(join|resolve)\([^)]*(req\.|params|query|body|filename|name)/],
    ['CHILD-PROCESS', 'high', /child_process|\b(exec|execSync|spawn)\s*\(/],
    ['FETCH-USER-URL', 'high', /fetch\(\s*(req\.|body\.|url\b|target)/],
    ['JSON-PARSE-RAW', 'low', /JSON\.parse\(\s*(req\.|body)/],
    ['WEAK-RANDOM', 'medium', /Math\.random\(\)/],
    ['WEAK-HASH', 'medium', /createHash\(\s*['"](md5|sha1)['"]/],
    ['TIMING-COMPARE', 'medium', /(password|token|signature|hmac|secret)\w*\s*(===|!==)\s*/i],
    ['SECRET-LOG', 'medium', /log(ger)?\.(info|error|warn|debug)\([^)]*(password|token|secret|apikey)/i],
    ['FK-OFF', 'high', /foreign_keys\s*=\s*(OFF|0)/i],
    ['WAL-OFF', 'high', /journal_mode\s*=\s*(DELETE|OFF|TRUNCATE|MEMORY)/i],
    ['EMPTY-CATCH', 'low', /catch\s*(\([^)]*\))?\s*\{\s*\}/],
    ['STACK-TO-CLIENT', 'medium', /error:\s*(err|e|error)\.stack/],
    ['CORS-WILDCARD', 'medium', /origin:\s*(true|['"]\*['"])/],
    ['TODO-FIXME', 'info', /TODO|FIXME|HACK|XXX/],
  ],
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (EXTS.has(extname(name))) yield full;
  }
}

const isServerFile = (rel) => rel.replaceAll('\\', '/').startsWith('src/server/');
const sets = target === 'all' ? ['frontend', 'server'] : [target];
const findings = [];

for (const file of walk(root)) {
  const rel = relative(root, file);
  const server = isServerFile(rel);
  for (const set of sets) {
    if ((set === 'server') !== server && !(set === 'frontend' && rel === 'index.html')) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [id, severity, re] of RULES[set]) {
        if (re.test(line)) findings.push({ id, severity, file: rel.replaceAll('\\', '/'), line: i + 1, code: line.trim().slice(0, 140) });
      }
    });
  }
}

const order = { high: 0, medium: 1, low: 2, info: 3 };
const visible = showInfo ? findings : findings.filter((f) => f.severity !== 'info');
visible.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
findings.length = 0;
findings.push(...visible);

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const counts = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  console.log(`[NOTE] target=${target} leads=${findings.length} ${JSON.stringify(counts)}`);
  for (const f of findings) console.log(`[${f.severity.toUpperCase()}] ${f.id} ${f.file}:${f.line}  ${f.code}`);
}
