'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useResellerAccess } from '@/lib/use-reseller-access';

const NAV_ITEMS = [
    {
        href: '/reseller',
        label: 'Dashboard',
        description: 'Daily KPIs and quick actions',
        exact: true
    },
    {
        href: '/reseller/orders/new',
        label: 'New Order',
        description: 'Create a customer order',
        exact: false
    },
    {
        href: '/reseller/orders',
        label: 'My Orders',
        description: 'Review reseller-created orders',
        exact: false
    },
    {
        href: '/reseller/daily-summary',
        label: 'Daily Summary',
        description: 'Today\'s settlement batch',
        exact: false
    }
];

function isNavItemActive(item, pathname) {
    if (item.exact) {
        return pathname === item.href;
    }

    return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function ResellerLayout({ children }) {
    const pathname = usePathname();
    const {
        checking,
        allowed,
        profile,
        role
    } = useResellerAccess({
        unauthorizedRedirect: '/',
        loginRedirect: '/login'
    });

    if (checking && !allowed) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#0a0f1d]">
                <div className="flex animate-pulse flex-col items-center">
                    <div className="h-12 w-12 rounded-full border-4 border-brandGold border-t-transparent animate-spin"></div>
                    <p className="mt-4 text-sm font-bold uppercase tracking-widest text-brandGold">Loading reseller workspace...</p>
                </div>
            </div>
        );
    }

    if (!allowed) {
        return null;
    }

    const resellerName = String(profile?.name || profile?.displayName || profile?.email || 'Reseller').trim();

    return (
        <div className="min-h-screen bg-[#060b17] text-white">
            <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 md:px-6 md:py-6 lg:px-7 lg:py-7">
                <header className="rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.14),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Reseller Workspace</p>
                            <h1 className="mt-2.5 text-[2rem] font-black text-brandGold md:text-[2.35rem]">Branch Pickup Selling Hub</h1>
                            <p className="mt-2 max-w-3xl text-sm text-slate-400">This workspace is isolated from the public website flow. It is reserved for reseller orders, reseller reporting, and daily settlement batches only.</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-2 rounded-full border border-brandGold/20 bg-brandGold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold">
                                <i className="fa-solid fa-badge-percent text-[11px]"></i>
                                {role || 'reseller'}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200">
                                <i className="fa-solid fa-user"></i>
                                {resellerName}
                            </span>
                        </div>
                    </div>

                    <nav className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {NAV_ITEMS.map((item) => {
                            const isActive = isNavItemActive(item, pathname);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={isActive
                                        ? 'rounded-[1.35rem] border border-brandGold/25 bg-brandGold/12 px-4 py-4 shadow-[0_14px_34px_rgba(212,175,55,0.08)]'
                                        : 'rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-4 transition-colors hover:border-brandGold/18 hover:bg-white/[0.045]'}
                                >
                                    <p className={isActive ? 'text-sm font-black text-brandGold' : 'text-sm font-black text-white'}>{item.label}</p>
                                    <p className="mt-1 text-xs leading-6 text-slate-400">{item.description}</p>
                                </Link>
                            );
                        })}
                    </nav>
                </header>

                {children}
            </main>
        </div>
    );
}