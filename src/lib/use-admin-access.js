'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { isAdminRole, normalizeUserRole, USER_ROLE_VALUES } from '@/lib/user-roles';

export function useAdminAccess(options = {}) {
    const { adminOnly = false, unauthorizedRedirect = '/', loginRedirect = '/login' } = options;
    const [accessState, setAccessState] = useState({
        checking: true,
        allowed: false,
        user: null,
        role: '',
        error: ''
    });
    const router = useRouter();

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const cachedIsAdmin = sessionStorage.getItem('isAdmin') === 'true';
            const cachedRole = normalizeUserRole(sessionStorage.getItem('userRole'));
            const hasAccess = adminOnly
                ? cachedRole === USER_ROLE_VALUES.ADMIN
                : cachedIsAdmin && isAdminRole(cachedRole);

            if (hasAccess) {
                setAccessState((currentValue) => ({
                    ...currentValue,
                    checking: false,
                    allowed: true,
                    role: cachedRole
                }));
            }
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                sessionStorage.removeItem('isAdmin');
                sessionStorage.removeItem('userRole');
                setAccessState({
                    checking: false,
                    allowed: false,
                    user: null,
                    role: '',
                    error: 'Login required'
                });
                router.push(loginRedirect);
                return;
            }

            try {
                const userSnapshot = await getDoc(doc(db, 'users', currentUser.uid));
                const normalizedRole = normalizeUserRole(userSnapshot.exists() ? userSnapshot.data()?.role : '');
                const allowed = adminOnly
                    ? normalizedRole === USER_ROLE_VALUES.ADMIN
                    : isAdminRole(normalizedRole);

                if (!allowed) {
                    sessionStorage.setItem('userRole', normalizedRole || '');
                    sessionStorage.setItem('isAdmin', isAdminRole(normalizedRole) ? 'true' : 'false');
                    setAccessState({
                        checking: false,
                        allowed: false,
                        user: currentUser,
                        role: normalizedRole,
                        error: adminOnly ? 'Admin access required' : 'Admin or moderator access required'
                    });
                    router.push(unauthorizedRedirect);
                    return;
                }

                sessionStorage.setItem('userRole', normalizedRole || '');
                sessionStorage.setItem('isAdmin', 'true');
                setAccessState({
                    checking: false,
                    allowed: true,
                    user: currentUser,
                    role: normalizedRole,
                    error: ''
                });
            } catch (error) {
                console.error('Admin access check failed:', error);
                setAccessState({
                    checking: false,
                    allowed: false,
                    user: currentUser,
                    role: '',
                    error: error.message || 'Could not verify access'
                });
                router.push(loginRedirect);
            }
        });

        return () => unsubscribe();
    }, [adminOnly, loginRedirect, router, unauthorizedRedirect]);

    return accessState;
}