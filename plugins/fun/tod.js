import { api, logger, pick } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tod', 'truth', 'dare')
    .in('fun')
    .desc('Truth or Dare — AI-generated questions/challenges so each round is unique')
    .showAllAliases()
    .cooldown(3)
    .signal('User wants to play truth or dare', ['tod', 'truth', 'dare'])
    .run(async (sock, { raw, from, command, pushname }) => {
        let type = command;
        if (type === 'tod') type = Math.random() < 0.5 ? 'truth' : 'dare';

        const isTruth = type === 'truth';
        const label = isTruth ? '🤔 TRUTH' : '🔥 DARE';
        const who = pushname ? `*${pushname}*` : 'You';

        let question;
        try {
            question = await generateWithAI(type, pushname);
        } catch (e) {
            logger.warn(`[tod] AI failed, using fallback: ${e.message}`);
            question = pick(isTruth ? FALLBACK_TRUTH : FALLBACK_DARE);
        }

        return sock.sendMessage(from, {
            text: `${label}\n\n${who} got:\n_${question}_`,
        }, { quoted: raw });
    });

const FALLBACK_TRUTH = [
    'Who is your crush right now?',
    'What is the cringiest chat you have ever sent to your crush?',
    'How late have you ever stalked an ex?',
];
const FALLBACK_DARE = [
    'Send a 15-second voice note singing a sad song to the group.',
    'Change your WhatsApp name to "Drama King/Queen" for 1 hour.',
    'Send a funny selfie to the group right now.',
];

const SYSTEM_PROMPT = `You generate Truth or Dare prompts for a casual WhatsApp group.
Reply with ONLY one question or dare sentence — no intro, no quotes, no extra text.`;

async function generateWithAI(type, pushname) {
    const isTruth = type === 'truth';
    const userPrompt = isTruth
        ? `Create ONE funny light TRUTH question for "${pushname || 'someone'}"`
        : `Create ONE funny safe easy DARE for "${pushname || 'someone'}"`;

    const result = await api.chatAI(
        [{ role: 'user', content: userPrompt }],
        SYSTEM_PROMPT,
    );

    const cleaned = result.replace(/^["'\d.\s-]+|["'\s]+$/g, '').trim();
    if (!cleaned || cleaned.length > 300) throw new Error('Invalid AI response');
    return cleaned;
}

