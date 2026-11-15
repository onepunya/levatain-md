import fs from 'fs';
import path from 'path';
import { llmApi } from '../src/api/llm.js';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
    console.error('Pakai: node scripts/test-vision.js <gambar.jpg|png|webp> ["pertanyaan"]');
    process.exit(1);
}

const ext = path.extname(file).slice(1).toLowerCase();
const mimetype = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
if (!mimetype) {
    console.error('Format harus jpg, png, atau webp.');
    process.exit(1);
}

const image = {
    buffer: fs.readFileSync(file),
    mimetype,
    filename: `test-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`,
    path: null,
};
const question = process.argv[3] || 'Gambar ini isinya apa? Jawab singkat.';

try {
    const reply = await llmApi.chatAI([{ role: 'user', content: question }], '', [image]);
    console.log(image.path ? `upload ok: ${image.path}` : 'upload: tidak lewat jalur cookie');
    console.log(reply);
    process.exit(0);
} catch (e) {
    console.error(`GAGAL: ${e.message}`);
    process.exit(1);
}
