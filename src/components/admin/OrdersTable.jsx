'use client';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { parseTimestamp } from '@/lib/utils/format';

export default function OrdersTable() {
    const [recentOrders, setRecentOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'orders'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            orders.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
            orders = orders.slice(0, 5);
            setRecentOrders(orders);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const STATUS_COLORS = {
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
        processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
        shipped: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-500',
        completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
        cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500'
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-400">Loading recent orders...</div>;
    }

    return (
        <div className="bg-white dark:bg-darkCard rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-brandBlue dark:text-white">Recent Orders</h2>
                <Link href="/admin/orders" className="text-sm font-semibold text-brandGold hover:text-brandBlue transition-colors">
                    View All Orders <i className="fa-solid fa-arrow-right ml-1"></i>
                </Link>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-500 dark:text-gray-400">
                            <th className="pb-4 pr-4 uppercase tracking-wider">Order ID</th>
                            <th className="pb-4 px-4 uppercase tracking-wider">Customer</th>
                            <th className="pb-4 px-4 uppercase tracking-wider">Date</th>
                            <th className="pb-4 px-4 uppercase tracking-wider">Amount</th>
                            <th className="pb-4 px-4 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recentOrders.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="text-center py-8 text-gray-400">
                                    No recent orders found.
                                </td>
                            </tr>
                        ) : (
                            recentOrders.map((order) => (
                                <tr key={order.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                                    <td className="py-4 pr-4 font-mono text-xs font-semibold text-brandBlue dark:text-gray-300">
                                        #{order.id.slice(0, 8)}
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="font-semibold text-gray-900 dark:text-white">{order.customerInfo?.fullName || 'Guest'}</div>
                                        <div className="text-xs text-gray-500">{order.customerInfo?.phone || ''}</div>
                                    </td>
                                    <td className="py-4 px-4 text-sm text-gray-600 dark:text-gray-400">
                                        {parseTimestamp(order.createdAt)}
                                    </td>
                                    <td className="py-4 px-4 font-bold text-gray-900 dark:text-white">
                                        {(order.totalPrice || 0).toLocaleString()} AED
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={'inline-flex px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ' + STATUS_COLORS[order.status || 'pending']}>
                                            {order.status || 'pending'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

