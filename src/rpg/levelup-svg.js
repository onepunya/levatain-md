import sharp from 'sharp';
import { CLASSES } from './schema.js';
import { formatAether } from './currency.js';

export async function generateLevelUpImage(char, { oldLevel, newLevel }) {
    const cls = CLASSES[char.class];
    const className = cls?.name?.[char.lang] || char.class;
    const emoji = cls?.emoji || '⚔️';
    const name = escapeXml(char.name || 'Adventurer');
    const aether = formatAether(char.aether);

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f0c29"/>
      <stop offset="50%" style="stop-color:#302b63"/>
      <stop offset="100%" style="stop-color:#24243e"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#f6d365"/>
      <stop offset="100%" style="stop-color:#fda085"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="800" height="450" fill="url(#bg)"/>
  <rect x="20" y="20" width="760" height="410" rx="16" fill="none"
        stroke="url(#gold)" stroke-width="2" opacity="0.7"/>
  <rect x="30" y="30" width="740" height="390" rx="12" fill="none"
        stroke="#ffffff" stroke-width="0.5" opacity="0.15"/>
  <text x="400" y="90" text-anchor="middle" font-family="Georgia, serif"
        font-size="42" font-weight="bold" fill="url(#gold)" filter="url(#glow)">
    LEVEL UP!
  </text>
  <text x="400" y="145" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="26" fill="#e0e0ff">${name}</text>
  <text x="400" y="185" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="20" fill="#a0a0c0">${emoji} ${escapeXml(className)}</text>
  <text x="400" y="270" text-anchor="middle" font-family="Georgia, serif"
        font-size="64" font-weight="bold" fill="#ffffff" filter="url(#glow)">
    ${oldLevel}  →  ${newLevel}
  </text>
  <text x="400" y="340" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="22" fill="#f6d365">${escapeXml(aether)}</text>
  <text x="400" y="400" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="14" fill="#7070a0">Levatain RPG · Aether</text>
</svg>`;

    return sharp(Buffer.from(svg))
        .png()
        .toBuffer();
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
