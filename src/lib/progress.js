const BAR_LEN = 12;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const renderBar = percent => {
    const filled = Math.max(0, Math.min(BAR_LEN, Math.round((percent / 100) * BAR_LEN)));
    return '█'.repeat(filled) + '░'.repeat(BAR_LEN - filled);
};

export class ProgressMessage {
    
    constructor(sock, jid, quoted = null, minInterval = 1500) {
        this.sock = sock;
        this.jid = jid;
        this.quoted = quoted;
        this.minInterval = minInterval;
        this.key = null;
        this.lastEdit = 0;
        this.lastText = null;
        this.spinIdx = 0;
        this._pending = null;
    }

    async start(label, percent = null) {
        const text = this._render(label, percent);
        const sent = await this.sock.sendMessage(this.jid, { text }, this.quoted ? { quoted: this.quoted } : {});
        this.key = sent.key;
        this.lastEdit = Date.now();
        this.lastText = text;
        return this;
    }

    async update(label, percent, force = false) {
        return this._push(this._render(label, percent), force);
    }

    async stage(label, force = false) {
        const frame = SPINNER[this.spinIdx % SPINNER.length];
        this.spinIdx++;
        return this._push(`${frame} ${label}`, force);
    }

    async done(finalText) {
        return this._push(finalText, true);
    }

    async fail(errorText) {
        return this._push(`❌ ${errorText}`, true);
    }

    async _push(text, force) {
        if (!this.key) return this.start(text);
        if (text === this.lastText) return;

        const now = Date.now();
        if (!force && now - this.lastEdit < this.minInterval) {
            this._pending = text;
            return;
        }

        this.lastEdit = now;
        this.lastText = text;
        this._pending = null;
        try {
            await this.sock.sendMessage(this.jid, { text, edit: this.key });
        } catch {

        }
    }

    _render(label, percent) {
        if (percent === null || percent === undefined) return label;
        return `${label}\n[${renderBar(percent)}] ${percent}%`;
    }
}
