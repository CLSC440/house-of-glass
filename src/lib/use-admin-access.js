'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
    ROLE_PERMISSION_KEYS,
    SYSTEM_ROLE_DEFINITIONS,
    getRoleDefinition,
    hasRolePermission,
    normalizeRolePermissions,
    normalizeUserRole,
    USER_ROLE_VALUES
} from '@/lib/user-roles';

function parseCachedPermissions() {
    if (typeof window === 'undefined') return null;

    try {
        const rawPermissions = sessionStorage.getItem('userPermissions');
        if (!rawPermissions) return null;
        return normalizeRolePermissions(JSON.parse(rawPermissions));
    } catch (_error) {
        return null;
    }
}

function createInitialAccessState(adminOnly, effectivePermission) {
    const defaultState = {
        checking: true,
        allowed: false,
        user: null,
        role: '',
        permissions: normalizeRolePermissions(),
        error: ''
    };

    if (typeof window === 'undefined') {
        return defaultState;
    }

    const cachedRole = normalizeUserRole(sessionStorage.getItem('userRole'));
    const cachedPermissions = parseCachedPermissions() || getRoleDefinition(cachedRole).permissions;
    const hasAccess = adminOnly
        ? cachedRole === USER_ROLE_VALUES.ADMIN
        : hasRolePermission(cachedRole, effectivePermission, [{
            key: cachedRole,
            label: getRoleDefinition(cachedRole).label,
            permissions: cachedPermissions
        }]);

    return {
        ...defaultState,
        checking: !hasAccess,
        allowed: hasAccess,
        role: cachedRole,
        permissions: cachedPermissions
    };
}

export function useAdminAccess(options = {}) {
    const {
        adminOnly = false,
        requiredPermission = '',
        unauthorizedRedirect = '/',
        loginRedirect = '/login'
    } = options;
    const effectivePermission = requiredPermission || (adminOnly ? ROLE_PERMISSION_KEYS.MANAGE_USERS : ROLE_PERMISSION_KEYS.ACCESS_ADMIN);
    const [accessState, setAccessState] = useState(() => createInitialAccessState(adminOnly, effectivePermission));
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                sessionStorage.removeItem('isAdmin');
                sessionStorage.removeItem('userRole');
                sessionStorage.removeItem('userPermissions');
                setAccessState({
                    checking: false,
                    allowed: false,
                    user: null,
                    role: '',
                    permissions: normalizeRolePermissions(),
                    error: 'Login required'
                });
                router.push(loginRedirect);
                return;
            }

            try {
                const userSnapshot = await getDoc(doc(db, 'users', currentUser.uid));
                const normalizedRole = normalizeUserRole(userSnapshot.exists() ? userSnapshot.data()?.role : '');
                const customRoleSnapshot = SYSTEM_ROLE_DEFINITIONS[normalizedRole]
                    ? null
                    : await getDoc(doc(db, 'roles', normalizedRole));
                const roleDefinitions = customRoleSnapshot?.exists()
                    ? [{ key: customRoleSnapshot.id, ...customRoleSnapshot.data() }]
                    : [];
                const roleDefinition = getRoleDefinition(normalizedRole, roleDefinitions);
                const allowed = adminOnly
                    ? normalizedRole === USER_ROLE_VALUES.ADMIN
                    : hasRolePermission(normalizedRole, effectivePermission, roleDefinitions);

                if (!allowed) {
                    sessionStorage.setItem('userRole', normalizedRole || '');
                    sessionStorage.setItem('isAdmin', roleDefinition.permissions.accessAdmin ? 'true' : 'false');
                    sessionStorage.setItem('userPermissions', JSON.stringify(roleDefinition.permissions));
                    setAccessState({
                        checking: false,
                        allowed: false,
                        user: currentUser,
                        role: normalizedRole,
                        permissions: roleDefinition.permissions,
                        error: adminOnly ? 'Admin access required' : 'Permission denied'
                    });
                    router.push(unauthorizedRedirect);
                    return;
                }

                sessionStorage.setItem('userRole', normalizedRole || '');
                sessionStorage.setItem('isAdmin', roleDefinition.permissions.accessAdmin ? 'true' : 'false');
                sessionStorage.setItem('userPermissions', JSON.stringify(roleDefinition.permissions));
                setAccessState({
                    checking: false,
                    allowed: true,
                    user: currentUser,
                    role: normalizedRole,
                    permissions: roleDefinition.permissions,
                    error: ''
                });
            } catch (error) {
                console.error('Admin access check failed:', error);
                setAccessState({
                    checking: false,
                    allowed: false,
                    user: currentUser,
                    role: '',
                    permissions: normalizeRolePermissions(),
                    error: error.message || 'Could not verify access'
                });
                router.push(loginRedirect);
            }
        });

        return () => unsubscribe();
    }, [adminOnly, effectivePermission, loginRedirect, router, unauthorizedRedirect]);

    return accessState;
}