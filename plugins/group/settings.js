import { saveDb } from '../../src/core/db.js';

export const meta = {
    cmd:     ['setwelcome', 'setantilink', 'setmute', 'setcaptcha', 'setautodl'],
    tag:     'group',
    aliasOnly: false,
    desc:    'Pengaturan fitur group',
    isGroup: true,
    isAdmin: true,
    ai: {
        trigger: 'User minta aktifkan/nonaktifkan fitur group seperti welcome, antilink, mute',
        examples: ['aktifkan welcome', 'matiin antilink', 'nyalain captcha'],
        args: { toggle: 'on/off atau aktif/nonaktif' },
    },
};

const featureMap = {
    setwelcome:  { key: 'welcome',  label: 'Welcome message' },
    setantilink: { key: 'antilink', label: 'Anti-link' },
    setmute:     { key: 'mute',     label: 'Mute group' },
    setcaptcha:  { key: 'captcha',  label: 'Captcha join' },
    setautodl:   { key: 'autodl',   label: 'Auto download' },
};

export async function run(sock, { body, raw, from, command, gdb }) {
    const feature = featureMap[command];
    if (!feature) return;

    const grp  = gdb.groups[from];
    if (!grp)  return sock.sendMessage(from, { text: '❌ Data group tidak ditemukan.' }, { quoted: raw });

    const args   = body.split(' ').slice(1).join(' ').trim().toLowerCase();
    const turnOn = ['on', 'aktif', 'nyala', '1', 'enable', 'true'].includes(args);
    const turnOff = ['off', 'nonaktif', 'mati', '0', 'disable', 'false'].includes(args);

    if (!turnOn && !turnOff) {
        grp[feature.key] = !grp[feature.key];
    } else {
        grp[feature.key] = turnOn;
    }

    await saveDb();
    const status = grp[feature.key] ? '✅ Aktif' : '❌ Nonaktif';
    await sock.sendMessage(from, { text: `${feature.label}: *${status}*` }, { quoted: raw });
}
