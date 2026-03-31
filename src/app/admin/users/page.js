'use client';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseTimestamp } from '@/lib/utils/format';

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUserRole, setCurrentUserRole] = useState('moderator'); // Default, will check session storage

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setCurrentUserRole(sessionStorage.getItem('userRole') || 'moderator');
        }

        const q = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let usersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Sort to put admins on top, then newer users. Alternatively, just sort by date if it exists.
            usersData.sort((a, b) => {
                if (a.role === 'admin' && b.role !== 'admin') return -1;
                if (a.role !== 'admin' && b.role === 'admin') return 1;
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });
            
            setUsers(usersData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleRoleChange = async (userId, newRole) => {
        if (currentUserRole !== 'admin') {
            alert('Only Super Admins can change user roles.');
            return;
        }

        try {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, { role: newRole });
        } catch (error) {
            console.error('Error updating role:', error);
            alert('Failed to update user role');
        }
    };

    const handleDelete = async (userId) => {
        if (currentUserRole !== 'admin') {
            alert('Only Super Admins can delete users.');
            return;
        }

        if (!window.confirm('Are you sure you want to permanently delete this user profile?')) return;
        try {
            await deleteDoc(doc(db, 'users', userId));
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Failed to delete user');
        }
    };

    const ROLE_COLORS = {
        admin: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-500',
        moderator: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-500',
        user: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
    };

    if (loading) return <div className="p-8 text-center">Loading users...</div>;

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-brandBlue dark:text-white mb-2">User Management</h1>
                    <p className="text-gray-500 dark:text-gray-400">View registered users and manage their access roles.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-darkCard rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-500 dark:text-gray-400">
                                <th className="p-4">User</th>
                                <th className="p-4">Email Details</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Joined Date</th>
                                <th className="p-4">Role</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-gray-400">No users found.</td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20">
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900 dark:text-white">{user.name || 'Anonymous User'}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {user.id.slice(0, 8)}...</div>
                                        </td>
                                        <td className="p-4 text-sm font-medium text-brandBlue dark:text-gray-300">
                                            {user.email || 'No email'}
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                                            {user.phone || ''}
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                                            {parseTimestamp(user.createdAt)}
                                        </td>
                                        <td className="p-4">
                                            {currentUserRole === 'admin' ? (
                                                <select 
                                                    value={user.role || 'user'}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                    className={'text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brandBlue ' + (ROLE_COLORS[user.role || 'user'] || ROLE_COLORS['user'])}
                                                >
                                                    <option value="user">User</option>
                                                    <option value="moderator">Moderator</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                            ) : (
                                                <span className={'inline-flex px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ' + (ROLE_COLORS[user.role || 'user'] || ROLE_COLORS['user'])}>
                                                    {user.role || 'user'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right flex justify-end">
                                            <button 
                                                onClick={() => handleDelete(user.id)}
                                                disabled={currentUserRole !== 'admin'}
                                                className={'w-8 h-8 rounded-xl flex items-center justify-center transition-colors ' + (currentUserRole === 'admin' ? 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-gray-50 text-gray-400 cursor-not-allowed dark:bg-gray-800')}
                                                title="Delete User"
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


