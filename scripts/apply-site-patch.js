import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);
const report = [];

function edit(file, label, fn) {
    if (!fs.existsSync(path.join(root, file))) { report.push(`✗ ${label}: ${file} tidak ditemukan`); return; }
    const before = read(file);
    const after = fn(before);
    if (after === null) { report.push(`✗ ${label}: pola tidak ditemukan di ${file}`); return; }
    if (after === before) { report.push(`= ${label}: sudah terpasang`); return; }
    write(file, after);
    report.push(`✓ ${label}`);
}

edit('src/dashboard/tunnel.js', 'export ensureBinary', (s) => {
    if (/export\s+async\s+function\s+ensureBinary/.test(s)) return s;
    if (!/async\s+function\s+ensureBinary\s*\(/.test(s)) return null;
    return s.replace(/async\s+function\s+ensureBinary\s*\(/, 'export async function ensureBinary(');
});

edit('src/ai/tools.js', 'import SITE_TOOL_DEFS', (s) => {
    if (s.includes('SITE_TOOL_DEFS')) return s;
    const q = String.fromCharCode(39);
    const imp = 'import { BROWSER_TOOL_DEFS } fr' + 'om ' + q + './browser.js' + q + ';';
    if (!s.includes(imp)) return null;
    return s.replace(imp, imp + '\nimport { SITE_TOOL_DEFS } fr' + 'om ' + q + './site-deploy.js' + q + ';');
});

edit('src/ai/tools.js', 'register SITE_TOOL_DEFS', (s) => {
    if (/\.\.\.SITE_TOOL_DEFS/.test(s)) return s;
    if (!/\.\.\.BROWSER_TOOL_DEFS\)/.test(s)) return null;
    return s.replace(/\.\.\.BROWSER_TOOL_DEFS\)/, '...BROWSER_TOOL_DEFS, ...SITE_TOOL_DEFS)');
});

const RULE = '\n31. DEPLOY SITUS UJI (owner): kalau owner minta situs/halaman dicoba online atau dibagikan lewat link, tulis semua file STATIS (HTML/CSS/JS/gambar) dengan sandbox_write ke sites/<nama>/ (wajib ada index.html), lalu panggil site_deploy <nama> [ttl=menit]. Kirim URL https yang dikembalikan apa adanya, jangan mengarang URL. site_list untuk melihat yang aktif, site_stop <nama|all> untuk mematikan. Situs mati otomatis (default 60 menit), maksimal 3 aktif, hanya file statis (tidak ada backend). Link publik: jangan taruh API key, token, atau data pribadi di file situs.\n';

edit('src/ai/prompts/rules-tools.txt', 'tambah aturan 31', (s) => {
    if (s.includes('site_deploy')) return s;
    return s.replace(/\s*$/, '\n') + RULE.replace(/^\n/, '');
});

console.log(report.join('\n'));
if (report.some((r) => r.startsWith('✗'))) process.exitCode = 1;
