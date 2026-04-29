'use client';
import { ROLE_PERMISSION_KEYS } from '@/lib/user-roles';
import { GalleryProvider } from '@/contexts/GalleryContext';
import NotificationsCenter from '@/components/layout/NotificationsCenter';
import { useAdminAccess } from '@/lib/use-admin-access';

export default function AdminLayout({ children }) {
    const {
        checking: isCheckingAuth,
        allowed: isAuthorized,
        user: currentUser
    } = useAdminAccess({
        requiredPermission: ROLE_PERMISSION_KEYS.ACCESS_ADMIN,
        unauthorizedRedirect: '/',
        loginRedirect: '/login'
    });

    if (isCheckingAuth && !isAuthorized) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0a0f1d]">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-brandGold border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm font-bold uppercase tracking-widest text-brandBlue dark:text-brandGold">Authenticating...</p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) return null;

    return (
        <GalleryProvider>
            <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-[#060b17] dark:text-white">
                <NotificationsCenter user={currentUser} variant="admin" />
                <main className="w-full overflow-y-auto p-4 md:p-6 lg:p-7">
                    {children}
                </main>
            </div>
        </GalleryProvider>
    );
}
