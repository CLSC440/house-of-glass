'use client';
import { useGallery } from '@/contexts/GalleryContext';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { getOrderAmount } from '@/lib/utils/admin-orders';
import { normalizeOrderStatus } from '@/lib/utils/order-status';

export default function DashboardStats() {
    const { allProducts } = useGallery();
    const [ordersCount, setOrdersCount] = useState(0);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [pendingOrders, setPendingOrders] = useState(0);

    useEffect(() => {
        const q = query(collection(db, 'orders'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOrdersCount(snapshot.docs.length);
            
            let revenue = 0;
            let pending = 0;
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const status = normalizeOrderStatus(data.status);
                if (status !== 'cancelled') {
                    revenue += getOrderAmount(data);
                }
                if (status === 'pending' || status === 'confirmed') {
                    pending += 1;
                }
            });
            setTotalRevenue(revenue);
            setPendingOrders(pending);
        });

        return () => unsubscribe();
    }, []);

    const lowStockProducts = allProducts.filter((product) => {
        const qty = Number(product.remainingQuantity ?? product.totalStock ?? product.total_stock);
        return Number.isFinite(qty) && qty > 0 && qty <= Number(product.lowStockThreshold || 5);
    }).length;

    const statCards = [
        {
            label: 'Total Products',
            value: allProducts.length,
            caption: `${lowStockProducts} low stock items`,
            icon: 'fa-box',
            color: 'text-brandGold',
            bg: 'bg-brandGold/12',
            link: '/admin/products'
        },
        {
            label: 'Orders Queue',
            value: pendingOrders,
            caption: `${ordersCount} total orders`,
            icon: 'fa-cart-shopping',
            color: 'text-[#5b8cff]',
            bg: 'bg-[#5b8cff]/10',
            link: '/admin/orders'
        },
        {
            label: 'Total Revenue',
            value: `${totalRevenue.toLocaleString()} ج.م`,
            caption: 'Completed and active orders',
            icon: 'fa-chart-line',
            color: 'text-[#34d058]',
            bg: 'bg-[#34d058]/10',
            link: '/admin/orders'
        },
        {
            label: 'Stock Sync Module',
            value: 'Active',
            caption: 'Ready for stock operations',
            icon: 'fa-rotate',
            color: 'text-[#9b51e0]',
            bg: 'bg-[#9b51e0]/10',
            link: '/admin/stock'
        }
    ];

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat, idx) => (
                <Link key={idx} href={stat.link} className="group rounded-[1.6rem] border border-white/8 bg-[#161f35] p-5 shadow-[0_18px_40px_rgba(4,8,20,0.24)] transition-all hover:-translate-y-1 hover:border-brandGold/30 hover:shadow-[0_22px_48px_rgba(4,8,20,0.34)]">
                    <div className="flex items-center gap-3.5">
                        <div className={'flex h-14 w-14 items-center justify-center rounded-[1.15rem] ' + stat.bg + ' ' + stat.color + ' transition-transform group-hover:scale-110'}>
                            <i className={'fa-solid ' + stat.icon + ' text-xl'}></i>
                        </div>
                        <div className="min-w-0">
                            <p className="mb-1 text-xs font-medium text-slate-400 md:text-sm">{stat.label}</p>
                            <h3 className="text-xl font-black text-white md:text-[1.75rem]">{stat.value}</h3>
                            <p className="mt-1 text-xs font-medium text-slate-500">{stat.caption}</p>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}
