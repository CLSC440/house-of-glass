'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { GalleryProvider } from '@/contexts/GalleryContext';
import { isAdminRole, normalizeUserRole } from '@/lib/user-roles';
import NotificationsCenter from '@/components/layout/NotificationsCenter';

export default function AdminLayout({ children }) {
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const router = useRouter();

    useEffect(() => {
        // Quick session check for perceived performance
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('isAdmin');
            if (isAdmin === 'true') {
                setIsAuthorized(true);
                setIsCheckingAuth(false);
            }
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user || null);
            if (!user) {
                sessionStorage.removeItem('isAdmin');
                router.push('/login');
                return;
            }

            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const normalizedRole = normalizeUserRole(userData.role);
                    if (isAdminRole(normalizedRole)) {
                        sessionStorage.setItem('isAdmin', 'true');
                        sessionStorage.setItem('userRole', normalizedRole);
                        setIsAuthorized(true);
                        setIsCheckingAuth(false);
                        return;
                    }
                }
                
                // Not an admin
                sessionStorage.removeItem('isAdmin');
                router.push('/');
            } catch (err) {
                console.error("Auth check error:", err);
                router.push('/login');
            }
        });

        return () => unsubscribe();
    }, [router]);

    if (isCheckingAuth && !isAuthorized) {
        return (
            <div className="min-h-screen bg-[#0a0f1d] flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-brandGold border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-brandGold font-bold tracking-widest text-sm uppercase">Authenticating...</p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) return null;

    return (
        <GalleryProvider>
            <div className="min-h-screen bg-[#060b17] text-white">
                <NotificationsCenter user={currentUser} variant="admin" />
                <main className="w-full overflow-y-auto p-4 md:p-6 lg:p-7">
                    {children}
                </main>
            </div>
        </GalleryProvider>
    );
}
