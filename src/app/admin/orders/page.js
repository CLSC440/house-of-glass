'use client';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseTimestamp } from '@/lib/utils/format';

export default function AdminOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'orders'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let ordersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            ordersData.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
            setOrders(ordersData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleStatusChange = async (orderId, newStatus) => {
        try {
            const orderRef = doc(db, 'orders', orderId);
            await updateDoc(orderRef, { status: newStatus });
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status');
        }
    };

    const handleDelete = async (orderId) => {
        if (!window.confirm('Are you sure you want to delete this order?')) return;
        try {
            await deleteDoc(doc(db, 'orders', orderId));
        } catch (error) {
            console.error('Error deleting order:', error);
            alert('Failed to delete order');
        }
    };

    const STATUS_COLORS = {
        pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-500',
        processing: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-500',
        shipped: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-500',
        completed: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-500',
        cancelled: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-500'
    };

    if (loading) return <div className="p-8 text-center">Loading orders...</div>;

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-brandBlue dark:text-white mb-2">Orders Management</h1>
                    <p className="text-gray-500 dark:text-gray-400">View and manage customer orders.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-darkCard rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-500 dark:text-gray-400">
                                <th className="p-4">Order ID</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Customer</th>
                                <th className="p-4">Items</th>
                                <th className="p-4">Total</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-12 text-gray-400">No orders found.</td>
                                </tr>
                            ) : (
                                orders.map((order) => (
                                    <tr key={order.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20">
                                        <td className="p-4 font-mono text-xs font-semibold text-brandBlue dark:text-gray-300">
                                            #{order.id.slice(0, 8)}
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                                            {parseTimestamp(order.createdAt)}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-semibold text-gray-900 dark:text-white">{order.customerInfo?.fullName || 'Guest'}</div>
                                            <div className="text-xs text-gray-500">{order.customerInfo?.phone || ''}</div>
                                            <div className="text-xs text-gray-400">{order.customerInfo?.governorate || ''}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                {order.items?.length || 0} items
                                            </div>
                                        </td>
                                        <td className="p-4 font-bold text-brandBlue dark:text-white">
                                            {(order.totalPrice || 0).toLocaleString()} AED
                                        </td>
                                        <td className="p-4">
                                            <select 
                                                value={order.status || 'pending'}
                                                onChange={(e) => handleStatusChange(order.id, e.target.value)}
                                                className={'text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brandBlue ' + STATUS_COLORS[order.status || 'pending']}
                                            >
                                                <option value="pending">Pending</option>
                                                <option value="processing">Processing</option>
                                                <option value="shipped">Shipped</option>
                                                <option value="completed">Completed</option>
                                                <option value="cancelled">Cancelled</option>
                                            </select>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button 
                                                onClick={() => handleDelete(order.id)}
                                                className="w-8 h-8 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center ml-auto"
                                                title="Delete Order"
                                            >
                                                <i className="fa-solid fa-trash text-sm"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

