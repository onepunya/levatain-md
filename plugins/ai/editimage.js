import { getArgs, downloadMedia, getExtFromMime, sleep } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { config } from '../../src/config.js';
import { plugin } from '../../src/core/plugin.js';
const apiKeys = config.magicHour.keys;

let keyIndex = 0;

async function uploadToMagicHour(currentKey, buffer, mimetype) {
    const ext = getExtFromMime(mimetype || 'image/jpeg');

    const urlRes = await fetch('https://api.magichour.ai/v1/files/upload-urls', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${currentKey}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({ items: [{ type: 'image', extension: ext }] })
    });

    if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.message || `Failed to request upload URL (${urlRes.status})`);
    }

    const urlData = await urlRes.json();
    const { upload_url, file_path } = urlData.items[0];

    const putRes = await fetch(upload_url, { method: 'PUT', body: buffer });
    if (!putRes.ok) {
        throw new Error(`Failed to upload to Magic Hour storage (${putRes.status})`);
    }

    return file_path;
}

export default plugin('editimage', 'aiedit')
    .in('ai')
    .desc('Edit image using AI prompt (Magic Hour)')
    .prefixOnly()
    .ai({
        trigger: 'User asks to edit an image with AI using a prompt',
        examples: ['editimage put black glasses on the face', 'aiedit change background to beach'],
        args: { input: 'Edit prompt (reply/send image)' },
    })
    .run(async (sock, {
        body,
        message,
        raw,
        reply,
        typing
    }) => {
        const prompt = getArgs(body);

        if (!prompt) {
            return reply(msg('need.editimage'));
        }

        const result = await downloadMedia(raw, message.quoted, ['image']);
        if (!result) {
            return reply(msg('need.image'));
        }

        if (apiKeys.length === 0) {
            return reply(msg('fail.feature_magic'));
        }

        await typing();
        await reply(msg('wait.upload_ai'));

        try {
            const currentKey = apiKeys[keyIndex];
            keyIndex = (keyIndex + 1) % apiKeys.length;

            const filePath = await uploadToMagicHour(currentKey, result.buffer, result.mimetype);

            const initResponse = await fetch('https://api.magichour.ai/v1/ai-image-editor', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'authorization': `Bearer ${currentKey}`,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    name: `Bot Edit - ${Date.now()}`,
                    image_count: 1,
                    model: "flux-2-klein",
                    aspect_ratio: "auto",
                    resolution: "640px",
                    style: { prompt: prompt },
                    assets: { image_file_paths: [filePath] }
                })
            });

            if (!initResponse.ok) {
                const err = await initResponse.json();
                throw new Error(err.message || `Init Error: ${initResponse.status}`);
            }

            const initData = await initResponse.json();
            const projectId = initData.id;

            let isCompleted = false;
            let imageUrl = null;
            let attempts = 0;
            const maxAttempts = 15;

            await reply(msg('wait.drawing', { id: projectId }));

            while (!isCompleted && attempts < maxAttempts) {
                await sleep(5000);

                const checkResponse = await fetch(`https://api.magichour.ai/v1/image-projects/${projectId}`, {
                    method: 'GET',
                    headers: {
                        'accept': 'application/json',
                        'authorization': `Bearer ${currentKey}`
                    }
                });

                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    const status = checkData.status?.toLowerCase();

                    if (status === 'complete') {
                        isCompleted = true;
                        imageUrl = checkData.downloads?.[0]?.url || null;
                    } else if (status === 'error') {
                        const msg = checkData.error?.message || checkData.error?.code || 'Unknown reason';
                        throw new Error(`AI failed to render image: ${msg} (credits were auto-refunded).`);
                    } else if (status === 'canceled') {
                        throw new Error('Process was cancelled.');
                    }
                }

                attempts++;
            }

            if (isCompleted && imageUrl) {
                await reply({
                    image: { url: imageUrl },
                    caption: `🎨 *AI Image Editor*\n\n*Prompt:* ${prompt}`
                });
            } else {
                throw new Error('Timed out. AI server is too busy.');
            }

        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
