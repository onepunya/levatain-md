import { saveDb } from '../../src/storage/db.js';
import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/wa/messages.js';

export default plugin('setwelcome', 'setantilink', 'setmute', 'setcaptcha', 'setautodl')
    .in('group')
    .desc('Group feature settings')
    .showAllAliases()
    .adminOnly()
    .groupOnly()
    .ai({
        trigger: 'User asks to enable/disable a group feature like welcome, antilink, mute',
        examples: ['enable welcome', 'disable antilink', 'enable captcha'],
        args: { toggle: 'on/off' },
    })
    .run(async (sock, {
        body,
        from,
        command,
        gdb,
        reply
    }) => {
        const feature = featureMap[command];
        if (!feature) return;

        const grp = gdb.groups[from];
        if (!grp) return reply(msg('fail.group_data'));

        const args = body.split(' ').slice(1).join(' ').trim().toLowerCase();
        const turnOn = ['on', 'aktif', 'nyala', '1', 'enable', 'true'].includes(args);
        const turnOff = ['off', 'nonaktif', 'mati', '0', 'disable', 'false'].includes(args);

        if (!turnOn && !turnOff) {
            grp[feature.key] = !grp[feature.key];
        } else {
            grp[feature.key] = turnOn;
        }

        await saveDb();
        const status = grp[feature.key] ? '✅ Active' : '❌ Inactive';
        await reply(`${feature.label}: *${status}*`);
    });

const featureMap = {
    setwelcome: { key: 'welcome', label: 'Welcome message' },
    setantilink: { key: 'antilink', label: 'Anti-link' },
    setmute: { key: 'mute', label: 'Mute group' },
    setcaptcha: { key: 'captcha', label: 'Captcha join' },
    setautodl: { key: 'autodl', label: 'Auto download' },
};
