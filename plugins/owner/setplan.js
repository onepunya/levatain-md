import { plugin } from '../../src/core/plugin.js';
import { applyPlan, PLANS, getLimitInfo, buildLimitCard } from '../../src/limits/limit.js';
import { saveDb } from '../../src/storage/db.js';

function digits(id = '') {
    return String(id).replace(/\D/g, '');
}

function findUserKeys(gdb, targetId) {
    const targetNum = digits(targetId);
    const keys = new Set();
    if (gdb.users[targetId]) keys.add(targetId);
    for (const k of Object.keys(gdb.users || {})) {
        if (digits(k) === targetNum && targetNum.length >= 8) keys.add(k);
        const u = gdb.users[k];
        if (u?.jid && digits(u.jid) === targetNum) keys.add(k);
        if (u?.lid && digits(u.lid) === targetNum) keys.add(k);
    }
    return [...keys];
}

export default plugin('setplan')
    .in('owner')
    .desc('Set user plan (basic/pro/max/registered/free)')
    .ownerOnly()
    .prefixOnly()
    .signal('Owner sets user limit plan', ['.setplan @user basic', '.setplan 628xxx pro'])
    .run(async (sock, {
        raw,
        from,
        message,
        body,
        mentionedJid,
        gdb
    }) => {
        const parts = (body || '').trim().split(/\s+/).slice(1);
        const planKey = (parts.find(p => PLANS[p.toLowerCase()]) || '').toLowerCase();
        if (!planKey || !PLANS[planKey]) {
            return sock.sendMessage(from, {
                text: `❌ Invalid plan.\nOptions: ${Object.keys(PLANS).join(', ')}\nExample: *.setplan @user basic*`,
            }, { quoted: raw });
        }

        let targetId = null;
        if (mentionedJid?.[0]) {
            targetId = mentionedJid[0];
        } else if (message.quoted?.sender) {
            targetId = message.quoted.sender;
        } else {
            const numPart = parts.find(p => !PLANS[p.toLowerCase()] && /\d{8,}/.test(p));
            if (numPart) {
                const num = numPart.replace(/\D/g, '');
                if (num) targetId = num.includes('@') ? num : num + '@s.whatsapp.net';
            }
        }

        if (!targetId) {
            return sock.sendMessage(from, {
                text: '❌ Tag a user / reply / provide a number.\nExample: *.setplan @user pro*',
            }, { quoted: raw });
        }

        let keys = findUserKeys(gdb, targetId);
        if (!keys.length) {
            gdb.users[targetId] = {
                jid: targetId.includes('@s.whatsapp.net') ? targetId : '',
                lid: targetId.includes('@lid') ? targetId : '',
                name: 'User',
                hit: 0,
                banned: false,
                bannedReason: '',
                lastChat: Date.now(),
                warns: 0,
                registered: false,
                username: '',
                age: 0,
                province: '',
                plan: 'free',
                planExpiry: 0,
                limitUsed: 0,
                lastLimitReset: 0,
            };
            keys = [targetId];
        }

        for (const k of keys) {
            applyPlan(gdb.users[k], planKey);
        }

        await saveDb();

        const primary = gdb.users[keys[0]];
        const info = getLimitInfo(primary);
        const tag = targetId.split('@')[0];
        await sock.sendMessage(from, {
            text: [
                `✅ Plan *${PLANS[planKey].label}* activated for @${tag}`,
                `Keys updated: ${keys.length}`,
                `Max limit: *${info.max}*`,
                `Expires: ${info.planLeft > 0 ? new Date(info.planExpiry).toLocaleString('en-US') : 'permanent'}`,
                ``,
                buildLimitCard(info, primary.username || primary.name || tag),
            ].join('\n'),
            mentions: [targetId],
        }, { quoted: raw });
    });
