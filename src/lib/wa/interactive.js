import {
    proto,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
} from '@whiskeysockets/baileys';
import { logger } from '../logger.js';
import { detectDevice, supportsInteractive } from './device.js';

export function unwrapMessage(message) {
    if (!message) return {};
    return message.ephemeralMessage?.message
        || message.viewOnceMessage?.message
        || message.viewOnceMessageV2?.message
        || message.viewOnceMessageV2Extension?.message
        || message.documentWithCaptionMessage?.message
        || message.editedMessage?.message
        || message;
}

function nativeFlowId(ir) {
    const json = ir?.nativeFlowResponseMessage?.paramsJson;
    if (!json) return '';
    try {
        const p = JSON.parse(json);
        return String(p.id || p.selectedId || p.rowId || p.row_id || '').trim();
    } catch {
        return '';
    }
}

export function extractBody(m) {
    const msg = unwrapMessage(m?.message);
    return msg.conversation
        || msg.extendedTextMessage?.text
        || msg.imageMessage?.caption
        || msg.videoMessage?.caption
        || msg.documentMessage?.caption
        || msg.buttonsResponseMessage?.selectedButtonId
        || msg.templateButtonReplyMessage?.selectedId
        || msg.listResponseMessage?.singleSelectReply?.selectedRowId
        || nativeFlowId(msg.interactiveResponseMessage)
        || msg.interactiveResponseMessage?.body?.text
        || '';
}

const VIDEO_RE = /\.(mp4|mov|webm|gif)(\?.*)?$/i;
const mediaCache = new Map();

export function isVideoUrl(url) {
    return VIDEO_RE.test(String(url || ''));
}

async function loadMedia(url) {
    if (mediaCache.has(url)) return mediaCache.get(url);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`thumb fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mediaCache.set(url, buf);
    return buf;
}

async function thumbContent(url, caption) {
    if (isVideoUrl(url)) {
        return { video: await loadMedia(url), gifPlayback: true, mimetype: 'video/mp4', caption: caption || '' };
    }
    return { image: { url }, caption: caption || '' };
}

export async function sendThumbFromUrl(sock, jid, { caption, quoted, thumbUrl } = {}) {
    const url = thumbUrl || global.thumb;
    let content;
    try {
        content = await thumbContent(url, caption);
    } catch (e) {
        logger.warn(`[menu] thumb video failed, text only: ${e.message}`);
        content = { text: caption || '' };
    }
    return sock.sendMessage(jid, content, quoted ? { quoted } : {});
}

export async function sendCategoryMenu(sock, jid, {
    caption,
    footer,
    quoted,
    sections,
    device,
    thumbUrl,
} = {}) {
    const url = thumbUrl || global.thumb;
    const dev = device || detectDevice(quoted);
    const canList = supportsInteractive(dev);

    if (canList && sections?.length) {
        try {
            await sendNativeList(sock, jid, { caption, footer, quoted, sections, thumbUrl: url });
            return { mode: 'list' };
        } catch (e) {
            logger.warn(`[menu] interactive list failed, text fallback: ${e.message}`);
        }
    }

    await sendThumbFromUrl(sock, jid, { caption, quoted, thumbUrl: url });
    return { mode: 'text' };
}

async function sendNativeList(sock, jid, { caption, footer, quoted, sections, thumbUrl }) {
    const isVid = isVideoUrl(thumbUrl);
    const media = await prepareWAMessageMedia(
        isVid
            ? { video: await loadMedia(thumbUrl), gifPlayback: true, mimetype: 'video/mp4' }
            : { image: { url: thumbUrl } },
        { upload: sock.waUploadToServer },
    );

    const interactive = proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: caption || '' }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || global.botName || '' }),
        header: proto.Message.InteractiveMessage.Header.create({
            title: global.botName || 'Levatain-MD',
            hasMediaAttachment: true,
            ...(isVid ? { videoMessage: media.videoMessage } : { imageMessage: media.imageMessage }),
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
                proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'Select Category',
                        sections,
                    }),
                }),
                proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'All Menu',
                        id: '.allmenu',
                    }),
                }),
            ],
        }),
    });


    const msg = generateWAMessageFromContent(
        jid,
        {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
            },
            interactiveMessage: interactive,
        },
        { userJid: sock.user?.id, quoted },
    );


    const isGroup = jid.endsWith('@g.us');
    const additionalNodes = [
        {
            tag: 'biz',
            attrs: {},
            content: [
                {
                    tag: 'interactive',
                    attrs: { type: 'native_flow', v: '1' },
                    content: [
                        {
                            tag: 'native_flow',
                            attrs: { v: '9', name: 'mixed' },
                        },
                    ],
                },
            ],
        },
    ];
    if (!isGroup) {
        additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    }

    await sock.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes,
    });
    return msg;
}


export async function sendLangPicker(sock, jid, { quoted, device } = {}) {
    const dev = device || detectDevice(quoted);
    const caption =
        '🌐 *Choose your language / Pilih bahasa*\n\n' +
        'This is used for AI replies.\n' +
        'Ini untuk bahasa balasan AI.\n\n' +
        '_You can change it later with *.lang*_';

    if (supportsInteractive(dev)) {
        try {
            const interactive = proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: caption }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                    text: global.botName || 'Levatain-MD',
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: [
                        proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'English 🇬🇧',
                                id: 'lang_en',
                            }),
                        }),
                        proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'Indonesia 🇮🇩',
                                id: 'lang_id',
                            }),
                        }),
                    ],
                }),
            });

            const msg = generateWAMessageFromContent(
                jid,
                {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                    },
                    interactiveMessage: interactive,
                },
                { userJid: sock.user?.id, quoted },
            );

            const isGroup = jid.endsWith('@g.us');
            const additionalNodes = [
                {
                    tag: 'biz',
                    attrs: {},
                    content: [
                        {
                            tag: 'interactive',
                            attrs: { type: 'native_flow', v: '1' },
                            content: [
                                {
                                    tag: 'native_flow',
                                    attrs: { v: '9', name: 'mixed' },
                                },
                            ],
                        },
                    ],
                },
            ];
            if (!isGroup) {
                additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
            }

            await sock.relayMessage(jid, msg.message, {
                messageId: msg.key.id,
                additionalNodes,
            });
            return { mode: 'buttons' };
        } catch (e) {
            logger.warn(`[lang-picker] interactive failed: ${e.message}`);
        }
    }

    await sock.sendMessage(
        jid,
        {
            text:
                caption +
                '\n\nReply with:\n• *EN* or *.lang en*\n• *ID* or *.lang id*',
        },
        quoted ? { quoted } : {},
    );
    return { mode: 'text' };
}

