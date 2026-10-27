import { api } from '../../src/api/index.js';
import { getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('imagine', 'genimg')
    .in('ai')
    .desc('Generate an image from a text description')
    .prefixOnly()
    .ai({
        trigger: 'User asks to generate an image from text or wants an illustration',
        examples: ['imagine cat astronaut', 'buatkan gambar naga biru'],
        args: { prompt: 'Description of the image to generate' },
    })
    .run(async (sock, { body, reply, typing }) => {
        const prompt = getArgs(body);
        if (!prompt) return reply(msg('need.imagine'));

        await typing();
        await reply(msg('wait.generating', { prompt }));

        try {
            const url = await api.imagine(prompt);
            await reply({ image: url, caption: `🎨 *${prompt}*` });
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
