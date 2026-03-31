'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function AdminSidebar({ isOpen, setIsOpen }) {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut(auth);
        sessionStorage.removeItem('isAdmin');
        sessionStorage.removeItem('userRole');
        router.push('/login');
    };

    return (
        <>
            <div className={`fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsOpen(false)}></div>
            <aside className={`fixed inset-y-0 left-0 w-64 bg-white dark:bg-darkCard border-r border-gray-100 dark:border-gray-800 z-50 transform transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-brandBlue dark:text-brandGold italic">Admin Panel</h2>
                    <button onClick={() => setIsOpen(false)} className="lg:hidden text-gray-400 hover:text-brandBlue dark:hover:text-white">✕</button>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <Link href="/admin" className="block px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold transition-colors">Dashboard</Link>
                    <Link href="/admin/products" className="block px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold transition-colors">Products</Link>
                    <Link href="/admin/stock" className="block px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold transition-colors">Stock Sync</Link>
                    <Link href="/admin/orders" className="block px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold transition-colors">Orders</Link>
                    <Link href="/admin/users" className="block px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold transition-colors">Users</Link>
                </nav>
                <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                    <button onClick={handleSignOut} className="w-full px-4 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-bold transition-colors">Sign Out</button>
                    <Link href="/" className="block mt-2 text-center text-xs text-gray-400 hover:underline">← Back to Gallery</Link>
                </div>
            </aside>
        </>
    );
}
