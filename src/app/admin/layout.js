'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { GalleryProvider } from '@/contexts/GalleryContext';
import { isAdminRole, normalizeUserRole } from '@/lib/user-roles';

export default function AdminLayout({ children }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
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
            <div className="relative flex min-h-screen bg-[#060b17] text-white">
                <AdminSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
                <div className="flex-1 lg:ml-24 flex flex-col min-w-0 transition-all duration-300">
                    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/8 bg-[#11192b]/95 px-4 backdrop-blur-xl lg:hidden">
                        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-400 hover:text-brandGold">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <span className="font-bold text-brandGold">Admin</span>
                        <div className="w-6"></div>
                    </header>
                    <main className="w-full overflow-y-auto p-4 md:p-6 lg:p-7">
                        {children}
                    </main>
                </div>
            </div>
        </GalleryProvider>
    );
}
