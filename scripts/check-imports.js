import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, normalize, relative } from 'path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.git', 'dashboard-client', 'session', 'database']);

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) yield* walk(full);
        else if (/\.(c?js)$/.test(name)) yield full;
    }
}

const exportCache = new Map();
function exportsOf(file, seen = new Set()) {
    if (seen.has(file) || !existsSync(file)) return new Set();
    seen.add(file);
    if (exportCache.has(file) && seen.size === 1) return exportCache.get(file);

    const text = readFileSync(file, 'utf8');
    const out = new Set();
    for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/gm)) out.add(m[1]);
    for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop();
            if (name) out.add(name);
        }
    }
    if (/^export\s+default/m.test(text)) out.add('default');
    for (const m of text.matchAll(/^export\s*\*\s*from\s*'(\.[^']+)'/gm)) {
        for (const n of exportsOf(normalize(join(dirname(file), m[1])), seen)) out.add(n);
    }
    if (seen.size === 1) exportCache.set(file, out);
    return out;
}

let checked = 0;
const problems = [];

for (const file of walk(ROOT)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)(['"])(\.[^'"]+)\1/g)) {
        if (m[2].includes('${')) continue;
        checked++;
        if (!existsSync(normalize(join(dirname(file), m[2])))) problems.push(`missing file   ${rel} -> ${m[2]}`);
    }

    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
        const target = normalize(join(dirname(file), m[2]));
        if (!existsSync(target)) continue;
        const available = exportsOf(target);
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (name && !available.has(name)) problems.push(`missing export ${rel} imports "${name}" from ${m[2]}`);
        }
    }
}

if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\n❌ ${problems.length} import problem(s) in ${checked} imports.`);
    process.exit(1);
}
console.log(`✅ ${checked} imports OK`);
