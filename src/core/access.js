const RULES = [
    ['isOwner', 'isOwner', 'sys.owner_only'],
    ['isAdmin', 'isAdmin', 'sys.admin_only'],
    ['isGroup', 'isGroup', 'sys.group_only']
];

export function denyReason(iface, flags) {
    for (const [ifaceKey, flagKey, msgKey] of RULES) {
        if (iface?.[ifaceKey] && !flags[flagKey]) return msgKey;
    }
    return null;
}
