import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import { createRequire } from 'module';
import { typing, getArgs, downloadMedia, sleep, msg, ProgressMessage } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

const require = createRequire(import.meta.url);
const JSEncrypt = require('jsencrypt');

const TEMPMAIL_API = 'https://email.gue.lol';
const API_BASE = 'https://apiv1.deepfakemaker.io/api';
const DEEPFAKE_API = `${API_BASE}/user/api`;
// Prefer domains known to receive DeepFakeMaker mail via email.gue.lol
const DOMAINS = ['dracinku.app', 'dracinku.my.id', 'nbteam.dev', 'dramastream.dev', 'pastego.my.id'];
const PASSWORD = 'SudahiBirahiMuKawan';

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDa2oPxMZe71V4dw2r8rHWt59gH
W5INRmlhepe6GUanrHykqKdlIB4kcJiu8dHC/FJeppOXVoKz82pvwZCmSUrF/1yr
rnmUDjqUefDu8myjhcbio6CnG5TtQfwN2pz3g6yHkLgp8cFfyPSWwyOCMMMsTU9s
snOjvdDb4wiZI8x3UwIDAQAB
-----END PUBLIC KEY-----`;

const SIGN_SECRET = 'NHGNy5YFz7HeFb';
const APP_ID = 'ai_df';

const NAMES = [
  'adi', 'agus', 'aditya', 'ahmad', 'ali', 'andi', 'angga', 'ani', 'anisa',
  'arif', 'ayu', 'bayu', 'budi', 'candra', 'dani', 'dedi', 'desi', 'dewi',
  'dian', 'dika', 'dimas', 'dwi', 'eka', 'eko', 'endang', 'eni', 'fajar',
  'fitri', 'galih', 'gunawan', 'hadi', 'hendra', 'heri', 'ika', 'ilham',
  'imam', 'indah', 'indra', 'irma', 'joko', 'kurnia', 'lina', 'lisa',
  'maya', 'mega', 'muhammad', 'nanda', 'novi', 'nurul', 'putra', 'putri',
  'rani', 'ratna', 'reza', 'rika', 'rini', 'rizal', 'rizki', 'sari',
  'siti', 'sri', 'suci', 'susi', 'tia', 'tika', 'tri', 'wahyu', 'wati',
  'wulan', 'yani', 'yuli', 'yuni', 'yusuf', 'zainal', 'herawati',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEmail() {
  const name = NAMES[randomInt(0, NAMES.length - 1)];
  const num = randomInt(100000, 999999);
  const domain = DOMAINS[randomInt(0, DOMAINS.length - 1)];
  return `${name}${num}@${domain}`;
}

function getTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function randomString(len) {
  let res = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

function getNonce() {
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
  );
}

function encryptAES(text, key, iv) {
  const k = CryptoJS.enc.Utf8.parse(key);
  const v = CryptoJS.enc.Utf8.parse(iv);
  const s = CryptoJS.enc.Utf8.parse(text);
  const encrypted = CryptoJS.AES.encrypt(s, k, {
    iv: v,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.toString();
}

function generateSignParams(extraParams = {}) {
  const t = getTimestamp();
  const nonce = getNonce();
  const aesKey = randomString(16);

  const jsEncrypt = new JSEncrypt();
  jsEncrypt.setPublicKey(PUBLIC_KEY);
  const secretKey = jsEncrypt.encrypt(aesKey);

  const signPayload = `${APP_ID}:${SIGN_SECRET}:${t}:${nonce}:${secretKey}`;
  const sign = encryptAES(signPayload, aesKey, aesKey);

  return {
    app_id: APP_ID,
    t,
    nonce,
    sign,
    secret_key: secretKey,
    uid: getNonce(),
    ...extraParams,
  };
}

function processUploadUrl(url) {
  try {
    const match = url.match(/https?:\/\/[^\s]+?\.(?:jpg|png|jpeg|webp)(?=\?|$)/i);
    const clean = match ? match[0] : url.split('?')[0];
    return clean.replace(/mrpa-chatpdf\.oss-us-west-1\.aliyuncs\.com/, 'cdn.deepfakemaker.io');
  } catch {
    return url;
  }
}

async function apiRequest(url, method = 'GET', body = {}, token = null) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    origin: 'https://deepfakemaker.io',
    referer: 'https://deepfakemaker.io/',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, httpCode: res.status };
  }
}

async function getInbox(address) {
  const url = `${TEMPMAIL_API}/api/emails?address=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Inbox fetch failed: ${res.status}`);
  return res.json();
}

async function getEmailDetail(id) {
  const url = `${TEMPMAIL_API}/api/emails/${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Email detail fetch failed: ${res.status}`);
  return res.json();
}

async function register(email, password) {
  const url = `${DEEPFAKE_API}/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      origin: 'https://deepfakemaker.io',
      referer: 'https://deepfakemaker.io/',
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function login(email, password) {
  const url = `${DEEPFAKE_API}/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      origin: 'https://deepfakemaker.io',
      referer: 'https://deepfakemaker.io/',
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function checkCredit(token) {
  const params = generateSignParams({ country_code: 'ID' });
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/user/v2/credit?${qs}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      origin: 'https://deepfakemaker.io',
      referer: 'https://deepfakemaker.io/',
      'content-type': 'application/json',
    },
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function claimReward(token) {
  const params = generateSignParams();
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/user/v2/reward?${qs}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      origin: 'https://deepfakemaker.io',
      referer: 'https://deepfakemaker.io/',
    },
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractAllLinks(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>"'\]]+/g);
  return (matches || []).map((u) => u.replace(/[.,;:)\]]+$/, ''));
}

function pickVerifyLink(links) {
  if (!links?.length) return null;
  return (
    links.find((l) => /register\/verify|verify\?token|activate|confirm/i.test(l)) ||
    links.find((l) => /deepfakemaker\.io/i.test(l) && /token|verify/i.test(l)) ||
    links.find((l) => /deepfakemaker\.io/i.test(l)) ||
    null
  );
}

function extractVerificationLink(html, textBody) {
  const fromHtml = extractAllLinks(html || '');
  const fromText = extractAllLinks(textBody || '');
  const hrefMatches = (html || '').match(/href=["'](https?:\/\/[^"']+)["']/gi) || [];
  const fromHref = hrefMatches
    .map((h) => {
      const m = h.match(/https?:\/\/[^"']+/);
      return m ? m[0] : null;
    })
    .filter(Boolean);

  return pickVerifyLink([...fromText, ...fromHref, ...fromHtml]);
}

async function waitForVerificationEmail(address, maxWaitMs = 180000) {
  const startTime = Date.now();
  const pollInterval = 2500;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const inbox = await getInbox(address);

      if (inbox && inbox.length > 0) {
        for (const email of inbox) {
          const detail = await getEmailDetail(email.id);
          const verifyLink = extractVerificationLink(detail.html_body, detail.text_body);

          if (verifyLink) {
            return { email: detail, verifyLink };
          }

          if (
            email.from_address?.includes('deepfake') ||
            /verif|confirm|activate|register|welcome|account/i.test(email.subject || '')
          ) {
            const allLinks = extractAllLinks(`${detail.html_body || ''}\n${detail.text_body || ''}`);
            if (allLinks.length > 0) {
              return { email: detail, verifyLink: pickVerifyLink(allLinks) || allLinks[0], allLinks };
            }
          }
        }
      }
    } catch {
      // ignore polling errors
    }

    await sleep(pollInterval);
  }

  return null;
}

async function visitVerificationLink(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        referer: 'https://deepfakemaker.io/',
      },
      redirect: 'follow',
    });
    return { status: res.status, url: res.url };
  } catch {
    return null;
  }
}

async function getUploadSign(token, filename, hash, isVerify = false) {
  const params = generateSignParams();
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/user/v2/upload-sign?${qs}`;
  return apiRequest(url, 'POST', { filename, hash, is_verify: isVerify }, token);
}

async function directUpload(signedUrl, buffer, contentType) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: buffer,
    redirect: 'follow',
  });
  return res.status === 200;
}

async function uploadImage(token, buffer, mimetype) {
  const ext = (mimetype || 'image/jpeg').includes('png')
    ? 'png'
    : (mimetype || '').includes('webp')
      ? 'webp'
      : 'jpg';
  const filename = `upload_${Date.now()}.${ext}`;
  const contentType = mimetype || 'image/jpeg';

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const signRes = await getUploadSign(token, filename, hash, false);

  if (signRes.code !== 200 || !signRes.data?.url) {
    throw new Error(`Upload sign failed: ${signRes.msg || JSON.stringify(signRes)}`);
  }

  const signedUrl = signRes.data.url;
  const ok = await directUpload(signedUrl, buffer, contentType);
  if (!ok) throw new Error('Direct upload to OSS failed');

  return processUploadUrl(signedUrl);
}

function totalCredits(creditRes) {
  const d = creditRes?.data || {};
  return (
    (Number(d.rewardPoints) || 0) +
    (Number(d.purchasePoints) || 0) +
    (Number(d.gift_credits) || 0)
  );
}

function friendlyApiError(result) {
  const msg = String(result?.msg || result?.message || '');
  const code = result?.code;

  if (/total_points|NoneType/i.test(msg)) {
    return 'Server credit error (total_points). Try again in a moment.';
  }
  if (code === 50004 || /busy/i.test(msg)) {
    return 'Server is busy. Please try again in a few minutes.';
  }
  if (code === 401 || code === 410001) {
    return 'Auth/credits error. Token expired or not enough credits.';
  }
  if ([40270, 40271, 40203, 40204].includes(code)) {
    return `Generation failed (${code}): ${msg || 'unknown'}`;
  }
  return msg || `API error (${code ?? 'unknown'})`;
}

async function createClothesRemoverTask(token, imageUrl, prompt, maxRetries = 3) {
  const payload = { prompt, image: imageUrl, platform: 'remover' };
  let last = null;

  for (let i = 1; i <= maxRetries; i++) {
    const params = generateSignParams();
    const qs = new URLSearchParams(params).toString();
    const url = `${API_BASE}/img/v1/clothes/remover/task?${qs}`;
    last = await apiRequest(url, 'POST', payload, token);

    if (
      last?.code === 200 ||
      last?.code === 20000 ||
      last?.code === 20011 ||
      last?.data?.task_id ||
      last?.data?.job_id ||
      last?.data?.generate_url
    ) {
      return last;
    }

    const msg = String(last?.msg || '');
    if (last?.code === 50004 || /busy|total_points|NoneType|try again/i.test(msg)) {
      await sleep(3000 * i);
      continue;
    }

    break;
  }

  throw new Error(friendlyApiError(last || {}));
}

async function getTaskStatus(token, taskId) {
  const params = generateSignParams();
  params.task_id = taskId;
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/img/v1/clothes/remover/task?${qs}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    origin: 'https://deepfakemaker.io',
    referer: 'https://deepfakemaker.io/',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function pollTask(token, taskId, bar, intervalMs = 10000, maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getTaskStatus(token, taskId);

    if (result.code === 20000 && result.data?.generate_url) {
      return result;
    }

    if (result.code === 401 || result.code === 410001) {
      throw new Error(`Auth error (${result.code}): ${result.msg || 'Token expired or credits exhausted'}`);
    }

    if ([40270, 40271, 40203, 40204].includes(result.code)) {
      throw new Error(`Task failed (${result.code}): ${result.msg || 'Generation failed'}`);
    }

    // Update spinner/stage while waiting for queue generation
    const percent = Math.min(95, Math.round((attempt / maxAttempts) * 100));
    await bar.update(`🎨 Generating AI result... (Attempt ${attempt}/${maxAttempts})`, percent);

    await sleep(intervalMs);
  }

  throw new Error('Polling timeout — task did not complete in time');
}

async function createSession(bar, maxRetries = 3) {
  const password = PASSWORD;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const email = generateEmail();

    try {
      await bar.stage(`Creating temporary account (${attempt}/${maxRetries})...`);
      const reg = await register(email, password);
      if (reg.status >= 500) {
        throw new Error(`Register failed (${reg.status})`);
      }

      await bar.stage('Waiting for verification email...');
      const verifyResult = await waitForVerificationEmail(email, 180000);
      if (!verifyResult?.verifyLink) {
        throw new Error('Failed to receive verification email');
      }

      await bar.stage('Verifying account...');
      await visitVerificationLink(verifyResult.verifyLink);
      await sleep(2500);

      await bar.stage('Logging in to session...');
      const loginResult = await login(email, password);
      const token =
        loginResult.data?.token ||
        loginResult.data?.access_token ||
        loginResult.data?.data?.token;

      if (!token) {
        throw new Error(loginResult.data?.msg || 'Login failed, could not get token');
      }

      try {
        await claimReward(token);
      } catch {
        // reward is optional
      }

      return { email, password, token };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(1500);
      }
    }
  }

  throw lastError || new Error('Failed to create session after retries');
}

export default plugin('deepmaker', 'remover', 'undress')
  .in('ai')
  .desc('AI Clothes Remover using DeepFakeMaker')
  .prefixOnly()
  .ai({
    trigger: 'User asks to remove clothes from an image using AI',
    examples: [
      'deepmaker remove all clothes',
      'remover naked body',
      'undress change to bikini',
    ],
    args: { input: 'Prompt (reply/send image)' },
  })
  .run(async (sock, { body, message, raw, from }) => {
    const prompt = getArgs(body) || 'remove all clothes, naked body';
    const bar = new ProgressMessage(sock, from, raw);
    
    const result = await downloadMedia(raw, message.quoted, ['image']);
    if (!result) {
      return sock.sendMessage(from, { text: msg('need.image') }, { quoted: raw });
    }

    await typing(sock, from);
    await bar.start('⏳ Initializing DeepFakeMaker session...');

    try {
      const session = await createSession(bar, 3);

      await bar.update('🔍 Checking account credits...', 40);
      const creditRes = await checkCredit(session.token);
      const credits = totalCredits(creditRes);
      if (credits < 20) {
        throw new Error(`Not enough credits (${credits}). Need at least 20. Try again later.`);
      }

      await bar.update(`📤 Uploading image to cloud... (Credits: ${credits})`, 60);
      const cdnUrl = await uploadImage(session.token, result.buffer, result.mimetype);

      await bar.update('🎨 Submitting generation task...', 75);
      const taskResult = await createClothesRemoverTask(
        session.token,
        cdnUrl,
        prompt,
        4
      );

      let generateUrl = taskResult.data?.generate_url;
      const taskId = taskResult.data?.task_id || taskResult.data?.job_id;

      if (!generateUrl && taskId) {
        const pollResult = await pollTask(session.token, taskId, bar);
        generateUrl = pollResult.data?.generate_url;
      }

      if (!generateUrl) {
        throw new Error(friendlyApiError(taskResult) || 'Generate URL not found');
      }

      await bar.done('✅ Generation complete! Sending result...');

      await sock.sendMessage(
        from,
        {
          image: { url: generateUrl },
          caption: `🎨 *AI DeepFakeMaker*\n\n*Prompt:* ${prompt}`,
        },
        { quoted: raw }
      );
    } catch (e) {
      const errMsg = String(e.message || e);
      await bar.fail(msg('fail.generic', {
        msg: /total_points|NoneType/i.test(errMsg)
          ? 'Server credit error. Please try again in a few minutes.'
          : errMsg,
      }));
    }
  });
