'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { GalleryProvider } from '@/contexts/GalleryContext';

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
                    if (userData.role === 'admin' || userData.role === 'moderator') {
                        sessionStorage.setItem('isAdmin', 'true');
                        sessionStorage.setItem('userRole', userData.role);
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
            <div className="min-h-screen bg-gray-50 dark:bg-darkBg flex items-center justify-center">
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
            <div className="min-h-screen bg-gray-50 dark:bg-darkBg flex relative">
                <AdminSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
                <div className="flex-1 lg:ml-64 flex flex-col min-w-0 transition-all">
                    <header className="bg-white dark:bg-darkCard border-b border-gray-100 dark:border-gray-800 h-16 flex items-center justify-between px-4 lg:hidden sticky top-0 z-30">
                        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-500 hover:text-brandGold">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <span className="font-bold text-brandBlue dark:text-brandGold">Admin</span>
                        <div className="w-6"></div>
                    </header>
                    <main className="p-4 md:p-8 overflow-y-auto w-full">        
                        {children}
                    </main>
                </div>
            </div>
        </GalleryProvider>
    );
}
