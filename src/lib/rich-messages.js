import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { randomBytes, randomUUID } from 'crypto';

export function normalizeUserJid(source) {
    if (!source) return undefined;
    if (typeof source === 'string') return source;
    if (source.user?.id) return source.user.id;
    if (source.id) return source.id;
    return undefined;
}

// ==========================================
// 2. RICH WEBUI (HTML Inline)
// ==========================================

export const WEBUI_PRIMITIVE_TYPENAME = 'GenAIaeacdsnwHtmlPrimitive';
export const DEFAULT_BOT_JID = '867051314767696@bot';
export const DEFAULT_FORWARD_ORIGIN = 'META_AI';
export const WEBUI_MAX_PAYLOAD_BYTES = 64 * 1024;
export const generateWebuiMessageId = () => '3EB0' + randomBytes(18).toString('hex').toUpperCase();

export function buildWebuiMessage({ html, title = 'WebUI', botJid = DEFAULT_BOT_JID, forwardOrigin = DEFAULT_FORWARD_ORIGIN, responseId } = {}) {
    if (typeof html !== 'string' || html.length === 0) {
        throw new TypeError('buildWebuiMessage: "html" wajib berupa string non-kosong');
    }
    const htmlBytes = Buffer.byteLength(html, 'utf-8');
    if (htmlBytes > WEBUI_MAX_PAYLOAD_BYTES) {
        console.warn(`[rich-webui] payload HTML melebihi batas aman ${WEBUI_MAX_PAYLOAD_BYTES} bytes`);
    }
    
    const uuid = responseId || randomUUID();
    const unifiedResponse = {
        response_id: uuid,
        sections: [{ view_model: { primitive: { __typename: WEBUI_PRIMITIVE_TYPENAME, payload: html, trusted_sources: [] }, __typename: 'GenAISingleLayoutViewModel' } }]
    };
    
    const base64Data = Buffer.from(JSON.stringify(unifiedResponse), 'utf-8').toString('base64');
    
    return {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2, botMetadata: { botResponseId: uuid } },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 'AI_RICH_RESPONSE_TYPE_STANDARD',
                    submessages: [{ messageType: 'AI_RICH_RESPONSE_TEXT', messageText: title }],
                    unifiedResponse: { data: base64Data },
                    contextInfo: { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid }, forwardOrigin }
                }
            }
        }
    };
}

export async function sendInlineWebUI(sock, jid, html, title = 'WebUI', options = {}) {
    if (!sock || typeof sock.relayMessage !== 'function') {
        throw new TypeError('sendInlineWebUI: "sock" harus instance Baileys socket yang punya relayMessage()');
    }
    const { messageId: customMessageId, ...buildOptions } = options;
    const message = buildWebuiMessage({ html, title, ...buildOptions });
    const messageId = customMessageId || generateWebuiMessageId();
    await sock.relayMessage(jid, message, { messageId });
    return { messageId, message };
}
