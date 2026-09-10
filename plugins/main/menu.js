import { getArgs } from '../../src/lib/utils.js';
import { detectDevice, deviceLabel, supportsInteractive } from '../../src/lib/device.js';
import { sendCategoryMenu, sendThumbFromUrl } from '../../src/lib/interactive.js';
import {
    TAG_META,
    collectGrouped,
    buildAllMenuText,
    buildHomeCaption,
    buildCategoryText,
    buildListSections,
    resolveMenuArg,
    labelize,
} from '../../src/lib/menuCatalog.js';

export const meta = {
    cmd:  ['menu', 'allmenu'],
    tag:  'main',
    aliasOnly: false,
    desc: 'Menu kategori (list Android / teks iPhone) dan allmenu',
    ai: {
        trigger: 'User minta daftar command, menu, bantuan, atau allmenu',
        examples: ['menu', 'allmenu', 'command apa aja', 'help'],
    },
};

export async function run(sock, { raw, from, pushname, isOwner, command, body, device: deviceHint }) {
    const device = deviceHint || detectDevice(raw);
    const arg = command === 'allmenu' ? 'all' : getArgs(body);
    const target = resolveMenuArg(arg, isOwner);

    if (target.type === 'all') {
        const text = buildAllMenuText(pushname, isOwner);
        await sendThumbFromUrl(sock, from, { caption: text, quoted: raw });
        return;
    }

    if (target.type === 'tag') {
        const { grouped } = collectGrouped(isOwner);
        const items = grouped[target.tag];
        if (!items?.length) {
            return sock.sendMessage(from, {
                text: `❌ Kategori *${target.tag}* tidak ditemukan.\nKetik *.menu* untuk lihat daftar.`,
            }, { quoted: raw });
        }
        const { emoji, label } = TAG_META[target.tag] || { emoji: '📋', label: labelize(target.tag) };
        const caption = `✦ *${global.botName}* — ${emoji} ${label}\n\n${buildCategoryText(target.tag, items)}\n\n_Ketik *.menu* kembali ke kategori · *.allmenu* semua command_`;
        await sendThumbFromUrl(sock, from, { caption, quoted: raw });
        return;
    }

    const caption = buildHomeCaption(pushname, device, isOwner);
    const footer = supportsInteractive(device)
        ? `${global.botName} · ${deviceLabel(device)}`
        : `${global.botName} · ${deviceLabel(device)} (tanpa tombol)`;

    await sendCategoryMenu(sock, from, {
        caption,
        footer,
        quoted: raw,
        sections: buildListSections(isOwner),
        device,
        thumbUrl: global.thumb,
    });
}
