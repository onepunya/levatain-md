export function plugin(...cmds) {
    const state = {
        cmd: cmds.map(c => String(c).toLowerCase().trim()).filter(Boolean),
        tag: 'general',
        desc: '',
        aliasOnly: true,
        isOwner: false,
        isAdmin: false,
        isGroup: false,
        cooldown: undefined,
        ai: undefined,
    };

    const api = {
        in(tag) {
            state.tag = String(tag || 'general');
            return api;
        },
        desc(text) {
            state.desc = String(text || '');
            return api;
        },
        prefixOnly() {
            state.aliasOnly = true;
            return api;
        },
        aliasOnly(v = true) {
            state.aliasOnly = !!v;
            return api;
        },
        showAllAliases() {
            state.aliasOnly = false;
            return api;
        },
        ownerOnly() {
            state.isOwner = true;
            return api;
        },
        adminOnly() {
            state.isAdmin = true;
            return api;
        },
        groupOnly() {
            state.isGroup = true;
            return api;
        },
        cooldown(sec) {
            const n = Number(sec);
            state.cooldown = Number.isFinite(n) ? n : undefined;
            return api;
        },
        signal(trigger, examples = []) {
            state.ai = {
                trigger: String(trigger || ''),
                examples: Array.isArray(examples) ? examples : [examples].filter(Boolean),
            };
            return api;
        },
        ai(obj = {}) {
            state.ai = {
                trigger: String(obj.trigger || ''),
                examples: Array.isArray(obj.examples) ? obj.examples : [],
                args: obj.args,
            };
            return api;
        },
        run(fn) {
            if (typeof fn !== 'function') {
                throw new TypeError('plugin().run() membutuhkan function');
            }
            if (!state.cmd.length) {
                throw new TypeError('plugin() minimal 1 command');
            }
            const iface = {
                cmd: state.cmd.length === 1 ? state.cmd[0] : state.cmd,
                tag: state.tag,
                desc: state.desc,
                aliasOnly: state.aliasOnly,
                run: fn,
            };
            if (state.isOwner) iface.isOwner = true;
            if (state.isAdmin) iface.isAdmin = true;
            if (state.isGroup) iface.isGroup = true;
            if (state.cooldown !== undefined) iface.cooldown = state.cooldown;
            if (state.ai?.trigger) iface.ai = state.ai;

            return {
                meta: {
                    interface: iface,
                },
            };
        },
    };

    return api;
}

export default plugin;
