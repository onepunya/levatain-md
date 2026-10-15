import { CURRENCY } from './schema.js';

export function formatAether(amount) {
    const n = Math.floor(Number(amount) || 0);
    const formatted = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formatted}${CURRENCY.symbol}`;
}

export function parseAether(text) {
    if (typeof text === 'number') return Math.floor(text);
    const cleaned = String(text || '').replace(/[^\d]/g, '');
    return parseInt(cleaned, 10) || 0;
}

export { CURRENCY };
