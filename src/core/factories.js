import { applyAudioFilter, downloadMedia, typing } from '../util/index.js';
import { msg } from '../wa/index.js';
import { plugin } from './plugin.js';

export function audioEffect({ cmds, name, desc, trigger, filter }) {
    return plugin(...cmds)
        .in('audiochanger')
        .desc(desc)
        .prefixOnly()
        .signal(trigger, [`${trigger} audio ini`])
        .run(async (sock, {
            message,
            raw,
            from
        }) => {
            const result = await downloadMedia(raw, message.quoted, ['audio', 'video']);
            if (!result) return sock.sendMessage(from, { text: msg('need.audio_video') }, { quoted: raw });

            await typing(sock, from);
            try {
                const audio = await applyAudioFilter(result.buffer, filter);
                await sock.sendMessage(from, { audio, mimetype: 'audio/mpeg', fileName: `${name}.mp3` }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: msg('fail.audio', { msg: e.message }) }, { quoted: raw });
            }
        });
}
