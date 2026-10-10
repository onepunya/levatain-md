const BAR_LEN = 12;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const renderBar = percent => {
    const filled = Math.max(0, Math.min(BAR_LEN, Math.round((percent / 100) * BAR_LEN)));
    return '█'.repeat(filled) + '░'.repeat(BAR_LEN - filled);
};

export class ProgressMessage {

    constructor(sock, jid, quoted = null, minInterval = 2000) {
        this.sock = sock;
        this.jid = jid;
        this.quoted = quoted;
        this.minInterval = Math.max(1500, minInterval);
        this.key = null;
        this.lastEdit = 0;
        this.lastText = null;
        this.spinIdx = 0;
        this._queue = Promise.resolve();
        this._editOk = true;
    }

    async start(label, percent = null) {
        const text = this._render(label, percent);
        try {
            const sent = await this.sock.sendMessage(
                this.jid,
                { text },
                this.quoted ? { quoted: this.quoted } : {},
            );
            this.key = sent?.key || null;
            this.lastEdit = Date.now();
            this.lastText = text;
            this._editOk = true;
        } catch (e) {
            this.key = null;
            this.lastText = null;
            throw e;
        }
        return this;
    }

    async update(label, percent, force = false) {
        return this._enqueue(() => this._push(this._render(label, percent), force));
    }

    async stage(label, force = false) {
        const frame = SPINNER[this.spinIdx % SPINNER.length];
        this.spinIdx++;
        return this._enqueue(() => this._push(`${frame} ${label}`, force));
    }

    async done(finalText) {
        return this._enqueue(() => this._finish(finalText));
    }

    async fail(errorText) {
        return this._enqueue(() => this._finish(`❌ ${errorText}`));
    }

    _enqueue(fn) {
        this._queue = this._queue.then(fn, fn);
        return this._queue;
    }

    async _finish(text) {
        if (text === this.lastText) return;
        if (this.key && this._editOk) {
            try {
                await this.sock.sendMessage(this.jid, { text, edit: this.key });
                this.lastText = text;
                this.lastEdit = Date.now();
                return;
            } catch {
                this._editOk = false;
            }
        }
        try {
            const sent = await this.sock.sendMessage(
                this.jid,
                { text },
                this.quoted ? { quoted: this.quoted } : {},
            );
            this.key = sent?.key || null;
            this.lastText = text;
            this.lastEdit = Date.now();
            this._editOk = true;
        } catch {}
    }

    async _push(text, force) {
        if (!this.key) {
            await this.start(text);
            return;
        }
        if (text === this.lastText) return;

        const now = Date.now();
        if (!force && now - this.lastEdit < this.minInterval) return;

        if (!this._editOk) {
            await this._finish(text);
            return;
        }

        try {
            await this.sock.sendMessage(this.jid, { text, edit: this.key });
            this.lastText = text;
            this.lastEdit = Date.now();
        } catch {
            this._editOk = false;
            await this._finish(text);
        }
    }

    _render(label, percent) {
        if (percent === null || percent === undefined) return label;
        return `${label}\n[${renderBar(percent)}] ${percent}%`;
    }
}
