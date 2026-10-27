import { plugin } from '../../src/core/plugin.js';
import { registerUser, getLimitInfo, buildLimitCard } from '../../src/limits/limit.js';
import { saveDb } from '../../src/storage/db.js';

export default plugin('register', 'daftar')
    .in('limit')
    .desc('Register account for 200% limit bonus')
    .prefixOnly()
    .signal('User wants to register account for limit bonus', ['.register username 18 West Java', '.daftar levatain 20 Jakarta'])
    .run(async (sock, {
        primaryId,
        gdb,
        pushname,
        body,
        reply
    }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (user.registered) {
            const info = getLimitInfo(user);
            const extra = [
                user.username ? `👤 Username: *${user.username}*` : null,
                user.age ? `🎂 Age: *${user.age}*` : null,
                user.province ? `📍 Province: *${user.province}*` : null,
            ].filter(Boolean).join('\n');
            return reply([
                    `✅ You are already registered!`,
                    extra ? `\n${extra}\n` : '',
                    buildLimitCard(info, user.username || user.name || pushname),
                ].join('\n'));
        }

        const parts = (body || '').trim().split(/\s+/).slice(1);
        if (parts.length < 3) {
            return reply([
                    `📝 *Registration format*`,
                    ``,
                    `*.register <username> <age> <province>*`,
                    ``,
                    `Examples:`,
                    `*.register levatain 20 West Java*`,
                    `*.daftar johndoe 18 Jakarta*`,
                    ``,
                    `Requirements:`,
                    `• Username min *6 characters*`,
                    `• Age must be a valid number (1–120)`,
                    `• Province of origin is required`,
                    ``,
                    `After registering you get a *200%* limit bonus (100% free + 100% register bonus).`,
                ].join('\n'));
        }

        const username = parts[0].trim();
        const ageRaw = parts[1].trim();
        const province = parts.slice(2).join(' ').trim();
        const age = parseInt(ageRaw, 10);

        if (username.length < 6) {
            return reply('❌ Username must be at least *6 characters*.\nExample: *.register levatain 20 West Java*');
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return reply('❌ Username may only contain letters, numbers, and underscore (_).');
        }

        if (!Number.isFinite(age) || age < 1 || age > 120) {
            return reply('❌ Age must be a valid number (1–120).\nExample: *.register levatain 20 West Java*');
        }

        if (!province || province.length < 2) {
            return reply('❌ Province of origin is required.\nExample: *.register levatain 20 West Java*');
        }

        const taken = Object.values(gdb.users || {}).some(
            u => u.registered && u.username && u.username.toLowerCase() === username.toLowerCase() && u !== user
        );
        if (taken) {
            return reply(`❌ Username *${username}* is already taken. Choose another one.`);
        }

        const ok = registerUser(user, { username, age, province });
        await saveDb();

        if (!ok) {
            const info = getLimitInfo(user);
            return reply(`✅ You are already registered!\n\n${buildLimitCard(info, user.username || user.name || pushname)}`);
        }

        const info = getLimitInfo(user);
        await reply([
                `🎉 *Registration successful!*`,
                ``,
                `👤 Username: *${username}*`,
                `🎂 Age: *${age}*`,
                `📍 Province: *${province}*`,
                ``,
                `Limit bonus active: *200%*`,
                `(100% free + 100% register bonus)`,
                ``,
                buildLimitCard(info, username),
                ``,
                `Type *.plan* to see upgrade packages.`,
            ].join('\n'));
    });
