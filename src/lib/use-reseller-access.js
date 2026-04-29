'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { normalizeUserRole } from '@/lib/user-roles';

const RESELLER_ROLE_KEY = 'reseller';

function createInitialAccessState() {
    return {
        checking: true,
        allowed: false,
        user: null,
        role: '',
        profile: null,
        error: ''
    };
}

export function useResellerAccess(options = {}) {
    const {
        unauthorizedRedirect = '/',
        loginRedirect = '/login'
    } = options;
    const [accessState, setAccessState] = useState(() => createInitialAccessState());
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
                    profile: null,
                    error: 'Login required'
                });
                router.push(loginRedirect);
                return;
            }

            try {
                const userSnapshot = await getDoc(doc(db, 'users', currentUser.uid));
                const profile = userSnapshot.exists() ? userSnapshot.data() : null;
                const normalizedRole = normalizeUserRole(profile?.role);
                const allowed = normalizedRole === RESELLER_ROLE_KEY;

                sessionStorage.setItem('userRole', normalizedRole || '');

                if (!allowed) {
                    setAccessState({
                        checking: false,
                        allowed: false,
                        user: currentUser,
                        role: normalizedRole,
                        profile,
                        error: 'Reseller access required'
                    });
                    router.push(unauthorizedRedirect);
                    return;
                }

                setAccessState({
                    checking: false,
                    allowed: true,
                    user: currentUser,
                    role: normalizedRole,
                    profile,
                    error: ''
                });
            } catch (error) {
                console.error('Reseller access check failed:', error);
                setAccessState({
                    checking: false,
                    allowed: false,
                    user: currentUser,
                    role: '',
                    profile: null,
                    error: error.message || 'Could not verify reseller access'
                });
                router.push(loginRedirect);
            }
        });

        return () => unsubscribe();
    }, [loginRedirect, router, unauthorizedRedirect]);

    return accessState;
}