'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { deleteOwnAccount, upsertCurrentUserProfile } from '@/lib/account-api';
import { parseTimestamp } from '@/lib/utils/format';
import { mergeOrderItemsIntoStorage } from '@/lib/cart-storage';

export default function UserProfile() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        firstName: '',
        lastName: '',
        name: '',
        phone: '',
        email: ''
    });
    const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });

    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                router.push('/login');
                return;
            }
            setUser(currentUser);
            try {
                const docRef = doc(db, 'users', currentUser.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setUserData(data);
                    setFormData({
                        username: data.username || '',
                        firstName: data.firstName || '',
                        lastName: data.lastName || '',
                        name: data.name || '',
                        phone: data.phone || '',
                        email: data.email || data.authEmail || ''
                    });
                }
            } catch (err) {
                console.error("Error fetching user data:", err);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [router]);

    useEffect(() => {
        if (!user) return;
        
        const fetchOrders = async () => {
            try {
                setOrdersLoading(true);
                const userEmail = user.email || (userData ? (userData.email || userData.authEmail) : null);
                if (userEmail) {
                    const q = query(
                        collection(db, 'orders'), 
                        where('customer.email', '==', userEmail)
                    );
                    const querySnapshot = await getDocs(q);
                    let fetchedOrders = [];
                    querySnapshot.forEach((doc) => {
                        fetchedOrders.push({ id: doc.id, ...doc.data() });
                    });

                    fetchedOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                    setOrders(fetchedOrders);
                }
            } catch (err) {
                console.error('Error fetching orders:', err);
            } finally {
                setOrdersLoading(false);
            }
        };

        if (user && !loading) {
            fetchOrders();
        }
    }, [user, loading, userData]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaveMessage({ type: '', text: '' });
        try {
            const response = await upsertCurrentUserProfile(user, {
                username: formData.username,
                firstName: formData.firstName,
                lastName: formData.lastName,
                name: formData.name,
                phone: formData.phone,
                email: formData.email
            });
            setUserData(response.profile);
            setIsEditing(false);
            setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });
            setTimeout(() => setSaveMessage({ type: '', text: '' }), 3000);
        } catch (err) {
            console.error(err);
            setSaveMessage({ type: 'error', text: 'Failed to update profile.' });
        }
    };

    const handleSignOut = async () => {
        await signOut(auth);
        sessionStorage.removeItem('isAdmin');
        sessionStorage.removeItem('userRole');
        router.push('/login');
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm('Delete your account permanently?')) return;
        try {
            await deleteOwnAccount(user);
            sessionStorage.removeItem('isAdmin');
            sessionStorage.removeItem('userRole');
            router.push('/signup');
        } catch (err) {
            console.error(err);
            setSaveMessage({ type: 'error', text: 'Failed to delete account.' });
        }
    };

    const handleOrderAgain = (order) => {
        const restoredCount = mergeOrderItemsIntoStorage(order.items || [], order.orderType || 'retail');
        if (!restoredCount) {
            setSaveMessage({ type: 'error', text: 'No order items could be restored.' });
            return;
        }

        const targetCart = order.orderType === 'wholesale' ? 'wholesale' : 'retail';
        router.push(`/?cart=${targetCart}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-darkBg flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-brandGold border-t-transparent rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 dark:bg-darkBg min-h-screen pt-4 md:pt-10 pb-20">
            <div className="max-w-6xl mx-auto px-4">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <Link href="/" className="inline-flex items-center text-sm font-bold text-gray-500 hover:text-brandGold transition-colors mb-2">
                            <i className="fa-solid fa-arrow-left mr-2"></i> Back to Store
                        </Link>
                        <h1 className="text-3xl font-black text-brandBlue dark:text-white tracking-tight">My Account</h1>
                    </div>
                    <button onClick={handleSignOut} className="px-4 py-2 border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 w-fit">
                        <i className="fa-solid fa-power-off"></i> Sign Out
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Left Column: Personal info */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white dark:bg-darkCard rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-black text-brandBlue dark:text-white flex items-center gap-2">
                                    <i className="fa-regular fa-user text-brandGold"></i> Profile Details
                                </h2>
                                {!isEditing && (
                                    <button onClick={() => setIsEditing(true)} className="text-brandGold hover:text-brandBlue dark:hover:text-white text-sm font-bold transition-colors">
                                        Edit
                                    </button>
                                )}
                            </div>

                            {saveMessage.text && (
                                <div className={'text-sm p-3 rounded-xl font-semibold mb-4 ' + (saveMessage.type === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400')}>
                                    {saveMessage.text}
                                </div>
                            )}

                            {isEditing ? (
                                <form onSubmit={handleSave} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Username</label>
                                        <input type="text" name="username" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">First Name</label>
                                            <input type="text" name="firstName" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">Last Name</label>
                                            <input type="text" name="lastName" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Full Name</label>
                                        <input type="text" name="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Email</label>
                                        <input type="email" name="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Phone</label>
                                        <input type="text" name="phone" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" />
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button type="submit" className="flex-1 bg-brandGold text-white font-bold py-2.5 rounded-xl hover:bg-brandBlue transition-colors shadow-sm">Save</button>
                                        <button type="button" onClick={() => setIsEditing(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                                    </div>
                                </form>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-start gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/30">
                                        <div className="w-10 h-10 rounded-full bg-brandGold/10 text-brandGold flex items-center justify-center shrink-0">
                                            <span className="font-black">{userData?.name?.charAt(0) || 'U'}</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-brandBlue dark:text-white">{userData?.name || 'Adding Name...'}</p>
                                            <p className="text-xs text-gray-500">{user?.email || userData?.email}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="pt-2">
                                        <div className="mb-4">
                                            <p className="text-xs text-gray-400 font-semibold mb-0.5">Username</p>
                                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{userData?.username || 'Not provided'}</p>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-xs text-gray-400 font-semibold mb-0.5">Phone Number</p>
                                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{userData?.phone || 'Not provided'}</p>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-xs text-gray-400 font-semibold mb-0.5">First Name</p>
                                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{userData?.firstName || 'Not provided'}</p>
                                        </div>
                                        <div className="mb-2">
                                            <p className="text-xs text-gray-400 font-semibold mb-0.5">Last Name</p>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{userData?.lastName || 'Not provided'}</p>
                                        </div>
                                        <button onClick={handleDeleteAccount} className="mt-4 w-full px-4 py-3 bg-red-50 dark:bg-red-900/10 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-red-100 dark:border-red-900/20">Delete Account</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Orders History */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-darkCard rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            <h2 className="text-lg font-black text-brandBlue dark:text-white flex items-center gap-2 mb-6">
                                <i className="fa-solid fa-box-open text-brandGold"></i> Order History
                            </h2>

                            {ordersLoading ? (
                                <div className="py-12 text-center text-gray-400 font-semibold">
                                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-3 text-brandGold"></i>
                                    <p>Loading your previous orders...</p>
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="py-16 flex flex-col items-center justify-center text-center bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                                    <div className="w-16 h-16 rounded-full bg-white dark:bg-darkCard flex items-center justify-center mb-4 shadow-sm">
                                        <i className="fa-solid fa-receipt text-2xl text-gray-300 dark:text-gray-600"></i>
                                    </div>
                                    <h3 className="text-lg font-bold text-brandBlue dark:text-white mb-2">No orders yet</h3>
                                    <p className="text-gray-500 text-sm max-w-sm">Looks like you haven&apos;t placed any orders with this account yet.</p>
                                    <Link href="/" className="mt-6 font-bold text-sm bg-brandGold text-white px-6 py-2.5 rounded-xl hover:bg-brandBlue transition-all shadow-md shadow-brandGold/20 hover:-translate-y-0.5">
                                        Start Shopping
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {orders.map(order => (
                                        <div key={order.id} className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 hover:border-brandGold/30 transition-colors">
                                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-50 dark:border-gray-800/50">
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Order ID</span>
                                                    <span className="font-mono text-sm font-black text-brandBlue dark:text-white">#{order.id.slice(0, 8)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Date</span>
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        {parseTimestamp(order.createdAt || order.orderDate)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Status</span>
                                                    <span className={'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}>
                                                        {order.status || 'Processing'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Type</span>
                                                    <span className={'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ' + (order.orderType === 'wholesale' ? 'bg-brandGold/10 text-brandGold' : 'bg-green-500/10 text-green-600')}>
                                                        {order.orderType || 'retail'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Total Amount</span>
                                                    <span className="text-base font-black text-brandGold">{(order.totalPrice || 0).toLocaleString()} ج.م</span>
                                                </div>
                                            </div>
                                            
                                            <div>
                                                <div className="text-xs font-bold text-gray-400 mb-2">Items Ordered</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {(order.items || []).map((item, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800">
                                                            <div className="w-8 h-8 rounded-md bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-700 overflow-hidden shrink-0 flex items-center justify-center p-1">
                                                                <img src={item.image || item.imageUrl || '/logo.png'} alt={item.title || item.name} className="max-w-full max-h-full object-contain" />
                                                            </div>
                                                            <div className="truncate max-w-[150px] md:max-w-xs">
                                                                <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{item.title || item.name}</p>
                                                                <p className="text-[10px] text-gray-500 font-medium">Qty: {item.quantity}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="mt-4 flex justify-end">
                                                <button onClick={() => handleOrderAgain(order)} className={'rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] transition-all ' + (order.orderType === 'wholesale' ? 'bg-brandGold/10 text-brandGold hover:bg-brandGold hover:text-brandBlue' : 'bg-brandBlue text-white hover:bg-brandGold')}>
                                                    Order Again
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}



