'use client';
import { useGallery } from '@/contexts/GalleryContext';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

export default function DashboardStats() {
    const { allProducts } = useGallery();
    const [ordersCount, setOrdersCount] = useState(0);
    const [totalRevenue, setTotalRevenue] = useState(0);

    useEffect(() => {
        const q = query(collection(db, 'orders'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOrdersCount(snapshot.docs.length);
            
            let revenue = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'cancelled') {
                    revenue += Number(data.totalPrice || 0);
                }
            });
            setTotalRevenue(revenue);
        });

        return () => unsubscribe();
    }, []);

    const statCards = [
        { label: 'Total Products', value: allProducts.length, icon: 'fa-box', color: 'text-brandGold', bg: 'bg-brandGold/10', link: '/admin/products' },
        { label: 'Total Orders', value: ordersCount, icon: 'fa-shopping-cart', color: 'text-blue-500', bg: 'bg-blue-500/10', link: '/admin/orders' },
        { label: 'Total Revenue', value: totalRevenue.toLocaleString() + ' AED', icon: 'fa-chart-line', color: 'text-green-500', bg: 'bg-green-500/10', link: '/admin/orders' },
        { label: 'Stock Sync Module', value: 'Active', icon: 'fa-rotate', color: 'text-purple-500', bg: 'bg-purple-500/10', link: '/admin/stock' }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((stat, idx) => (
                <Link key={idx} href={stat.link} className="bg-white dark:bg-darkCard rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 group">
                    <div className="flex items-center gap-4">
                        <div className={'w-14 h-14 rounded-2xl flex items-center justify-center ' + stat.bg + ' ' + stat.color + ' group-hover:scale-110 transition-transform'}>
                            <i className={'fa-solid ' + stat.icon + ' text-2xl'}></i>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                            <h3 className="text-2xl font-black text-brandBlue dark:text-white">{stat.value}</h3>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}
