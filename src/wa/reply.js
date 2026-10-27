const toContent = (input, extra) =>
    typeof input === 'string' ? { text: input, ...extra } : { ...input, ...extra };

export const sendTo = (sock, jid, input, extra = {}) => sock.sendMessage(jid, toContent(input, extra));

export function makeSendHelpers(sock, from, raw) {
    return {
        reply: (input, extra = {}) => sock.sendMessage(from, toContent(input, extra), { quoted: raw }),
        send: (input, extra = {}) => sock.sendMessage(from, toContent(input, extra)),
        react: (emoji, key = raw.key) => sock.sendMessage(from, { react: { text: emoji, key } }),
        del: (key = raw.key) => sock.sendMessage(from, { delete: key }),
        typing: () => sock.sendPresenceUpdate('composing', from),
    };
}
