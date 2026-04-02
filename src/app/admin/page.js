"use client";

import { useRouter } from 'next/navigation';
import DashboardStats from '@/components/admin/DashboardStats';
import OrdersTable from '@/components/admin/OrdersTable';
import Link from 'next/link';
import FloatingDockDemo from '@/components/floating-dock-demo';
import { useGallery } from '@/contexts/GalleryContext';

export default function AdminDashboard() {
    const router = useRouter();
    const { allProducts, categories } = useGallery();

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6">
            <FloatingDockDemo
                allProducts={allProducts}
                categories={categories}
                onAddProduct={() => router.push('/admin/products')}
            />

            <header className="rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.14),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Admin Overview</p>
                        <h1 className="mt-2.5 text-[2rem] font-black text-brandGold md:text-[2.35rem]">Dashboard Overview</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-400">Monitor orders, product inventory, and stock sync status from one place. This is the operational heartbeat of the gallery.</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link href="/admin/orders" className="inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                            Review Orders
                        </Link>
                        <Link href="/admin/products" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white transition-colors hover:border-brandGold/30 hover:text-brandGold">
                            Manage Products
                        </Link>
                    </div>
                </div>
            </header>

            <DashboardStats />
            <OrdersTable />
        </div>
    );
}