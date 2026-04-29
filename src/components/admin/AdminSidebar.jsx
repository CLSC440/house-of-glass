'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { normalizeRolePermissions, ROLE_PERMISSION_KEYS } from '@/lib/user-roles';

function readStoredPermissions() {
    if (typeof window === 'undefined') {
        return normalizeRolePermissions();
    }

    try {
        const storedPermissions = sessionStorage.getItem('userPermissions');
        return storedPermissions ? normalizeRolePermissions(JSON.parse(storedPermissions)) : normalizeRolePermissions();
    } catch (_error) {
        return normalizeRolePermissions();
    }
}

export default function AdminSidebar({ isOpen, setIsOpen }) {
    const router = useRouter();
    const pathname = usePathname();
    const [userPermissions] = useState(() => readStoredPermissions());

    const navItems = [
        { href: '/admin', label: 'Dashboard', icon: 'fa-grip' },
        { href: '/admin/products', label: 'Products', icon: 'fa-box', permissionKey: ROLE_PERMISSION_KEYS.VIEW_PRODUCTS },
        { href: '/admin/stock', label: 'Stock Sync', icon: 'fa-arrows-rotate', permissionKey: ROLE_PERMISSION_KEYS.VIEW_STOCK },
        { href: '/admin/orders', label: 'Orders', icon: 'fa-receipt', permissionKey: ROLE_PERMISSION_KEYS.VIEW_ORDERS },
        { href: '/admin/users', label: 'Users', icon: 'fa-users', permissionKey: ROLE_PERMISSION_KEYS.VIEW_USERS },
        { href: '/admin/roles', label: 'Roles', icon: 'fa-user-shield', permissionKey: ROLE_PERMISSION_KEYS.VIEW_ROLES }
    ].filter((item) => !item.permissionKey || userPermissions[item.permissionKey] === true || item.href === '/admin');

    const handleSignOut = async () => {
        await signOut(auth);
        sessionStorage.removeItem('isAdmin');
        sessionStorage.removeItem('userRole');
        sessionStorage.removeItem('userPermissions');
        router.push('/login');
    };

    return (
        <>
            <div className={`fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsOpen(false)}></div>
            <aside className={`group fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col overflow-hidden border-r border-white/10 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.08),transparent_28%),linear-gradient(180deg,#151d31_0%,#101729_100%)] text-white transition-[transform,width] duration-300 lg:w-24 lg:hover:w-64 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-6 lg:px-4 lg:group-hover:px-5 transition-[padding] duration-300">
                    <div className="min-w-0 overflow-hidden">
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70 transition-all duration-300 lg:opacity-0 lg:translate-x-3 lg:group-hover:opacity-100 lg:group-hover:translate-x-0 whitespace-nowrap">House Of Glass</p>
                        <h2 className="mt-2 text-[1.75rem] font-black italic leading-none text-brandGold transition-all duration-300 lg:text-[1.55rem] lg:opacity-0 lg:translate-x-3 lg:group-hover:opacity-100 lg:group-hover:translate-x-0 whitespace-nowrap">Admin Panel</h2>
                        <div className="hidden lg:flex items-center justify-center h-12 text-brandGold transition-all duration-300 group-hover:opacity-0 group-hover:absolute group-hover:pointer-events-none">
                            <i className="fa-solid fa-shield-halved text-2xl"></i>
                        </div>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="lg:hidden text-gray-400 hover:text-brandBlue dark:hover:text-white">✕</button>
                </div>
                <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`relative flex items-center gap-3 rounded-[1.35rem] px-3.5 py-3 font-black transition-all ${isActive ? 'bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_rgba(0,0,0,0.18)] border border-brandGold/20' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white hover:border hover:border-white/10'} lg:justify-center lg:group-hover:justify-start`}
                            >
                                <span className={`absolute left-0 top-1/2 hidden h-8 w-1 -translate-y-1/2 rounded-r-full transition-all duration-300 lg:block ${isActive ? 'bg-brandGold shadow-[0_0_18px_rgba(212,175,55,0.55)] opacity-100' : 'bg-transparent opacity-0 group-hover:bg-white/20 group-hover:opacity-100'}`}></span>
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] transition-all duration-300 ${isActive ? 'bg-brandGold/15 text-brandGold shadow-[0_0_18px_rgba(212,175,55,0.12)]' : 'bg-white/[0.04] text-slate-400 group-hover:bg-white/[0.08] group-hover:text-white'}`}>
                                    <i className={`fa-solid ${item.icon}`}></i>
                                </span>
                                <span className="whitespace-nowrap transition-all duration-300 lg:max-w-0 lg:opacity-0 lg:translate-x-2 lg:overflow-hidden lg:group-hover:max-w-[180px] lg:group-hover:opacity-100 lg:group-hover:translate-x-0">{item.label}</span>
                                {!isActive ? <span className="pointer-events-none absolute inset-0 rounded-[1.35rem] opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[linear-gradient(90deg,rgba(255,255,255,0.05),transparent_45%)]"></span> : null}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto border-t border-white/8 px-4 py-5">
                    <button onClick={handleSignOut} className="flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-3 text-base font-black text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 lg:group-hover:justify-start">
                        <i className="fa-solid fa-right-from-bracket shrink-0"></i>
                        <span className="whitespace-nowrap transition-all duration-300 lg:max-w-0 lg:opacity-0 lg:translate-x-2 lg:overflow-hidden lg:group-hover:max-w-[180px] lg:group-hover:opacity-100 lg:group-hover:translate-x-0">Sign Out</span>
                    </button>
                    <Link href="/" className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-400 transition-colors hover:text-brandGold lg:group-hover:justify-start">
                        <i className="fa-solid fa-arrow-left shrink-0"></i>
                        <span className="whitespace-nowrap transition-all duration-300 lg:max-w-0 lg:opacity-0 lg:translate-x-2 lg:overflow-hidden lg:group-hover:max-w-[180px] lg:group-hover:opacity-100 lg:group-hover:translate-x-0">Back to Gallery</span>
                    </Link>
                </div>
            </aside>
        </>
    );
}
