'use client';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { parseTimestamp } from '@/lib/utils/format';
import { getOrderAmount, getOrderCustomerName, getOrderCustomerPhone, getOrderDateValue, getOrderExternalRef } from '@/lib/utils/admin-orders';

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
        pending: 'bg-yellow-500/10 text-yellow-300',
        processing: 'bg-blue-500/10 text-blue-300',
        shipped: 'bg-indigo-500/10 text-indigo-300',
        completed: 'bg-green-500/10 text-green-400',
        cancelled: 'bg-red-500/10 text-red-400'
    };

    if (loading) {
        return <div className="rounded-[1.7rem] border border-white/8 bg-[#161f35] p-7 text-center text-slate-400">Loading recent orders...</div>;
    }

    return (
        <div className="rounded-[1.7rem] border border-white/8 bg-[#161f35] p-5 shadow-[0_18px_40px_rgba(4,8,20,0.24)] md:p-6">
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-white md:text-2xl">Recent Orders</h2>
                    <p className="mt-1 text-xs text-slate-400 md:text-sm">Latest customer activity across retail and wholesale flows.</p>
                </div>
                <Link href="/admin/orders" className="text-xs font-semibold text-brandGold transition-colors hover:text-white md:text-sm">
                    View All Orders <i className="fa-solid fa-arrow-right ml-1"></i>
                </Link>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/8 text-xs font-semibold text-slate-400 md:text-sm">
                            <th className="pb-3 pr-4 uppercase tracking-wider">Order ID</th>
                            <th className="px-4 pb-3 uppercase tracking-wider">Customer</th>
                            <th className="px-4 pb-3 uppercase tracking-wider">Date</th>
                            <th className="px-4 pb-3 uppercase tracking-wider">Amount</th>
                            <th className="px-4 pb-3 uppercase tracking-wider">Type</th>
                            <th className="px-4 pb-3 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recentOrders.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="py-10 text-center text-slate-500">
                                    No recent orders found.
                                </td>
                            </tr>
                        ) : (
                            recentOrders.map((order) => (
                                <tr key={order.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                                    <td className="py-4 pr-4 font-mono text-[11px] font-semibold text-slate-300 md:text-xs">
                                        #{getOrderExternalRef(order)}
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="text-sm font-semibold text-white md:text-base">{getOrderCustomerName(order)}</div>
                                        <div className="text-[11px] text-slate-500 md:text-xs">{getOrderCustomerPhone(order)}</div>
                                    </td>
                                    <td className="px-4 py-4 text-xs text-slate-400 md:text-sm">
                                        {parseTimestamp(getOrderDateValue(order))}
                                    </td>
                                    <td className="px-4 py-4 font-bold text-white">
                                        {getOrderAmount(order).toLocaleString()} ج.م
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${order.orderType === 'wholesale' ? 'bg-brandGold/10 text-brandGold' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                            {order.orderType || 'retail'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider md:text-xs ' + STATUS_COLORS[order.status || 'pending']}>
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

