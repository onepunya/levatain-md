export function htmlEscape(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const BASE_STYLE = `
    * { box-sizing: border-box; }
    body {
        background-color: #0d1117;
        color: #c9d1d9;
        font-family: 'Courier New', Courier, monospace;
        padding: 16px;
        margin: 0;
    }
    .container {
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 14px;
        background-color: #161b22;
    }
    h3 {
        margin-top: 0;
        border-bottom: 1px dashed #58a6ff;
        padding-bottom: 8px;
        font-size: 16px;
        color: #58a6ff;
        word-break: break-word;
    }
    .sub { color: #8b949e; font-size: 12px; margin-top: -8px; margin-bottom: 12px; word-break: break-word; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid #21262d; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .k { color: #8b949e; flex-shrink: 0; }
    .v { color: #c9d1d9; text-align: right; word-break: break-word; }
    .ok  { color: #3fb950; font-weight: bold; }
    .bad { color: #f85149; font-weight: bold; }
    .footer { margin-top: 12px; font-size: 11px; color: #6e7681; text-align: center; }
`;

export function renderInfoCard({ title, subtitle = '', rows = [], footer = '' }) {
    const rowsHtml = rows
        .map(([k, v]) => `<div class="row"><span class="k">${htmlEscape(k)}</span><span class="v">${v}</span></div>`)
        .join('\n');

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${BASE_STYLE}</style></head>
<body>
    <div class="container">
        <h3>${htmlEscape(title)}</h3>
        ${subtitle ? `<div class="sub">${htmlEscape(subtitle)}</div>` : ''}

        ${rowsHtml}
        ${footer ? `<div class="footer">${htmlEscape(footer)}</div>` : ''}
    </div>

</body>

</html>`;

}
