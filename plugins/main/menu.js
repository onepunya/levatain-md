import { getArgs, detectDevice, deviceLabel, supportsInteractive, sendCategoryMenu, sendThumbFromUrl, TAG_META, collectGrouped, buildAllMenuText, buildHomeCaption, buildCategoryText, buildListSections, resolveMenuArg, labelize , msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('menu', 'allmenu')
    .in('main')
    .desc('Category menu (Android list / iPhone text) and allmenu')
    .showAllAliases()
    .signal('User asks for command list, menu, help, or allmenu', ['menu', 'allmenu', 'command apa aja', 'help'])
    .run(async (sock, { raw, from, pushname, isOwner, command, body, device: deviceHint }) => {
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
                    text: msg('menu.missing_cat', { tag: target.tag }),
                }, { quoted: raw });
            }
            const { emoji, label } = TAG_META[target.tag] || { emoji: '📋', label: labelize(target.tag) };
            const caption = `✦ *${global.botName}* — ${emoji} ${label}\n\n${buildCategoryText(target.tag, items)}\n\n_Type *.menu* to go back · *.allmenu* for all commands_`;
            await sendThumbFromUrl(sock, from, { caption, quoted: raw });
            return;
        }

        const caption = buildHomeCaption(pushname, device, isOwner);
        const footer = supportsInteractive(device)
            ? `${global.botName} · ${deviceLabel(device)}`
            : `${global.botName} · ${deviceLabel(device)} (no buttons)`;

        await sendCategoryMenu(sock, from, {
            caption,
            footer,
            quoted: raw,
            sections: buildListSections(isOwner),
            device,
            thumbUrl: global.thumb,
        });
    });

