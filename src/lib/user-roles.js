export const USER_ROLE_VALUES = {
    ADMIN: 'admin',
    MODERATOR: 'moderator',
    CST_WHOLESALE: 'cst_wholesale',
    CST_RETAIL: 'customer'
};

export const MANAGEABLE_USER_ROLES = [
    USER_ROLE_VALUES.CST_RETAIL,
    USER_ROLE_VALUES.CST_WHOLESALE,
    USER_ROLE_VALUES.MODERATOR,
    USER_ROLE_VALUES.ADMIN
];

export function normalizeUserRole(role) {
    const normalized = String(role || '').trim().toLowerCase().replace(/[\s.]+/g, '_');

    if (!normalized) return USER_ROLE_VALUES.CST_RETAIL;
    if (normalized === 'customer' || normalized === 'user' || normalized === 'retail' || normalized === 'cst_retail') {
        return USER_ROLE_VALUES.CST_RETAIL;
    }
    if (normalized === 'wholesale' || normalized === 'cst_wholesale') {
        return USER_ROLE_VALUES.CST_WHOLESALE;
    }
    if (normalized === USER_ROLE_VALUES.ADMIN) return USER_ROLE_VALUES.ADMIN;
    if (normalized === USER_ROLE_VALUES.MODERATOR) return USER_ROLE_VALUES.MODERATOR;

    return normalized;
}

export function isAdminRole(role) {
    const normalized = normalizeUserRole(role);
    return normalized === USER_ROLE_VALUES.ADMIN || normalized === USER_ROLE_VALUES.MODERATOR;
}

export function isWholesaleRole(role) {
    const normalized = normalizeUserRole(role);
    return normalized === USER_ROLE_VALUES.CST_WHOLESALE || normalized === USER_ROLE_VALUES.ADMIN || normalized === USER_ROLE_VALUES.MODERATOR;
}

export function getUserRoleLabel(role) {
    const normalized = normalizeUserRole(role);

    if (normalized === USER_ROLE_VALUES.ADMIN) return 'Admin';
    if (normalized === USER_ROLE_VALUES.MODERATOR) return 'Moderator';
    if (normalized === USER_ROLE_VALUES.CST_WHOLESALE) return 'CST. Wholesale';
    return 'CST. Retail';
}

export function getUserRoleBadgeTone(role) {
    const normalized = normalizeUserRole(role);

    if (normalized === USER_ROLE_VALUES.ADMIN) {
        return 'border-red-400/35 bg-red-500/12 text-red-300';
    }

    if (normalized === USER_ROLE_VALUES.MODERATOR) {
        return 'border-violet-400/35 bg-violet-500/12 text-violet-300';
    }

    if (normalized === USER_ROLE_VALUES.CST_WHOLESALE) {
        return 'border-brandGold/35 bg-brandGold/10 text-brandGold';
    }

    return 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300';
}