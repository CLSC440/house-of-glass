'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { deleteOwnAccount, getOwnOrders, upsertCurrentUserProfile } from '@/lib/account-api';
import { deleteImageKitFiles, uploadToImageKit } from '@/lib/imagekit-client';
import { parseTimestamp } from '@/lib/utils/format';
import { mergeOrderItemsIntoStorage } from '@/lib/cart-storage';
import { getOrderAmount, getOrderDateValue, getOrderExternalRef } from '@/lib/utils/admin-orders';
import { getOrderStatusHistory, getOrderStatusMeta, getOrderTrackingSteps, normalizeOrderStatus } from '@/lib/utils/order-status';
import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';

function buildAvatarLabel(userData, user) {
    return String(userData?.name || user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase() || 'U';
}

function ProfileFallbackAvatar({ label, className = '' }) {
    return (
        <div className={`relative overflow-hidden rounded-full border border-brandGold/30 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.16),transparent_34%),linear-gradient(180deg,#151b2d_0%,#090d18_100%)] text-brandGold shadow-[0_12px_28px_rgba(0,0,0,0.35)] ${className}`}>
            <svg className="absolute inset-0 h-full w-full text-brandGold/75" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="24" r="12" fill="currentColor" opacity="0.88" />
                <path d="M14 56c1.8-10.5 9.48-16 18-16s16.2 5.5 18 16" fill="currentColor" opacity="0.88" />
            </svg>
            <span className="absolute left-1/2 top-[37%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[0.78em] font-black uppercase leading-none text-[#0c1120]">
                {label}
            </span>
        </div>
    );
}

function OrderTrackingSteps({ status }) {
    const normalizedStatus = normalizeOrderStatus(status);
    const steps = getOrderTrackingSteps(normalizedStatus);
    const isReceivedOrder = normalizedStatus === 'received';

    if (normalizedStatus === 'cancelled') {
        const cancelledMeta = getOrderStatusMeta('cancelled');
        return (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900/30 dark:bg-rose-900/10">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/12 text-rose-500 dark:text-rose-300">
                        <i className="fa-solid fa-ban"></i>
                    </span>
                    <div>
                        <p className="text-sm font-black text-rose-700 dark:text-rose-300">{cancelledMeta.customerLabel}</p>
                        <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-200/80">{cancelledMeta.description}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-3 md:grid-cols-4">
            {steps.map((step, index) => {
                const isCompleted = step.state === 'completed' || (isReceivedOrder && step.state === 'current');
                const isCurrent = step.state === 'current' && !isReceivedOrder;

                return (
                    <div key={step.value} className={`relative overflow-hidden rounded-2xl border px-4 py-5 ${isCurrent ? 'border-brandGold/35 bg-brandGold/10 dark:bg-brandGold/10' : isCompleted ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/30 dark:bg-emerald-900/10' : 'border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/30'}`}>
                        <div className="flex min-h-[168px] flex-col items-center justify-center gap-4 text-center">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ${isCurrent ? 'bg-brandGold text-brandBlue' : isCompleted ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                                {isCompleted ? <i className="fa-solid fa-check"></i> : index + 1}
                            </span>
                            <div className="flex max-w-full flex-col items-center text-center">
                                <p className={`text-xs font-black uppercase tracking-[0.16em] ${isCurrent ? 'text-brandGold' : isCompleted ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-400'}`}>{step.label}</p>
                                <p className="mt-2 max-w-[10ch] text-balance text-[15px] font-semibold leading-[1.45] text-brandBlue dark:text-white sm:max-w-[12ch]">{step.customerLabel}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function isTerminalOrderStatus(status) {
    const normalizedStatus = normalizeOrderStatus(status);
    return normalizedStatus === 'completed' || normalizedStatus === 'received' || normalizedStatus === 'cancelled';
}

function getAutomaticThemePreference() {
    const hour = new Date().getHours();
    return hour < 6 || hour >= 18;
}

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
        email: '',
        photoURL: ''
    });
    const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });
    const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
    const [selectedPhotoPreview, setSelectedPhotoPreview] = useState('');
    const [removeProfilePhoto, setRemoveProfilePhoto] = useState(false);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isAutoThemeEnabled, setIsAutoThemeEnabled] = useState(true);
    const [isDarkTheme, setIsDarkTheme] = useState(false);

    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [expandedOrderSummaries, setExpandedOrderSummaries] = useState({});

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
                        email: data.email || data.authEmail || '',
                        photoURL: data.photoURL || currentUser.photoURL || ''
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
                const fetchedOrders = await getOwnOrders(user);
                setOrders(fetchedOrders);
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

    useEffect(() => {
        return () => {
            if (selectedPhotoPreview) {
                URL.revokeObjectURL(selectedPhotoPreview);
            }
        };
    }, [selectedPhotoPreview]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const autoEnabled = localStorage.getItem('autoThemeEnabled') !== 'false';
        const manualTheme = localStorage.getItem('darkMode');
        const nextDarkTheme = autoEnabled
            ? document.documentElement.classList.contains('dark')
            : manualTheme === 'true';

        setIsAutoThemeEnabled(autoEnabled);
        setIsDarkTheme(nextDarkTheme);
    }, []);

    const applyThemePreference = ({ autoEnabled, darkEnabled }) => {
        if (typeof window === 'undefined') {
            return;
        }

        const resolvedDarkTheme = autoEnabled ? getAutomaticThemePreference() : darkEnabled;
        document.documentElement.classList.toggle('dark', resolvedDarkTheme);

        if (autoEnabled) {
            localStorage.setItem('autoThemeEnabled', 'true');
            localStorage.removeItem('darkMode');
            localStorage.removeItem('themeOverrideTime');
        } else {
            localStorage.setItem('autoThemeEnabled', 'false');
            localStorage.setItem('darkMode', resolvedDarkTheme ? 'true' : 'false');
            localStorage.setItem('themeOverrideTime', String(Date.now()));
        }

        setIsAutoThemeEnabled(autoEnabled);
        setIsDarkTheme(resolvedDarkTheme);
    };

    const handleAutoThemeToggle = () => {
        applyThemePreference({
            autoEnabled: !isAutoThemeEnabled,
            darkEnabled: isDarkTheme
        });
    };

    const handleManualThemeChange = (nextDarkTheme) => {
        if (isAutoThemeEnabled) {
            return;
        }

        applyThemePreference({
            autoEnabled: false,
            darkEnabled: nextDarkTheme
        });
    };

    const displayedProfilePhoto = removeProfilePhoto
        ? ''
        : (selectedPhotoPreview || formData.photoURL || userData?.photoURL || user?.photoURL || '');

    const handlePhotoSelection = (event) => {
        const nextFile = event.target.files?.[0] || null;

        if (!nextFile) {
            return;
        }

        if (!nextFile.type.startsWith('image/')) {
            setSaveMessage({ type: 'error', text: 'Please choose an image file only.' });
            return;
        }

        if (selectedPhotoPreview) {
            URL.revokeObjectURL(selectedPhotoPreview);
        }

        const previewUrl = URL.createObjectURL(nextFile);
        setSelectedPhotoFile(nextFile);
        setSelectedPhotoPreview(previewUrl);
        setRemoveProfilePhoto(false);
        setAvatarLoadFailed(false);
        setSaveMessage({ type: '', text: '' });
    };

    const handleRemoveProfilePhoto = () => {
        if (selectedPhotoPreview) {
            URL.revokeObjectURL(selectedPhotoPreview);
        }

        setSelectedPhotoFile(null);
        setSelectedPhotoPreview('');
        setRemoveProfilePhoto(true);
        setAvatarLoadFailed(false);
    };

    const toggleOrderSummary = (orderId) => {
        setExpandedOrderSummaries((currentValue) => ({
            ...currentValue,
            [orderId]: !currentValue[orderId]
        }));
    };

    const handleCancelEdit = () => {
        if (selectedPhotoPreview) {
            URL.revokeObjectURL(selectedPhotoPreview);
        }

        setSelectedPhotoFile(null);
        setSelectedPhotoPreview('');
        setRemoveProfilePhoto(false);
        setAvatarLoadFailed(false);
        setFormData((currentValue) => ({
            ...currentValue,
            photoURL: userData?.photoURL || user?.photoURL || ''
        }));
        setIsEditing(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaveMessage({ type: '', text: '' });
        setIsSavingProfile(true);
        let uploadedPhotoFileId = '';

        try {
            const previousPhotoMeta = userData?.photoMeta || null;
            const previousPhotoFileId = previousPhotoMeta?.provider === 'imagekit' ? previousPhotoMeta.fileId || '' : '';
            let photoURL = removeProfilePhoto ? '' : (formData.photoURL || userData?.photoURL || user?.photoURL || '');
            let photoMeta = removeProfilePhoto ? null : previousPhotoMeta;

            if (selectedPhotoFile) {
                const uploadedPhoto = await uploadToImageKit(user, selectedPhotoFile, {
                    folder: `/users/${user.uid}/profile`,
                    fileName: `profile_${user.uid}_${Date.now()}.${selectedPhotoFile.name.split('.').pop() || 'jpg'}`,
                    tags: ['profile-photo']
                });
                uploadedPhotoFileId = uploadedPhoto.fileId || '';
                photoURL = uploadedPhoto.primaryUrl;
                photoMeta = uploadedPhoto;
            }

            const response = await upsertCurrentUserProfile(user, {
                username: formData.username,
                firstName: formData.firstName,
                lastName: formData.lastName,
                name: formData.name,
                phone: formData.phone,
                email: formData.email,
                photoURL,
                photoMeta
            });

            await updateProfile(user, {
                displayName: response.profile?.name || formData.name || user.displayName || null,
                photoURL: photoURL || null
            });

            setUserData(response.profile);
            setFormData((currentValue) => ({
                ...currentValue,
                photoURL: response.profile?.photoURL || ''
            }));
            if (selectedPhotoPreview) {
                URL.revokeObjectURL(selectedPhotoPreview);
            }
            setSelectedPhotoFile(null);
            setSelectedPhotoPreview('');
            setRemoveProfilePhoto(false);
            setAvatarLoadFailed(false);
            setIsEditing(false);
            setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });

            const nextPhotoFileId = photoMeta?.provider === 'imagekit' ? photoMeta.fileId || '' : '';
            const shouldDeletePreviousPhoto = previousPhotoFileId && previousPhotoFileId !== nextPhotoFileId && (removeProfilePhoto || Boolean(selectedPhotoFile));

            if (shouldDeletePreviousPhoto) {
                try {
                    await deleteImageKitFiles(user, [previousPhotoFileId]);
                } catch (cleanupError) {
                    console.error('Failed to delete previous profile photo from ImageKit:', cleanupError);
                }
            }

            setTimeout(() => setSaveMessage({ type: '', text: '' }), 3000);
        } catch (err) {
            console.error(err);
            if (uploadedPhotoFileId) {
                try {
                    await deleteImageKitFiles(user, [uploadedPhotoFileId]);
                } catch (cleanupError) {
                    console.error('Failed to clean up uploaded profile photo after save error:', cleanupError);
                }
            }
            setSaveMessage({ type: 'error', text: 'Failed to update profile.' });
        } finally {
            setIsSavingProfile(false);
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
        return <BrandLoadingScreen title="Loading your account" message="جاري تحميل الصفحة والبيانات الخاصة بحسابك" fixed={false} />;
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
                        <div id="profile-settings" className="bg-white dark:bg-darkCard rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 scroll-mt-28">
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
                                    <div className="rounded-[1.6rem] border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-brandGold/20 bg-white shadow-sm dark:bg-darkCard">
                                                {displayedProfilePhoto && !avatarLoadFailed ? (
                                                    <img src={displayedProfilePhoto} alt={formData.name || user?.displayName || 'Profile'} className="h-full w-full object-cover" onError={() => setAvatarLoadFailed(true)} />
                                                ) : (
                                                    <ProfileFallbackAvatar label={buildAvatarLabel(userData, user)} className="h-full w-full" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-black text-brandBlue dark:text-white">Profile Photo</p>
                                                <p className="mt-1 text-xs text-gray-500">Upload a square image and it will appear in the account icon immediately after saving.</p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-brandGold/25 bg-brandGold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-brandGold transition-colors hover:bg-brandGold hover:text-white">
                                                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelection} />
                                                        Choose Photo
                                                    </label>
                                                    {(displayedProfilePhoto || selectedPhotoFile) ? (
                                                        <button type="button" onClick={handleRemoveProfilePhoto} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-red-500 transition-colors hover:bg-red-500 hover:text-white dark:border-red-900/40 dark:bg-red-900/10">
                                                            Remove Photo
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
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
                                        <button type="submit" disabled={isSavingProfile} className="flex-1 bg-brandGold text-white font-bold py-2.5 rounded-xl hover:bg-brandBlue transition-colors shadow-sm disabled:cursor-wait disabled:opacity-70">{isSavingProfile ? 'Saving...' : 'Save'}</button>
                                        <button type="button" onClick={handleCancelEdit} disabled={isSavingProfile} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:cursor-wait disabled:opacity-70">Cancel</button>
                                    </div>
                                </form>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-start gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/30">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brandGold/20 bg-white text-brandGold dark:bg-darkCard">
                                            {displayedProfilePhoto && !avatarLoadFailed ? (
                                                <img src={displayedProfilePhoto} alt={userData?.name || user?.displayName || 'Profile'} className="h-full w-full object-cover" onError={() => setAvatarLoadFailed(true)} />
                                            ) : (
                                                <ProfileFallbackAvatar label={buildAvatarLabel(userData, user)} className="h-full w-full" />
                                            )}
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

                        <div className="bg-white dark:bg-darkCard rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-black text-brandBlue dark:text-white flex items-center gap-2">
                                        <i className="fa-regular fa-moon text-brandGold"></i> Theme Settings
                                    </h2>
                                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                        Auto mode stays as the default and follows day/night time. You can disable it and pick a manual theme anytime.
                                    </p>
                                </div>
                                <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isAutoThemeEnabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-brandGold/10 text-brandGold'}`}>
                                    {isAutoThemeEnabled ? 'Auto Active' : 'Manual Active'}
                                </span>
                            </div>

                            <div className="mt-5 rounded-[1.5rem] border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/30">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-black text-brandBlue dark:text-white">Automatic Light / Night Mode</p>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            Uses the current time to switch automatically between light and dark mode.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAutoThemeToggle}
                                        className={`relative inline-flex h-11 w-[4.4rem] shrink-0 items-center rounded-full border transition-colors ${isAutoThemeEnabled ? 'border-emerald-400/30 bg-emerald-500/20' : 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-800'}`}
                                        aria-pressed={isAutoThemeEnabled}
                                        aria-label="Toggle automatic theme mode"
                                    >
                                        <span
                                            className={`inline-flex h-8 w-8 transform items-center justify-center rounded-full bg-white text-xs font-black shadow-sm transition-transform dark:bg-darkCard ${isAutoThemeEnabled ? 'translate-x-[2rem] text-emerald-600 dark:text-emerald-300' : 'translate-x-[0.3rem] text-gray-500 dark:text-gray-300'}`}
                                        >
                                            {isAutoThemeEnabled ? 'ON' : 'OFF'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => handleManualThemeChange(false)}
                                    disabled={isAutoThemeEnabled}
                                    className={`rounded-[1.4rem] border px-4 py-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-55 ${!isAutoThemeEnabled && !isDarkTheme ? 'border-brandGold/40 bg-brandGold/10 shadow-[0_10px_24px_rgba(212,175,55,0.16)]' : 'border-gray-200 bg-white hover:border-brandGold/25 dark:border-gray-700 dark:bg-gray-900/30'}`}
                                >
                                    <span className="flex items-center gap-2 text-sm font-black text-brandBlue dark:text-white">
                                        <i className="fa-regular fa-sun text-brandGold"></i>
                                        Light Mode
                                    </span>
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Bright interface for daytime use.</p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleManualThemeChange(true)}
                                    disabled={isAutoThemeEnabled}
                                    className={`rounded-[1.4rem] border px-4 py-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-55 ${!isAutoThemeEnabled && isDarkTheme ? 'border-brandGold/40 bg-brandGold/10 shadow-[0_10px_24px_rgba(212,175,55,0.16)]' : 'border-gray-200 bg-white hover:border-brandGold/25 dark:border-gray-700 dark:bg-gray-900/30'}`}
                                >
                                    <span className="flex items-center gap-2 text-sm font-black text-brandBlue dark:text-white">
                                        <i className="fa-regular fa-moon text-brandGold"></i>
                                        Dark Mode
                                    </span>
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Low-glare interface for night use.</p>
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                {isAutoThemeEnabled
                                    ? 'Auto mode is active. Disable it first if you want to control the theme manually.'
                                    : `Manual mode is active. Current theme: ${isDarkTheme ? 'Dark' : 'Light'}.`}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Orders History */}
                    <div className="lg:col-span-2 space-y-6">
                        <div id="order-history" className="bg-white dark:bg-darkCard rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 scroll-mt-28">
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
                                            {(() => {
                                                const normalizedStatus = normalizeOrderStatus(order.status);
                                                const statusMeta = getOrderStatusMeta(normalizedStatus);
                                                const statusHistory = getOrderStatusHistory(order);
                                                const latestStatusEntry = statusHistory[statusHistory.length - 1];
                                                const isReceivedOrder = normalizedStatus === 'received';
                                                const isTerminalStatus = isTerminalOrderStatus(normalizedStatus);
                                                const isExpanded = expandedOrderSummaries[order.id] ?? !isTerminalStatus;

                                                return (
                                                    <>
                                            <div className={`flex flex-wrap items-center gap-3 ${isExpanded ? 'mb-4 border-b border-gray-50 pb-4 dark:border-gray-800/50' : ''}`}>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Order ID</span>
                                                    <span className="font-mono text-sm font-black text-brandBlue dark:text-white">#{getOrderExternalRef(order)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Date</span>
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        {parseTimestamp(getOrderDateValue(order))}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Status</span>
                                                    <span className={'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ' + statusMeta.lightBadgeClass}>
                                                        <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`}></span>
                                                        {statusMeta.customerLabel}
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
                                                    <span className="text-base font-black text-brandGold">{getOrderAmount(order).toLocaleString()} ج.م</span>
                                                </div>
                                                {isTerminalStatus ? (
                                                    <div className="ml-auto flex items-center self-stretch sm:self-auto">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleOrderSummary(order.id)}
                                                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:border-brandGold/35 hover:bg-brandGold/10 hover:text-brandGold dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                                                            aria-label={isExpanded ? 'Collapse order details' : 'Expand order details'}
                                                            aria-expanded={isExpanded}
                                                        >
                                                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm`}></i>
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>

                                            {isExpanded ? (
                                            <>
                                            <div className="mb-4 space-y-4 rounded-[1.5rem] border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/20">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Order Tracking</p>
                                                        <p className="mt-2 text-sm font-semibold text-brandBlue dark:text-white">{statusMeta.description}</p>
                                                    </div>
                                                    <div className="text-left md:text-right">
                                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Last Update</p>
                                                        <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{parseTimestamp(latestStatusEntry?.at || order.statusUpdatedAt || getOrderDateValue(order))}</p>
                                                    </div>
                                                </div>

                                                <OrderTrackingSteps status={order.status} />

                                                <div>
                                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Status History</p>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {statusHistory.slice().reverse().map((entry, index) => (
                                                            <div key={`${entry.status}-${entry.at}-${index}`} className={`rounded-xl border px-3 py-2 ${isReceivedOrder ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/30 dark:bg-emerald-900/10' : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-darkCard'}`}>
                                                                <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${isReceivedOrder ? 'text-emerald-700 dark:text-emerald-300' : 'text-brandGold'}`}>{entry.customerLabel || entry.label}</p>
                                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{parseTimestamp(entry.at)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
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
                                            </>
                                            ) : null}
                                                    </>
                                                );
                                            })()}
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



