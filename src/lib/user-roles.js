export const USER_ROLE_VALUES = {
    ADMIN: 'admin',
    MODERATOR: 'moderator',
    CST_WHOLESALE: 'cst_wholesale',
    CST_RETAIL: 'customer'
};

export const ROLE_PERMISSION_KEYS = {
    ACCESS_ADMIN: 'accessAdmin',
    VIEW_DASHBOARD: 'viewDashboard',
    VIEW_PRODUCTS: 'viewProducts',
    VIEW_STOCK: 'viewStock',
    VIEW_ORDERS: 'viewOrders',
    VIEW_USERS: 'viewUsers',
    MANAGE_USERS: 'manageUsers',
    VIEW_ROLES: 'viewRoles',
    MANAGE_ROLES: 'manageRoles'
};

const DEFAULT_ROLE_PERMISSIONS = {
    [ROLE_PERMISSION_KEYS.ACCESS_ADMIN]: false,
    [ROLE_PERMISSION_KEYS.VIEW_DASHBOARD]: false,
    [ROLE_PERMISSION_KEYS.VIEW_PRODUCTS]: false,
    [ROLE_PERMISSION_KEYS.VIEW_STOCK]: false,
    [ROLE_PERMISSION_KEYS.VIEW_ORDERS]: false,
    [ROLE_PERMISSION_KEYS.VIEW_USERS]: false,
    [ROLE_PERMISSION_KEYS.MANAGE_USERS]: false,
    [ROLE_PERMISSION_KEYS.VIEW_ROLES]: false,
    [ROLE_PERMISSION_KEYS.MANAGE_ROLES]: false
};

export const ROLE_PERMISSION_GROUPS = [
    {
        id: 'workspace-access',
        title: 'Workspace Access',
        permissions: [
            {
                key: ROLE_PERMISSION_KEYS.ACCESS_ADMIN,
                label: 'Access Admin Panel',
                description: 'Allows the role to sign in to the admin workspace.'
            }
        ]
    },
    {
        id: 'page-visibility',
        title: 'Page Visibility',
        permissions: [
            {
                key: ROLE_PERMISSION_KEYS.VIEW_DASHBOARD,
                label: 'View Dashboard',
                description: 'Shows the admin overview and dashboard shortcuts.'
            },
            {
                key: ROLE_PERMISSION_KEYS.VIEW_PRODUCTS,
                label: 'View Products',
                description: 'Allows opening the admin products page.'
            },
            {
                key: ROLE_PERMISSION_KEYS.VIEW_STOCK,
                label: 'View Stock Sync',
                description: 'Allows opening the stock sync page.'
            },
            {
                key: ROLE_PERMISSION_KEYS.VIEW_ORDERS,
                label: 'View Orders',
                description: 'Allows opening the orders workspace.'
            },
            {
                key: ROLE_PERMISSION_KEYS.VIEW_USERS,
                label: 'View Users',
                description: 'Allows opening the users page.'
            },
            {
                key: ROLE_PERMISSION_KEYS.VIEW_ROLES,
                label: 'View Roles',
                description: 'Allows opening the roles page.'
            }
        ]
    },
    {
        id: 'management-actions',
        title: 'Management Actions',
        permissions: [
            {
                key: ROLE_PERMISSION_KEYS.MANAGE_USERS,
                label: 'Manage Users',
                description: 'Allows updating user roles and deleting user accounts.'
            },
            {
                key: ROLE_PERMISSION_KEYS.MANAGE_ROLES,
                label: 'Manage Roles',
                description: 'Allows creating, editing, and deleting custom roles.'
            }
        ]
    }
];

function normalizeRoleLabel(value) {
    return String(value || '').trim().slice(0, 64);
}

function normalizeRoleDescription(value) {
    return String(value || '').trim().slice(0, 280);
}

function humanizeRoleKey(roleKey) {
    return String(roleKey || '')
        .split(/[_-]+/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Custom Role';
}

export function normalizeRoleKey(role) {
    return String(role || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

export function normalizeRolePermissions(permissions = {}) {
    const normalizedPermissions = { ...DEFAULT_ROLE_PERMISSIONS };

    Object.keys(DEFAULT_ROLE_PERMISSIONS).forEach((permissionKey) => {
        normalizedPermissions[permissionKey] = permissions?.[permissionKey] === true;
    });

    return normalizedPermissions;
}

function buildRoleDefinition({
    key = '',
    label = '',
    description = '',
    permissions = {},
    isSystem = false,
    sortOrder = 100
} = {}) {
    const normalizedKey = normalizeRoleKey(key);
    const normalizedPermissions = normalizeRolePermissions(permissions);

    if (!normalizedKey) {
        return null;
    }

    return {
        key: normalizedKey,
        label: normalizeRoleLabel(label) || humanizeRoleKey(normalizedKey),
        description: normalizeRoleDescription(description),
        permissions: normalizedPermissions,
        isSystem: isSystem === true,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100
    };
}

export const SYSTEM_ROLE_DEFINITIONS = Object.freeze({
    [USER_ROLE_VALUES.ADMIN]: buildRoleDefinition({
        key: USER_ROLE_VALUES.ADMIN,
        label: 'Admin',
        description: 'Full access to the admin workspace and user management.',
        permissions: {
            accessAdmin: true,
            viewDashboard: true,
            viewProducts: true,
            viewStock: true,
            viewOrders: true,
            viewUsers: true,
            manageUsers: true,
            viewRoles: true,
            manageRoles: true
        },
        isSystem: true,
        sortOrder: 0
    }),
    [USER_ROLE_VALUES.MODERATOR]: buildRoleDefinition({
        key: USER_ROLE_VALUES.MODERATOR,
        label: 'Moderator',
        description: 'Operational access without role or user management permissions.',
        permissions: {
            accessAdmin: true,
            viewDashboard: true,
            viewProducts: true,
            viewStock: true,
            viewOrders: true,
            viewUsers: true,
            manageUsers: false,
            viewRoles: false,
            manageRoles: false
        },
        isSystem: true,
        sortOrder: 10
    }),
    [USER_ROLE_VALUES.CST_WHOLESALE]: buildRoleDefinition({
        key: USER_ROLE_VALUES.CST_WHOLESALE,
        label: 'CST. Wholesale',
        description: 'Wholesale storefront access without admin workspace permissions.',
        permissions: {},
        isSystem: true,
        sortOrder: 30
    }),
    [USER_ROLE_VALUES.CST_RETAIL]: buildRoleDefinition({
        key: USER_ROLE_VALUES.CST_RETAIL,
        label: 'CST. Retail',
        description: 'Default storefront customer role.',
        permissions: {},
        isSystem: true,
        sortOrder: 40
    })
});

export function getDefaultResellerRoleDefinition() {
    return buildRoleDefinition({
        key: 'reseller',
        label: 'Reseller',
        description: 'Custom admin-facing role template for reseller staff.',
        permissions: {
            accessAdmin: true,
            viewDashboard: true,
            viewProducts: true,
            viewStock: false,
            viewOrders: true,
            viewUsers: false,
            manageUsers: false,
            viewRoles: false,
            manageRoles: false
        },
        isSystem: false,
        sortOrder: 20
    });
}

export function getSystemRoleDefinitions() {
    return Object.values(SYSTEM_ROLE_DEFINITIONS);
}

export function mergeRoleDefinitions(roleDefinitions = []) {
    const mergedDefinitions = new Map();

    getSystemRoleDefinitions().forEach((roleDefinition) => {
        mergedDefinitions.set(roleDefinition.key, roleDefinition);
    });

    roleDefinitions.forEach((roleDefinition) => {
        const normalizedRoleDefinition = buildRoleDefinition({
            key: roleDefinition?.key || roleDefinition?.id || roleDefinition?.role || roleDefinition?.name,
            label: roleDefinition?.label || roleDefinition?.name,
            description: roleDefinition?.description,
            permissions: roleDefinition?.permissions,
            isSystem: roleDefinition?.isSystem,
            sortOrder: roleDefinition?.sortOrder
        });

        if (!normalizedRoleDefinition || normalizedRoleDefinition.isSystem || SYSTEM_ROLE_DEFINITIONS[normalizedRoleDefinition.key]) {
            return;
        }

        mergedDefinitions.set(normalizedRoleDefinition.key, normalizedRoleDefinition);
    });

    return Array.from(mergedDefinitions.values()).sort((leftRole, rightRole) => {
        if (leftRole.sortOrder !== rightRole.sortOrder) {
            return leftRole.sortOrder - rightRole.sortOrder;
        }

        return leftRole.label.localeCompare(rightRole.label);
    });
}

export function getRoleDefinition(role, roleDefinitions = []) {
    const normalizedRole = normalizeUserRole(role);
    const mergedDefinitions = mergeRoleDefinitions(roleDefinitions);
    const matchingRole = mergedDefinitions.find((roleDefinition) => roleDefinition.key === normalizedRole);

    if (matchingRole) {
        return matchingRole;
    }

    return buildRoleDefinition({
        key: normalizedRole,
        label: humanizeRoleKey(normalizedRole),
        description: '',
        permissions: {},
        isSystem: false,
        sortOrder: 90
    });
}

export function hasRolePermission(role, permissionKey, roleDefinitions = []) {
    const roleDefinition = getRoleDefinition(role, roleDefinitions);
    return roleDefinition?.permissions?.[permissionKey] === true;
}

export function canAccessAdminArea(role, roleDefinitions = []) {
    return hasRolePermission(role, ROLE_PERMISSION_KEYS.ACCESS_ADMIN, roleDefinitions);
}

export function canManageUsers(role, roleDefinitions = []) {
    return hasRolePermission(role, ROLE_PERMISSION_KEYS.MANAGE_USERS, roleDefinitions);
}

export function canManageRoles(role, roleDefinitions = []) {
    return hasRolePermission(role, ROLE_PERMISSION_KEYS.MANAGE_ROLES, roleDefinitions);
}

export function getUserRoleSortOrder(role, roleDefinitions = []) {
    return getRoleDefinition(role, roleDefinitions)?.sortOrder ?? 999;
}

export const MANAGEABLE_USER_ROLES = [
    USER_ROLE_VALUES.CST_RETAIL,
    USER_ROLE_VALUES.CST_WHOLESALE,
    USER_ROLE_VALUES.MODERATOR,
    USER_ROLE_VALUES.ADMIN
];

export function normalizeUserRole(role) {
    const normalized = normalizeRoleKey(role).replace(/[.]+/g, '_');

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
    return canAccessAdminArea(role);
}

export function isWholesaleRole(role) {
    const normalized = normalizeUserRole(role);
    return normalized === USER_ROLE_VALUES.CST_WHOLESALE || normalized === USER_ROLE_VALUES.ADMIN || normalized === USER_ROLE_VALUES.MODERATOR;
}

export function getUserRoleLabel(role, roleDefinitions = []) {
    return getRoleDefinition(role, roleDefinitions).label;
}

export function getUserRoleBadgeTone(role, roleDefinitions = []) {
    const normalized = normalizeUserRole(role);
    const roleDefinition = getRoleDefinition(normalized, roleDefinitions);

    if (normalized === USER_ROLE_VALUES.ADMIN) {
        return 'border-red-400/35 bg-red-500/12 text-red-300';
    }

    if (normalized === USER_ROLE_VALUES.MODERATOR) {
        return 'border-violet-400/35 bg-violet-500/12 text-violet-300';
    }

    if (normalized === USER_ROLE_VALUES.CST_WHOLESALE) {
        return 'border-brandGold/35 bg-brandGold/10 text-brandGold';
    }

    if (roleDefinition.permissions.accessAdmin) {
        return 'border-sky-400/35 bg-sky-500/12 text-sky-200';
    }

    return 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300';
}