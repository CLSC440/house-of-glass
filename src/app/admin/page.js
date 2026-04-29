"use client";

import { useRouter } from 'next/navigation';
import DashboardStats from '@/components/admin/DashboardStats';
import OrdersTable from '@/components/admin/OrdersTable';
import Link from 'next/link';
import FloatingDockDemo from '@/components/floating-dock-demo';
import { useGallery } from '@/contexts/GalleryContext';
import { useAdminAccess } from '@/lib/use-admin-access';
import { ROLE_PERMISSION_KEYS } from '@/lib/user-roles';

export default function AdminDashboard() {
    const router = useRouter();
    const { allProducts, categories } = useGallery();
    const {
        checking,
        allowed,
        permissions
    } = useAdminAccess({
        requiredPermission: ROLE_PERMISSION_KEYS.ACCESS_ADMIN,
        unauthorizedRedirect: '/'
    });
    const canViewDashboard = permissions.viewDashboard === true;
    const quickLinks = [
        permissions.viewOrders ? { href: '/admin/orders', label: 'Review Orders', secondary: false } : null,
        permissions.accessAdmin ? { href: '/admin/reseller-settlements', label: 'Reseller Settlements', secondary: true } : null,
        permissions.viewProducts ? { href: '/admin/products', label: 'Manage Products', secondary: true } : null,
        permissions.viewUsers ? { href: '/admin/users', label: 'Manage Users', secondary: true } : null,
        permissions.viewRoles ? { href: '/admin/roles', label: 'Roles Page', secondary: true } : null,
        permissions.viewStock ? { href: '/admin/stock', label: 'Stock Sync', secondary: true } : null
    ].filter(Boolean);

    if (checking) {
        return <div className="p-8 text-center">Loading admin workspace...</div>;
    }

    if (!allowed) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5">
            <FloatingDockDemo
                allProducts={allProducts}
                categories={categories}
                onAddProduct={() => router.push('/admin/products?action=add')}
            />

            <header className="rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.14),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Admin Overview</p>
                        <h1 className="mt-2.5 text-[2rem] font-black text-brandGold md:text-[2.35rem]">Dashboard Overview</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-400">{canViewDashboard ? 'Monitor orders, product inventory, and stock sync status from one place. This is the operational heartbeat of the gallery.' : 'This account can access the admin workspace, but dashboard analytics are hidden for this role. Use the available shortcuts below.'}</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {quickLinks.map((link) => (
                            <Link key={link.href} href={link.href} className={link.secondary ? 'inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white transition-colors hover:border-brandGold/30 hover:text-brandGold' : 'inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue'}>
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </header>

            {canViewDashboard ? (
                <>
                    <DashboardStats />
                    <OrdersTable />
                </>
            ) : (
                <section className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-10 text-center shadow-[0_20px_44px_rgba(4,8,20,0.28)]">
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Restricted Dashboard</p>
                    <h2 className="mt-3 text-2xl font-black text-white">Dashboard widgets are not enabled for this role.</h2>
                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">Give this role the View Dashboard permission from the Roles page if it should see overview cards and live order activity on the admin home screen.</p>
                </section>
            )}
        </div>
    );
}