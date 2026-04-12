'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmailAuthProvider, linkWithCredential, onAuthStateChanged, reauthenticateWithCredential, reauthenticateWithPopup, signOut, updatePassword, updateProfile } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
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

function normalizeTrackedOrderValue(value) {
    return String(value || '').trim().toUpperCase();
}

function buildOrderTrackingSectionId(value) {
    const normalizedValue = normalizeTrackedOrderValue(value).replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return `order-tracking-${normalizedValue || 'latest'}`;
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {steps.map((step, index) => {
                const isCompleted = step.state === 'completed' || (isReceivedOrder && step.state === 'current');
                const isCurrent = step.state === 'current' && !isReceivedOrder;

                return (
                    <div key={step.value} className={`relative overflow-hidden rounded-[1.35rem] border px-3 py-4 sm:rounded-2xl sm:px-4 sm:py-5 ${isCurrent ? 'border-brandGold/35 bg-brandGold/10 dark:bg-brandGold/10' : isCompleted ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/30 dark:bg-emerald-900/10' : 'border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/30'}`}>
                        <div className="flex min-h-[116px] flex-col items-center justify-center gap-3 text-center sm:min-h-[148px] md:min-h-[168px] md:gap-4">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-black sm:h-10 sm:w-10 sm:text-sm ${isCurrent ? 'bg-brandGold text-brandBlue' : isCompleted ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                                {isCompleted ? <i className="fa-solid fa-check"></i> : index + 1}
                            </span>
                            <div className="flex max-w-full flex-col items-center text-center">
                                <p className={`text-[0.72rem] font-black uppercase tracking-[0.18em] sm:text-xs ${isCurrent ? 'text-brandGold' : isCompleted ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-400'}`}>{step.label}</p>
                                <p className="mt-1.5 max-w-[8ch] text-balance text-[1.05rem] font-semibold leading-[1.35] text-brandBlue dark:text-white sm:mt-2 sm:max-w-[10ch] sm:text-[15px] sm:leading-[1.45] md:max-w-[12ch]">{step.customerLabel}</p>
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

function getDeleteAccountErrorMessage(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '');

    if (/password confirmation is required/i.test(message)) {
        return 'Please enter your current password before deleting the account.';
    }

    if (/unable to verify your password/i.test(message)) {
        return 'Unable to verify the password for this account right now.';
    }

    if (/not supported for self-service deletion/i.test(message)) {
        return 'This sign-in method is not supported for account deletion from the profile page.';
    }

    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || /wrong-password|invalid-credential|password is invalid|invalid login credentials/i.test(message)) {
        return 'Incorrect password. Your account was not deleted.';
    }

    if (code === 'auth/popup-closed-by-user') {
        return 'Google confirmation was cancelled.';
    }

    if (code === 'auth/popup-blocked') {
        return 'Allow the Google confirmation popup, then try again.';
    }

    if (code === 'auth/cancelled-popup-request') {
        return 'Google confirmation is already in progress.';
    }

    if (/recent authentication required/i.test(message)) {
        return 'Please confirm your credentials again before deleting your account.';
    }

    return 'Failed to delete account.';
}

function getPasswordActionErrorMessage(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '');

    if (/current password is required/i.test(message)) {
        return 'Please enter your current password first.';
    }

    if (/new password is required/i.test(message)) {
        return 'Please enter a new password.';
    }

    if (/at least 6 characters/i.test(message)) {
        return 'The new password must be at least 6 characters.';
    }

    if (/do not match/i.test(message)) {
        return 'The new password and confirmation do not match.';
    }

    if (/unable to verify/i.test(message)) {
        return 'Unable to verify the sign-in email for this account right now.';
    }

    if (/not available for this sign-in method/i.test(message)) {
        return 'Password management is not available for this sign-in method.';
    }

    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || /wrong-password|invalid-credential|password is invalid|invalid login credentials/i.test(message)) {
        return 'The current password is incorrect.';
    }

    if (code === 'auth/weak-password') {
        return 'Choose a stronger password with at least 6 characters.';
    }

    if (code === 'auth/requires-recent-login') {
        return 'Please confirm your sign-in again before changing the password.';
    }

    if (code === 'auth/provider-already-linked') {
        return 'This account already has a password sign-in method linked.';
    }

    if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
        return 'This email is already linked to another password account.';
    }

    if (code === 'auth/popup-closed-by-user') {
        return 'Google confirmation was cancelled.';
    }

    if (code === 'auth/popup-blocked') {
        return 'Allow the Google confirmation popup, then try again.';
    }

    if (code === 'auth/cancelled-popup-request') {
        return 'Google confirmation is already in progress.';
    }

    return 'Failed to update password.';
}

export default function UserProfile() {
    const router = useRouter();
    const searchParams = useSearchParams();
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
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteAccountError, setDeleteAccountError] = useState('');
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [isAutoThemeEnabled, setIsAutoThemeEnabled] = useState(true);
    const [isDarkTheme, setIsDarkTheme] = useState(false);
    const [isProfileDetailsExpanded, setIsProfileDetailsExpanded] = useState(false);

    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [expandedOrderSummaries, setExpandedOrderSummaries] = useState({});
    const trackedOrderScrollRef = useRef('');
    const trackedOrderParam = normalizeTrackedOrderValue(searchParams.get('trackOrder'));
    const [isTrackedOrderLoading, setIsTrackedOrderLoading] = useState(Boolean(trackedOrderParam));

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

    useEffect(() => {
        trackedOrderScrollRef.current = '';
        setIsTrackedOrderLoading(Boolean(trackedOrderParam));
    }, [trackedOrderParam]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (!trackedOrderParam) {
            setIsTrackedOrderLoading(false);
            return;
        }

        if (ordersLoading) {
            setIsTrackedOrderLoading(true);
            return;
        }

        if (orders.length === 0) {
            setIsTrackedOrderLoading(false);
            return;
        }

        const matchedOrder = orders.find((order) => {
            const externalRef = normalizeTrackedOrderValue(getOrderExternalRef(order));
            const internalId = normalizeTrackedOrderValue(order.id);
            return trackedOrderParam === externalRef || trackedOrderParam === internalId;
        }) || orders[0];

        if (!matchedOrder) {
            return;
        }

        const targetOrderRef = normalizeTrackedOrderValue(getOrderExternalRef(matchedOrder) || matchedOrder.id);

        if (trackedOrderScrollRef.current === targetOrderRef) {
            setIsTrackedOrderLoading(false);
            return;
        }

        setExpandedOrderSummaries((currentValue) => (
            currentValue[matchedOrder.id] === true
                ? currentValue
                : {
                    ...currentValue,
                    [matchedOrder.id]: true
                }
        ));

        let attempts = 0;
        let timeoutId;
        let animationFrameId;

        const scrollToTrackingSection = () => {
            const exactTarget = document.getElementById(buildOrderTrackingSectionId(targetOrderRef));
            const fallbackTarget = document.querySelector('[data-order-tracking-section="true"]');
            const targetElement = exactTarget || fallbackTarget;

            if (targetElement) {
                trackedOrderScrollRef.current = targetOrderRef;
                setIsTrackedOrderLoading(false);
                animationFrameId = window.requestAnimationFrame(() => {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

                    const nextUrl = new URL(window.location.href);
                    nextUrl.searchParams.delete('trackOrder');
                    if (!nextUrl.hash) {
                        nextUrl.hash = 'order-history';
                    }
                    window.history.replaceState(window.history.state, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
                });
                return;
            }

            attempts += 1;
            if (attempts < 12) {
                timeoutId = window.setTimeout(scrollToTrackingSection, 120);
            } else {
                setIsTrackedOrderLoading(false);
            }
        };

        timeoutId = window.setTimeout(scrollToTrackingSection, 120);

        return () => {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            if (animationFrameId) {
                window.cancelAnimationFrame(animationFrameId);
            }
        };
    }, [orders, ordersLoading, trackedOrderParam]);

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

    const toggleProfileDetails = () => {
        if (isEditing) {
            return;
        }

        setIsProfileDetailsExpanded((currentValue) => !currentValue);
    };

    const handleCancelEdit = () => {
        if (selectedPhotoPreview) {
            URL.revokeObjectURL(selectedPhotoPreview);
        }

        setSelectedPhotoFile(null);
        setSelectedPhotoPreview('');
        setRemoveProfilePhoto(false);
        setAvatarLoadFailed(false);
        setPasswordForm({
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
        });
        setPasswordMessage({ type: '', text: '' });
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

    const providerIds = Array.isArray(user?.providerData)
        ? user.providerData.map((entry) => entry?.providerId).filter(Boolean)
        : [];
    const hasPasswordProvider = providerIds.includes('password');
    const hasGoogleProvider = providerIds.includes('google.com');
    const authEmail = user?.email || userData?.authEmail || user?.providerData?.find((entry) => entry?.providerId === 'password')?.email || '';
    const canConfirmDeleteWithPassword = hasPasswordProvider;
    const canConfirmDeleteWithGoogle = !hasPasswordProvider && hasGoogleProvider;
    const canCreatePasswordWithGoogle = !hasPasswordProvider && hasGoogleProvider && Boolean(authEmail);
    const canManagePassword = hasPasswordProvider || canCreatePasswordWithGoogle;
    const passwordActionTitle = hasPasswordProvider ? 'Change Password' : 'Create Password';

    const resetPasswordForm = () => {
        setPasswordForm({
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
        });
    };

    const handlePasswordFieldChange = (field) => (event) => {
        const nextValue = event.target.value;
        setPasswordForm((currentValue) => ({
            ...currentValue,
            [field]: nextValue
        }));

        if (passwordMessage.text) {
            setPasswordMessage({ type: '', text: '' });
        }
    };

    const handlePasswordUpdate = async (event) => {
        event.preventDefault();

        if (!user) {
            setPasswordMessage({ type: 'error', text: 'Authentication required.' });
            return;
        }

        const currentPassword = passwordForm.currentPassword;
        const nextPassword = passwordForm.newPassword;
        const confirmPassword = passwordForm.confirmPassword;

        if (hasPasswordProvider && !currentPassword.trim()) {
            setPasswordMessage({ type: 'error', text: 'Please enter your current password first.' });
            return;
        }

        if (!nextPassword) {
            setPasswordMessage({ type: 'error', text: 'Please enter a new password.' });
            return;
        }

        if (nextPassword.length < 6) {
            setPasswordMessage({ type: 'error', text: 'The new password must be at least 6 characters.' });
            return;
        }

        if (nextPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'The new password and confirmation do not match.' });
            return;
        }

        if (!canManagePassword) {
            setPasswordMessage({ type: 'error', text: 'Password management is not available for this sign-in method.' });
            return;
        }

        setPasswordMessage({ type: '', text: '' });
        setSaveMessage({ type: '', text: '' });
        setIsSavingPassword(true);

        try {
            if (hasPasswordProvider) {
                if (!authEmail) {
                    throw new Error('Unable to verify the sign-in email for this account right now.');
                }

                const credential = EmailAuthProvider.credential(authEmail, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, nextPassword);
                setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
            } else if (canCreatePasswordWithGoogle) {
                await reauthenticateWithPopup(user, googleProvider);
                const credential = EmailAuthProvider.credential(authEmail, nextPassword);
                await linkWithCredential(user, credential);
                setPasswordMessage({ type: 'success', text: 'Password created successfully. You can now sign in with your password too.' });
            }

            resetPasswordForm();
        } catch (error) {
            console.error(error);
            setPasswordMessage({ type: 'error', text: getPasswordActionErrorMessage(error) });
        } finally {
            setIsSavingPassword(false);
        }
    };

    const closeDeleteDialog = () => {
        if (isDeletingAccount) {
            return;
        }

        setIsDeleteDialogOpen(false);
        setDeletePassword('');
        setDeleteAccountError('');
    };

    const handleDeleteAccount = async () => {
        setDeletePassword('');
        setDeleteAccountError('');
        setIsDeleteDialogOpen(true);
    };

    const confirmDeleteAccount = async (event) => {
        event.preventDefault();

        if (!user) {
            setDeleteAccountError('Authentication required.');
            return;
        }

        setDeleteAccountError('');
        setSaveMessage({ type: '', text: '' });
        setIsDeletingAccount(true);

        try {
            if (canConfirmDeleteWithPassword) {
                const passwordValue = deletePassword;

                if (!passwordValue.trim()) {
                    throw new Error('Password confirmation is required.');
                }

                if (!authEmail) {
                    throw new Error('Unable to verify your password for this account.');
                }

                const credential = EmailAuthProvider.credential(authEmail, passwordValue);
                await reauthenticateWithCredential(user, credential);
            } else if (canConfirmDeleteWithGoogle) {
                await reauthenticateWithPopup(user, googleProvider);
            } else {
                throw new Error('This account provider is not supported for self-service deletion.');
            }

            await deleteOwnAccount(user, { forceRefresh: true });
            sessionStorage.removeItem('isAdmin');
            sessionStorage.removeItem('userRole');
            router.push('/signup');
        } catch (err) {
            console.error(err);
            setDeleteAccountError(getDeleteAccountErrorMessage(err));
        } finally {
            setIsDeletingAccount(false);
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
        return <BrandLoadingScreen title="Loading your account" message="جاري تحميل الصفحة والبيانات الخاصة بحسابك" fixed={false} showProgressBar={false} />;
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
                                <button
                                    type="button"
                                    onClick={toggleProfileDetails}
                                    disabled={isEditing}
                                    aria-expanded={isEditing || isProfileDetailsExpanded}
                                    className="flex flex-1 items-center justify-between gap-3 text-left disabled:cursor-default"
                                >
                                    <h2 className="text-lg font-black text-brandBlue dark:text-white flex items-center gap-2">
                                        <i className="fa-regular fa-user text-brandGold"></i> Profile Details
                                    </h2>
                                    <i className={`fa-solid ${(isEditing || isProfileDetailsExpanded) ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm text-brandGold transition-transform`}></i>
                                </button>
                                {!isEditing && (
                                    <button onClick={() => { setIsEditing(true); setIsProfileDetailsExpanded(true); }} className="text-brandGold hover:text-brandBlue dark:hover:text-white text-sm font-bold transition-colors">
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
                                <div className="space-y-4">
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
                                            <button type="submit" disabled={isSavingProfile || isSavingPassword} className="flex-1 bg-brandGold text-white font-bold py-2.5 rounded-xl hover:bg-brandBlue transition-colors shadow-sm disabled:cursor-wait disabled:opacity-70">{isSavingProfile ? 'Saving...' : 'Save Profile'}</button>
                                            <button type="button" onClick={handleCancelEdit} disabled={isSavingProfile || isSavingPassword} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:cursor-wait disabled:opacity-70">Cancel</button>
                                        </div>
                                    </form>

                                    <form onSubmit={handlePasswordUpdate} className="rounded-[1.6rem] border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/35">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-black text-brandBlue dark:text-white">{passwordActionTitle}</p>
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    {hasPasswordProvider
                                                        ? 'Use a separate button to update the password without changing the rest of your profile.'
                                                        : canCreatePasswordWithGoogle
                                                            ? 'Add a password to this Google account. You will confirm with Google once before saving it.'
                                                            : 'Password setup is not available for this sign-in method right now.'}
                                                </p>
                                            </div>
                                            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${hasPasswordProvider ? 'bg-brandGold/10 text-brandGold' : canCreatePasswordWithGoogle ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                {hasPasswordProvider ? 'Password Active' : canCreatePasswordWithGoogle ? 'Create Access' : 'Unavailable'}
                                            </span>
                                        </div>

                                        {passwordMessage.text ? (
                                            <div className={'mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ' + (passwordMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-600 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300')}>
                                                {passwordMessage.text}
                                            </div>
                                        ) : null}

                                        <div className="mt-4 space-y-4">
                                            {hasPasswordProvider ? (
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1">Current Password</label>
                                                    <input type="password" value={passwordForm.currentPassword} onChange={handlePasswordFieldChange('currentPassword')} autoComplete="current-password" className="w-full bg-white dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" placeholder="Enter your current password" disabled={isSavingProfile || isSavingPassword} />
                                                </div>
                                            ) : null}

                                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1">New Password</label>
                                                    <input type="password" value={passwordForm.newPassword} onChange={handlePasswordFieldChange('newPassword')} autoComplete="new-password" className="w-full bg-white dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" placeholder="At least 6 characters" disabled={isSavingProfile || isSavingPassword || !canManagePassword} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1">Confirm Password</label>
                                                    <input type="password" value={passwordForm.confirmPassword} onChange={handlePasswordFieldChange('confirmPassword')} autoComplete="new-password" className="w-full bg-white dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 outline-none focus:border-brandGold text-sm font-medium" placeholder="Repeat the new password" disabled={isSavingProfile || isSavingPassword || !canManagePassword} />
                                                </div>
                                            </div>

                                            {canManagePassword ? (
                                                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                    {hasPasswordProvider
                                                        ? 'This updates only the password used to sign in. Your profile details stay unchanged.'
                                                        : 'After creating the password, this account can sign in with the same account identity plus password.'}
                                                </div>
                                            ) : (
                                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
                                                    Password setup needs a supported sign-in email on this account.
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <button type="submit" disabled={isSavingProfile || isSavingPassword || !canManagePassword} className="flex-1 rounded-xl bg-brandBlue px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-brandGold hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-60">
                                                    {isSavingPassword ? (hasPasswordProvider ? 'Updating Password...' : 'Creating Password...') : passwordActionTitle}
                                                </button>
                                                <button type="button" onClick={() => { resetPasswordForm(); setPasswordMessage({ type: '', text: '' }); }} disabled={isSavingProfile || isSavingPassword} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-500 transition-colors hover:border-gray-300 hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                                                    Clear
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <button
                                        type="button"
                                        onClick={toggleProfileDetails}
                                        className="flex w-full items-start gap-4 rounded-xl bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-800/50"
                                        aria-expanded={isProfileDetailsExpanded}
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brandGold/20 bg-white text-brandGold dark:bg-darkCard">
                                            {displayedProfilePhoto && !avatarLoadFailed ? (
                                                <img src={displayedProfilePhoto} alt={userData?.name || user?.displayName || 'Profile'} className="h-full w-full object-cover" onError={() => setAvatarLoadFailed(true)} />
                                            ) : (
                                                <ProfileFallbackAvatar label={buildAvatarLabel(userData, user)} className="h-full w-full" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-brandBlue dark:text-white">{userData?.name || 'Adding Name...'}</p>
                                            <p className="text-xs text-gray-500">{user?.email || userData?.email}</p>
                                        </div>
                                        <i className={`fa-solid ${isProfileDetailsExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} mt-1 text-sm text-brandGold transition-transform`}></i>
                                    </button>
                                    
                                    {isProfileDetailsExpanded ? (
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
                                    ) : null}
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
                                        <div key={order.id} className="rounded-[1.65rem] border border-gray-100 p-4 transition-colors hover:border-brandGold/30 dark:border-gray-800 sm:rounded-2xl">
                                            {(() => {
                                                const normalizedStatus = normalizeOrderStatus(order.status);
                                                const statusMeta = getOrderStatusMeta(normalizedStatus);
                                                const statusHistory = getOrderStatusHistory(order);
                                                const latestStatusEntry = statusHistory[statusHistory.length - 1];
                                                const orderDateLabel = parseTimestamp(getOrderDateValue(order));
                                                const compactOrderDateLabel = orderDateLabel.replace(/,\s*\d{4},\s*/, ', ');
                                                const orderAmountLabel = `${getOrderAmount(order).toLocaleString()} ج.م`;
                                                const isReceivedOrder = normalizedStatus === 'received';
                                                const isExpanded = expandedOrderSummaries[order.id] ?? false;

                                                return (
                                                    <>
                                            <div className={`sm:hidden ${isExpanded ? 'mb-4 border-b border-gray-50 pb-4 dark:border-gray-800/50' : ''}`}>
                                                <div className="flex items-center gap-2 overflow-hidden rounded-[1.35rem] border border-gray-100 bg-gray-50/35 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/20">
                                                    <div className="min-w-0 shrink basis-[5.5rem]">
                                                        <span className="block truncate font-mono text-[1.02rem] font-black text-brandBlue dark:text-white">#{getOrderExternalRef(order)}</span>
                                                    </div>
                                                    <div className="min-w-0 shrink basis-[6.25rem]">
                                                        <span className="block text-[0.8rem] font-medium leading-4 text-gray-300 sm:text-sm">{compactOrderDateLabel}</span>
                                                    </div>
                                                    <div className="shrink-0">
                                                        <span className={'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ' + statusMeta.lightBadgeClass}>
                                                            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`}></span>
                                                            {statusMeta.customerLabel}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 shrink-0 text-right">
                                                        <span className="block whitespace-nowrap text-[1.18rem] font-black text-brandGold">{orderAmountLabel}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleOrderSummary(order.id)}
                                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:border-brandGold/35 hover:bg-brandGold/10 hover:text-brandGold dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                                                        aria-label={isExpanded ? 'Collapse order details' : 'Expand order details'}
                                                        aria-expanded={isExpanded}
                                                    >
                                                        <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm`}></i>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className={`hidden ${isExpanded ? 'sm:mb-4 sm:border-b sm:border-gray-50 sm:pb-4 dark:sm:border-gray-800/50' : ''} sm:flex sm:flex-wrap sm:items-center sm:gap-3`}>
                                                <div className="min-w-0">
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Order ID</span>
                                                    <span className="font-mono text-sm font-black text-brandBlue dark:text-white">#{getOrderExternalRef(order)}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Date</span>
                                                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        {orderDateLabel}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Status</span>
                                                    <span className={'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ' + statusMeta.lightBadgeClass}>
                                                        <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`}></span>
                                                        {statusMeta.customerLabel}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Type</span>
                                                    <span className={'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ' + (order.orderType === 'wholesale' ? 'bg-brandGold/10 text-brandGold' : 'bg-green-500/10 text-green-600')}>
                                                        {order.orderType || 'retail'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">Total Amount</span>
                                                    <span className="text-base font-black text-brandGold">{orderAmountLabel}</span>
                                                </div>
                                                <div className="ml-auto flex items-center self-stretch sm:self-auto">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleOrderSummary(order.id)}
                                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black uppercase tracking-[0.16em] text-gray-500 transition-colors hover:border-brandGold/35 hover:bg-brandGold/10 hover:text-brandGold dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                                                        aria-label={isExpanded ? 'Collapse order details' : 'Expand order details'}
                                                        aria-expanded={isExpanded}
                                                    >
                                                        <span>{isExpanded ? 'Hide Details' : 'Show Details'}</span>
                                                        <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm`}></i>
                                                    </button>
                                                </div>
                                            </div>

                                            {isExpanded ? (
                                            <>
                                            <div
                                                id={buildOrderTrackingSectionId(getOrderExternalRef(order) || order.id)}
                                                data-order-tracking-section="true"
                                                className="mb-4 scroll-mt-28 space-y-4 rounded-[1.4rem] border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/20 sm:rounded-[1.5rem]"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Order Tracking</p>
                                                        <p className="mt-2 text-base font-semibold leading-8 text-brandBlue dark:text-white sm:text-sm sm:leading-7">{statusMeta.description}</p>
                                                    </div>
                                                    <div className="text-left md:text-right">
                                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Last Update</p>
                                                        <p className="mt-2 text-base font-semibold text-gray-700 dark:text-gray-300 sm:text-sm">{parseTimestamp(latestStatusEntry?.at || order.statusUpdatedAt || getOrderDateValue(order))}</p>
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
                                                <div className="grid gap-2 sm:flex sm:flex-wrap">
                                                    {(order.items || []).map((item, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/50 sm:py-1.5">
                                                            <div className="w-8 h-8 rounded-md bg-white dark:bg-darkCard border border-gray-100 dark:border-gray-700 overflow-hidden shrink-0 flex items-center justify-center p-1">
                                                                <img src={item.image || item.imageUrl || '/logo.png'} alt={item.title || item.name} className="max-w-full max-h-full object-contain" />
                                                            </div>
                                                            <div className="min-w-0 truncate max-w-[190px] md:max-w-xs">
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

            {isDeleteDialogOpen ? (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm" onClick={closeDeleteDialog}>
                    <div
                        className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-red-200/70 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.32)] dark:border-red-900/40 dark:bg-darkCard"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-red-100 bg-[linear-gradient(135deg,rgba(255,245,245,0.98),rgba(255,255,255,0.96))] px-6 py-5 dark:border-red-900/30 dark:bg-[linear-gradient(135deg,rgba(60,10,10,0.65),rgba(17,24,39,0.96))]">
                            <div className="flex items-start gap-4">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-300">
                                    <i className="fa-solid fa-triangle-exclamation text-lg"></i>
                                </span>
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-400">Permanent Action</p>
                                    <h3 className="mt-2 text-xl font-black text-brandBlue dark:text-white">Delete Account</h3>
                                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                        {canConfirmDeleteWithPassword
                                            ? 'Enter your current password to confirm permanent account deletion.'
                                            : canConfirmDeleteWithGoogle
                                                ? 'Confirm with Google to permanently delete your account.'
                                                : 'This account needs an additional sign-in check before it can be deleted.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={confirmDeleteAccount} className="space-y-4 px-6 py-6">
                            <div className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-600 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300">
                                This removes your profile record and signs you out immediately.
                            </div>

                            {canConfirmDeleteWithPassword ? (
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Current Password</label>
                                    <input
                                        type="password"
                                        value={deletePassword}
                                        onChange={(event) => setDeletePassword(event.target.value)}
                                        autoComplete="current-password"
                                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-brandBlue outline-none transition-colors focus:border-red-300 focus:bg-white dark:border-gray-700 dark:bg-gray-900/40 dark:text-white"
                                        placeholder="Enter your password"
                                        disabled={isDeletingAccount}
                                    />
                                </div>
                            ) : canConfirmDeleteWithGoogle ? (
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                                    Clicking delete will open a Google confirmation popup for the signed-in account.
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
                                    Unable to determine a supported sign-in method for confirmation.
                                </div>
                            )}

                            {deleteAccountError ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300">
                                    {deleteAccountError}
                                </div>
                            ) : null}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeDeleteDialog}
                                    disabled={isDeletingAccount}
                                    className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-gray-500 transition-colors hover:border-gray-300 hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isDeletingAccount || (!canConfirmDeleteWithPassword && !canConfirmDeleteWithGoogle)}
                                    className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_30px_rgba(239,68,68,0.25)] transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isDeletingAccount ? 'Deleting...' : 'Delete Permanently'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {isTrackedOrderLoading ? (
                <BrandLoadingScreen
                    title="Opening your order"
                    message="جاري فتح الطلب والانتقال مباشرة إلى حالة المتابعة"
                    fixed
                    showProgressBar={false}
                />
            ) : null}
        </div>
    );
}



