const BAR_LEN = 12;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const renderBar = percent => {
    const filled = Math.max(0, Math.min(BAR_LEN, Math.round((percent / 100) * BAR_LEN)));
    return '█'.repeat(filled) + '░'.repeat(BAR_LEN - filled);
};

export class ProgressMessage {

    constructor(sock, jid, quoted = null, minInterval = 2500) {
        this.sock = sock;
        this.jid = jid;
        this.quoted = quoted;
        this.minInterval = Math.max(2000, minInterval);
        this.key = null;
        this.lastEdit = 0;
        this.lastText = null;
        this.spinIdx = 0;
        this._pending = null;
        this._editFailed = false;
        this._busy = false;
    }

    async start(label, percent = null) {
        const text = this._render(label, percent);
        const sent = await this.sock.sendMessage(this.jid, { text }, this.quoted ? { quoted: this.quoted } : {});
        this.key = sent?.key || null;
        if (this.key) this.key.fromMe = true;
        this.lastEdit = Date.now();
        this.lastText = text;
        this._editFailed = false;
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
        if (!this.key || this._editFailed) {
            if (!this.key) return this.start(text);
            if (text === this.lastText) return;
            this.lastText = text;
            try {
                const sent = await this.sock.sendMessage(this.jid, { text }, this.quoted ? { quoted: this.quoted } : {});
                this.key = sent?.key || this.key;
                if (this.key) this.key.fromMe = true;
            } catch {}
            return;
        }
        if (text === this.lastText) return;
        if (this._busy) {
            this._pending = text;
            return;
        }

        const now = Date.now();
        if (!force && now - this.lastEdit < this.minInterval) {
            this._pending = text;
            return;
        }

        this._busy = true;
        this.lastEdit = now;
        this.lastText = text;
        const pending = this._pending;
        this._pending = null;
        try {
            await this.sock.sendMessage(this.jid, { text, edit: this.key });
        } catch {
            this._editFailed = true;
            try {
                const sent = await this.sock.sendMessage(this.jid, { text }, this.quoted ? { quoted: this.quoted } : {});
                this.key = sent?.key || null;
                if (this.key) this.key.fromMe = true;
                this._editFailed = false;
            } catch {}
        } finally {
            this._busy = false;
            if (this._pending && this._pending !== text) {
                const next = this._pending;
                this._pending = null;
                await this._push(next, true);
            } else if (pending && pending !== text && !this._pending) {
                await this._push(pending, true);
            }
        }
    }

    _render(label, percent) {
        if (percent === null || percent === undefined) return label;
        return `${label}\n[${renderBar(percent)}] ${percent}%`;
    }
}
