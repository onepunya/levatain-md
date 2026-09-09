import { api } from '../../src/lib/api.js';
import { logger } from '../../src/lib/logger.js';

export const meta = {
    cmd:  ['tod', 'truth', 'dare'],
    tag:  'fun',
    aliasOnly: true,
    cooldown: 3,
    desc: 'Truth or Dare, pertanyaan/tantangan digenerate AI biar selalu beda',
    ai: {
        trigger: 'User mau main truth or dare, atau minta tantangan/pertanyaan truth',
        examples: ['tod', 'truth', 'dare'],
    },
};

const FALLBACK_TRUTH = [
    'Siapa gebetan/crush kamu sekarang?',
    'Chat paling receh apa yang pernah kamu kirim ke gebetan?',
    'Pernah stalking mantan sampai jam berapa?',
];
const FALLBACK_DARE = [
    'Kirim voice note nyanyi lagu galau selama 15 detik ke grup.',
    'Ganti nama WhatsApp jadi "Raja/Ratu Baper" selama 1 jam.',
    'Chat mantan "hai, apa kabar?" (screenshot boleh disensor).',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SYSTEM_PROMPT = `Kamu generator pertanyaan game Truth or Dare buat grup WhatsApp anak muda Indonesia.
Gaya bahasa gaul, santai, receh, kadang gombal/baper dikit, TAPI tetap sopan — DILARANG keras: konten seksual/vulgar, ajakan hal ilegal/berbahaya, body shaming, SARA, atau hal yang bisa mempermalukan/menyakiti orang secara serius.
Balas HANYA dengan satu kalimat pertanyaan/tantangan itu sendiri, tanpa embel-embel, tanpa tanda kutip, tanpa penjelasan, tanpa nomor, dan jelas masuk akal, kamu juga boleh tanya hal pribadi.`;

async function generateWithAI(type, pushname) {
    const isTruth = type === 'truth';
    const userPrompt = isTruth
        ? `Buatkan SATU pertanyaan TRUTH yang receh/lucu/dikit baper buat "${pushname || 'seseorang'}" di grup WhatsApp. Jangan terlalu personal/sensitif, jangan menyinggung.`
        : `Buatkan SATU tantangan DARE yang receh/lucu/dikit menantang tapi aman & gampang dilakuin di grup WhatsApp buat "${pushname || 'seseorang'}". Jangan berbahaya, jangan ilegal, jangan vulgar.`;

    const result = await api.groq(
        [{ role: 'user', content: userPrompt }],
        SYSTEM_PROMPT,
    );

    const cleaned = result.replace(/^["'\d.\s-]+|["'\s]+$/g, '').trim();
    if (!cleaned || cleaned.length > 300) throw new Error('AI response tidak valid');
    return cleaned;
}

export async function run(sock, { raw, from, command, pushname }) {
    let type = command;
    if (type === 'tod') type = Math.random() < 0.5 ? 'truth' : 'dare';

    const isTruth = type === 'truth';
    const label = isTruth ? '🤔 TRUTH' : '🔥 DARE';
    const who = pushname ? `*${pushname}*` : 'Kamu';

    let question;
    try {
        question = await generateWithAI(type, pushname);
    } catch (e) {
        logger.warn(`[tod] AI gagal, pakai fallback: ${e.message}`);
        question = pick(isTruth ? FALLBACK_TRUTH : FALLBACK_DARE);
    }

    return sock.sendMessage(from, {
        text: `${label}\n\n${who} kebagian:\n_${question}_`,
    }, { quoted: raw });
}
