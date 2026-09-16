import { getDevice as baileysGetDevice } from '@whiskeysockets/baileys';

function fromMessageId(id = '') {
    if (!id) return 'unknown';
    if (id.startsWith('3A')) return 'ios';
    if (id.startsWith('3E')) return 'web';
    if (id.length > 21) return 'android';
    return 'unknown';
}

export function detectDevice(raw) {
    const id = raw?.key?.id || '';
    try {
        const d = baileysGetDevice(id);
        if (!d || d === 'unknown') return fromMessageId(id);
        if (d === 'ios' || d === 'ios_mobile') return 'ios';
        if (d === 'android') return 'android';
        if (d === 'web' || d === 'desktop') return 'web';
        return d;
    } catch {
        return fromMessageId(id);
    }
}

export function supportsInteractive(device) {
    return device === 'android';
}

export function deviceLabel(device) {
    if (device === 'ios') return 'iPhone';
    if (device === 'android') return 'Android';
    if (device === 'web' || device === 'desktop') return 'WhatsApp Web';
    return 'perangkat';
}
