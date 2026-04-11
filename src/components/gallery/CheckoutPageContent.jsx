'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useGallery } from '@/contexts/GalleryContext';
import { useSiteSettings } from '@/lib/use-site-settings';
import { upsertCurrentUserProfile } from '@/lib/account-api';
import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';

function normalizeCheckoutType(value) {
    return String(value || '').trim().toLowerCase() === 'wholesale' ? 'wholesale' : 'retail';
}

function formatCurrency(value) {
    return `${(Number(value) || 0).toLocaleString()} ج.م`;
}

function parseAmount(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function normalizeDeliveryMethod(value) {
    return String(value || '').trim().toLowerCase() === 'shipping' ? 'shipping' : 'pickup';
}

function normalizePromoCode(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizePromoDiscountType(value) {
    return String(value || '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
}

function getConfiguredPromoSettings(derivedSettings) {
    const code = String(derivedSettings?.promoCode || '').trim();
    const discountType = normalizePromoDiscountType(derivedSettings?.promoDiscountType);
    const rawValue = parseAmount(derivedSettings?.promoDiscountValue);
    const discountValue = discountType === 'percentage'
        ? Math.min(rawValue, 100)
        : rawValue;

    return {
        code,
        normalizedCode: normalizePromoCode(code),
        discountType,
        discountValue
    };
}

function calculatePromoDiscountAmount(subtotal, promoSettings, isApplied) {
    const safeSubtotal = parseAmount(subtotal);

    if (!isApplied || !promoSettings.normalizedCode || promoSettings.discountValue <= 0 || safeSubtotal <= 0) {
        return 0;
    }

    if (promoSettings.discountType === 'percentage') {
        return Math.min(safeSubtotal, (safeSubtotal * promoSettings.discountValue) / 100);
    }

    return Math.min(safeSubtotal, promoSettings.discountValue);
}

function formatPromoDiscountLabel(promoSettings) {
    if (promoSettings.discountType === 'percentage') {
        return `${promoSettings.discountValue}%`;
    }

    return formatCurrency(promoSettings.discountValue);
}

function buildCustomerSnapshot(currentUser, profileData, fallbackRole) {
    if (!currentUser) {
        return null;
    }

    const name = profileData?.name
        || [profileData?.firstName, profileData?.lastName].filter(Boolean).join(' ')
        || currentUser.displayName
        || currentUser.email?.split('@')[0]
        || 'Guest User';

    return {
        name,
        email: profileData?.email || currentUser.email || 'غير متوفر',
        phone: profileData?.phone || 'غير متوفر',
        role: profileData?.role || fallbackRole || 'customer'
    };
}

function getCustomerPhoneValue(customerInfo) {
    const phone = String(customerInfo?.phone || '').trim();
    return phone && phone !== 'غير متوفر' ? phone : '';
}

export default function CheckoutPageContent({ checkoutType }) {
    const router = useRouter();
    const normalizedCheckoutType = normalizeCheckoutType(checkoutType);
    const isWholesale = normalizedCheckoutType === 'wholesale';
    const {
        cartItems,
        cartCount,
        cartSubtotal,
        isLoading: isGalleryLoading,
        isRetailCartPricingReady,
        removeFromCart,
        updateCartQuantity,
        checkoutCart,
        isCheckingOut,
        wholesaleCartItems,
        wholesaleCartCount,
        wholesaleCartSubtotal,
        isWholesaleCartPricingReady,
        removeFromWholesaleCart,
        updateWholesaleCartQuantity,
        checkoutWholesaleCart,
        isCheckingOutWholesale,
        getCartItemStockLimit,
        isWholesaleCustomer,
        userRole,
        showToast
    } = useGallery();
    const { derivedSettings, isLoading: isSettingsLoading } = useSiteSettings();
    const [customerInfo, setCustomerInfo] = useState(null);
    const [isCustomerLoading, setIsCustomerLoading] = useState(true);
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [appliedPromoCode, setAppliedPromoCode] = useState('');
    const [promoFeedback, setPromoFeedback] = useState(null);
    const [deliveryMethod, setDeliveryMethod] = useState('pickup');
    const [shippingAddress, setShippingAddress] = useState('');
    const [shippingAddressError, setShippingAddressError] = useState('');
    const [isPhonePromptOpen, setIsPhonePromptOpen] = useState(false);
    const [phonePromptValue, setPhonePromptValue] = useState('');
    const [phonePromptError, setPhonePromptError] = useState('');
    const [isSavingPhone, setIsSavingPhone] = useState(false);

    const items = isWholesale ? wholesaleCartItems : cartItems;
    const itemCount = isWholesale ? wholesaleCartCount : cartCount;
    const subtotal = isWholesale ? wholesaleCartSubtotal : cartSubtotal;
    const isCartPricingReady = isWholesale ? isWholesaleCartPricingReady : isRetailCartPricingReady;
    const updateQuantity = isWholesale ? updateWholesaleCartQuantity : updateCartQuantity;
    const removeItem = isWholesale ? removeFromWholesaleCart : removeFromCart;
    const submitCheckout = isWholesale ? checkoutWholesaleCart : checkoutCart;
    const isSubmitting = isWholesale ? isCheckingOutWholesale : isCheckingOut;
    const normalizedDeliveryMethod = normalizeDeliveryMethod(deliveryMethod);
    const isShippingSelected = normalizedDeliveryMethod === 'shipping';
    const configuredShippingAmount = parseAmount(derivedSettings?.shippingPrice);
    const shippingAmount = isShippingSelected ? configuredShippingAmount : 0;
    const productCount = items.length;
    const customerPhoneValue = getCustomerPhoneValue(customerInfo);
    const promoSettings = useMemo(() => getConfiguredPromoSettings(derivedSettings), [derivedSettings]);
    const isPromoApplied = promoSettings.normalizedCode && normalizePromoCode(appliedPromoCode) === promoSettings.normalizedCode;
    const discountAmount = calculatePromoDiscountAmount(subtotal, promoSettings, isPromoApplied);
    const finalTotal = Math.max(0, subtotal - discountAmount + shippingAmount);
    const loginTarget = `/login?redirect=checkout${isWholesale ? '&type=wholesale' : ''}`;
    const signupTarget = `/signup?redirect=checkout${isWholesale ? '&type=wholesale' : ''}`;

    useEffect(() => {
        let isMounted = true;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!isMounted) {
                return;
            }

            if (!currentUser) {
                setCustomerInfo(null);
                setIsCustomerLoading(false);
                return;
            }

            setIsCustomerLoading(true);

            try {
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                const profileData = userDoc.exists() ? userDoc.data() : {};

                if (!isMounted) {
                    return;
                }

                setCustomerInfo(buildCustomerSnapshot(currentUser, profileData, userRole));
            } catch (error) {
                console.error('Failed to load checkout customer profile:', error);
                if (isMounted) {
                    setCustomerInfo(buildCustomerSnapshot(currentUser, {}, userRole));
                }
            } finally {
                if (isMounted) {
                    setIsCustomerLoading(false);
                }
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [userRole]);

    useEffect(() => {
        if (!promoSettings.normalizedCode) {
            setAppliedPromoCode('');
            setPromoFeedback(null);
            return;
        }

        if (appliedPromoCode && normalizePromoCode(appliedPromoCode) !== promoSettings.normalizedCode) {
            setAppliedPromoCode('');
            setPromoFeedback(null);
        }
    }, [appliedPromoCode, promoSettings.normalizedCode]);

    const handleApplyPromoCode = () => {
        if (!promoSettings.normalizedCode) {
            setAppliedPromoCode('');
            setPromoFeedback({ type: 'error', message: 'لا يوجد Promo Code مفعّل حالياً.' });
            return;
        }

        const normalizedInput = normalizePromoCode(promoCodeInput);

        if (!normalizedInput) {
            setAppliedPromoCode('');
            setPromoFeedback({ type: 'error', message: 'اكتب الـ Promo Code أولاً.' });
            return;
        }

        if (normalizedInput !== promoSettings.normalizedCode) {
            setAppliedPromoCode('');
            setPromoFeedback({ type: 'error', message: 'الـ Promo Code غير صحيح.' });
            return;
        }

        setAppliedPromoCode(promoSettings.code);
        setPromoCodeInput(promoSettings.code);
        setPromoFeedback({
            type: 'success',
            message: `تم تطبيق خصم ${formatPromoDiscountLabel(promoSettings)} على الطلب.`
        });
    };

    const handleClearPromoCode = () => {
        setAppliedPromoCode('');
        setPromoCodeInput('');
        setPromoFeedback(null);
    };

    const closePhonePrompt = () => {
        if (isSavingPhone || isSubmitting) {
            return;
        }

        setIsPhonePromptOpen(false);
        setPhonePromptValue('');
        setPhonePromptError('');
    };

    const finalizeOrderConfirmation = async () => {
        const result = await submitCheckout({
            subtotalAmount: subtotal,
            shippingAmount,
            discountAmount,
            totalPrice: finalTotal,
            promoCode: isPromoApplied ? promoSettings.code : '',
            promoDiscountType: isPromoApplied ? promoSettings.discountType : '',
            promoDiscountValue: isPromoApplied ? promoSettings.discountValue : 0,
            deliveryMethod: normalizedDeliveryMethod,
            shippingAddress: isShippingSelected ? shippingAddress.trim() : ''
        });

        if (result.requiresAuth) {
            router.push(loginTarget);
            return;
        }

        if (result.ok) {
            router.push('/profile');
        }
    };

    const handlePhonePromptSubmit = async (event) => {
        event.preventDefault();

        const currentUser = auth.currentUser;
        if (!currentUser) {
            closePhonePrompt();
            showToast('سجل الدخول أولاً لتأكيد الطلب.', 'error');
            router.push(loginTarget);
            return;
        }

        const trimmedPhone = String(phonePromptValue || '').trim();
        if (!trimmedPhone) {
            setPhonePromptError('اكتب رقم الموبايل قبل إكمال الطلب.');
            return;
        }

        setIsSavingPhone(true);
        setPhonePromptError('');

        try {
            const response = await upsertCurrentUserProfile(currentUser, { phone: trimmedPhone });
            const savedProfile = response?.profile || { phone: trimmedPhone };

            setCustomerInfo(buildCustomerSnapshot(currentUser, savedProfile, userRole));
            setIsPhonePromptOpen(false);
            setPhonePromptValue('');

            await finalizeOrderConfirmation();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'تعذر حفظ رقم الموبايل حالياً. حاول مرة أخرى.';
            setPhonePromptError(errorMessage);
        } finally {
            setIsSavingPhone(false);
        }
    };

    const handleConfirmOrder = async () => {
        if (!auth.currentUser) {
            showToast('سجل الدخول أولاً لتأكيد الطلب.', 'error');
            router.push(loginTarget);
            return;
        }

        if (isCustomerLoading) {
            showToast('جارٍ تحميل بيانات الحساب، حاول مرة أخرى خلال لحظة.', 'error');
            return;
        }

        if (isShippingSelected && !shippingAddress.trim()) {
            const errorMessage = 'اكتب عنوان الشحن بالتفصيل قبل تأكيد الطلب.';
            setShippingAddressError(errorMessage);
            showToast(errorMessage, 'error');
            return;
        }

        setShippingAddressError('');

        if (!customerPhoneValue) {
            setPhonePromptError('');
            setPhonePromptValue('');
            setIsPhonePromptOpen(true);
            return;
        }

        await finalizeOrderConfirmation();
    };

    if (isGalleryLoading || isSettingsLoading || isCustomerLoading || !isCartPricingReady) {
        return (
            <BrandLoadingScreen
                title={isWholesale ? 'Loading wholesale checkout' : 'Loading checkout'}
                message={isWholesale ? 'جاري تحميل بيانات طلب الجملة والحساب والأسعار النهائية قبل فتح الصفحة' : 'جاري تحميل بيانات العربة والحساب والأسعار النهائية قبل فتح صفحة الـ checkout'}
                showProgressBar={false}
            />
        );
    }

    if (isWholesale && auth.currentUser && !isWholesaleCustomer) {
        return (
            <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-12" dir="rtl">
                <div className="overflow-hidden rounded-[2rem] border border-brandGold/25 bg-white shadow-[0_25px_80px_rgba(18,25,38,0.08)] dark:bg-darkCard">
                    <div className="border-b border-brandGold/15 bg-gradient-to-r from-brandBlue via-[#1f2a44] to-brandBlue px-6 py-8 text-white md:px-10">
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-brandGold">Wholesale Checkout</p>
                        <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">هذا المسار متاح لحسابات الجملة فقط</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
                            الحساب الحالي لا يملك صلاحية تأكيد طلب جملة. يمكنك الرجوع لطلب التجزئة أو التواصل مع الإدارة لتفعيل حساب الجملة.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
                        <Link href="/checkout" className="inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-6 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01]">
                            التحويل إلى Checkout التجزئة
                        </Link>
                        <Link href="/profile" className="inline-flex items-center justify-center rounded-2xl border border-brandGold/35 px-6 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                            الذهاب إلى الحساب
                        </Link>
                    </div>
                </div>
            </section>
        );
    }

    if (items.length === 0) {
        return (
            <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-12" dir="rtl">
                <div className="overflow-hidden rounded-[2rem] border border-brandGold/20 bg-white shadow-[0_25px_80px_rgba(18,25,38,0.08)] dark:bg-darkCard">
                    <div className="border-b border-brandGold/15 bg-gradient-to-r from-brandBlue via-[#1f2a44] to-brandBlue px-6 py-8 text-white md:px-10">
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-brandGold">{isWholesale ? 'Wholesale Checkout' : 'Checkout'}</p>
                        <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">{isWholesale ? 'طلب الجملة فارغ حالياً' : 'لا توجد منتجات داخل الطلب حالياً'}</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
                            أضف المنتجات أولاً من المعرض، وبعدها ارجع هنا لمراجعة التفاصيل وتأكيد الطلب.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
                        <Link href="/" className="inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-6 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01]">
                            الرجوع للمعرض
                        </Link>
                        {isWholesale ? (
                            <Link href="/checkout" className="inline-flex items-center justify-center rounded-2xl border border-brandGold/35 px-6 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                                فتح Checkout التجزئة
                            </Link>
                        ) : null}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12" dir="rtl">
            <div className="overflow-hidden rounded-[2rem] border border-brandGold/20 bg-white shadow-[0_25px_80px_rgba(18,25,38,0.08)] dark:bg-darkCard">
                <div className={`relative overflow-hidden px-5 py-6 md:px-10 md:py-10 ${isWholesale ? 'bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.25),_transparent_38%),linear-gradient(135deg,#121926_0%,#1e2740_45%,#0b1222_100%)]' : 'bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.18),_transparent_35%),linear-gradient(135deg,#f7f3e8_0%,#ffffff_42%,#eef3fb_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.22),_transparent_38%),linear-gradient(135deg,#121926_0%,#1c2438_48%,#0b1222_100%)]'}`}>
                    <div className="absolute inset-y-0 left-0 hidden w-56 bg-[linear-gradient(135deg,rgba(212,175,55,0.14),transparent)] md:block dark:bg-[linear-gradient(135deg,rgba(212,175,55,0.12),transparent)]"></div>
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-[0.28em] md:text-[11px] md:tracking-[0.35em] ${isWholesale ? 'text-brandGold' : 'text-brandBlue/60 dark:text-brandGold'}`}>
                                {isWholesale ? 'Wholesale Checkout' : 'Retail Checkout'}
                            </p>
                            <h1 className={`mt-2 max-w-[280px] text-[1.95rem] font-black leading-[1.12] sm:max-w-sm sm:text-[2.2rem] md:mt-3 md:max-w-none md:text-4xl ${isWholesale ? 'text-white' : 'text-brandBlue dark:text-white'}`}>
                                {isWholesale ? 'راجع طلب الجملة قبل التأكيد' : 'راجع تفاصيل الطلب قبل التأكيد'}
                            </h1>
                            <p className={`mt-3 max-w-[290px] text-[12.5px] leading-6 sm:max-w-xl sm:text-sm md:max-w-2xl md:text-base md:leading-7 ${isWholesale ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                هنا تقدر تشوف كل المنتجات، تعدل الكميات، وتراجع بيانات الحساب قبل إرسال الطلب النهائي.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            <div className={`rounded-[1.1rem] border px-3 py-3 sm:rounded-[1.4rem] sm:px-5 sm:py-4 ${isWholesale ? 'border-brandGold/20 bg-white/8 text-white' : 'border-brandBlue/10 bg-white/80 text-brandBlue dark:border-brandGold/20 dark:bg-white/[0.05] dark:text-white'}`}>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60 sm:text-[10px] sm:tracking-[0.24em]">Items</p>
                                <p className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">{itemCount}</p>
                            </div>
                            <div className={`rounded-[1.1rem] border px-3 py-3 sm:rounded-[1.4rem] sm:px-5 sm:py-4 ${isWholesale ? 'border-brandGold/20 bg-white/8 text-white' : 'border-brandBlue/10 bg-white/80 text-brandBlue dark:border-brandGold/20 dark:bg-white/[0.05] dark:text-white'}`}>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60 sm:text-[10px] sm:tracking-[0.24em]">Type</p>
                                <p className="mt-1 text-sm font-black sm:mt-2 sm:text-lg">{isWholesale ? 'Wholesale' : 'Retail'}</p>
                            </div>
                            <div className={`rounded-[1.1rem] border px-3 py-3 sm:rounded-[1.4rem] sm:px-5 sm:py-4 ${isWholesale ? 'border-brandGold/20 bg-white/8 text-white' : 'border-brandBlue/10 bg-white/80 text-brandBlue dark:border-brandGold/20 dark:bg-white/[0.05] dark:text-white'}`}>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-60 sm:text-[10px] sm:tracking-[0.24em]">Total</p>
                                <p className="mt-1 text-lg font-black sm:mt-2 sm:text-2xl">{formatCurrency(subtotal)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
                <div className="space-y-5">
                    {items.map((item) => {
                        const stockLimit = getCartItemStockLimit(item, isWholesale ? 'wholesale' : 'retail');
                        const isAtStockLimit = stockLimit !== null && item.quantity >= stockLimit;

                        return (
                            <article key={item.cartId} className="rounded-[1.8rem] border border-brandGold/18 bg-white p-5 shadow-[0_20px_45px_rgba(18,25,38,0.06)] dark:border-brandGold/15 dark:bg-darkCard md:p-6">
                                <div className="flex flex-col gap-5 md:flex-row md:items-center">
                                    <div className="hidden h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[1.5rem] border border-brandGold/15 bg-gray-50 p-3 dark:bg-gray-900/50 md:flex">
                                        <img src={item.image || '/logo.png'} alt={item.title || item.name} className="max-h-full max-w-full object-contain" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="space-y-4 md:hidden">
                                            <div className="flex items-start gap-4">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] border border-brandGold/15 bg-gray-50 p-3 dark:bg-gray-900/50">
                                                        <img src={item.image || '/logo.png'} alt={item.title || item.name} className="max-h-full max-w-full object-contain" />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Price</p>
                                                        <p className="mt-1 text-lg font-black text-green-600 dark:text-brandGold">{formatCurrency(item.price)}</p>
                                                    </div>
                                                </div>

                                                <div className="min-w-0 flex-1 pt-1 text-right flex flex-col items-start min-h-[140px] justify-between">
                                                    <div>
                                                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-brandGold w-full text-right">{item.category || (isWholesale ? 'Wholesale Item' : 'Gallery Item')}</p>
                                                        <h2 className="mt-2 text-[1.28rem] font-black leading-[1.15] text-brandBlue dark:text-white sm:text-[1.45rem] w-full text-right">{item.title || item.name}</h2>
                                                        {item.productCode ? <p className="mt-2 text-[11px] font-bold tracking-[0.14em] text-slate-400 w-full text-right">Code: {item.productCode}</p> : null}
                                                    </div>
                                                    
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.cartId)}
                                                        className="inline-flex items-center justify-center rounded-full border border-red-200 px-5 py-2 text-xs font-black text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:hover:bg-red-500/10 mt-auto ml-0 mr-auto self-end"
                                                    >
                                                        حذف
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hidden md:flex md:flex-row md:items-start md:justify-between md:gap-4">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">{item.category || (isWholesale ? 'Wholesale Item' : 'Gallery Item')}</p>
                                                <h2 className="mt-2 text-xl font-black text-brandBlue dark:text-white">{item.title || item.name}</h2>
                                                {item.productCode ? <p className="mt-2 text-xs font-bold tracking-[0.18em] text-slate-400">Code: {item.productCode}</p> : null}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.cartId)}
                                                className="inline-flex items-center justify-center rounded-full border border-red-200 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:hover:bg-red-500/10"
                                            >
                                                حذف
                                            </button>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 items-start gap-4 md:mt-5 md:grid-cols-[auto_auto_1fr] md:items-end">
                                            <div className="hidden text-right md:block">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Price</p>
                                                <p className="mt-2 text-xl font-black text-green-600 dark:text-brandGold">{formatCurrency(item.price)}</p>
                                            </div>

                                            <div className="text-left md:text-center order-2 md:order-none">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Quantity</p>
                                                <div className="mt-2 inline-flex items-center rounded-2xl border border-brandGold/20 bg-white shadow-sm dark:bg-gray-900">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQuantity(item.cartId, item.quantity - 1)}
                                                        className="flex h-11 w-11 items-center justify-center text-lg font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-white"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="min-w-12 border-x border-brandGold/15 px-4 text-center text-sm font-black text-brandBlue dark:text-white">{item.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQuantity(item.cartId, item.quantity + 1)}
                                                        disabled={isAtStockLimit}
                                                        className="flex h-11 w-11 items-center justify-center text-lg font-black text-brandBlue transition-colors hover:bg-brandGold/10 disabled:cursor-not-allowed disabled:opacity-35 dark:text-white"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="text-right md:text-left order-1 md:order-none">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Line Total</p>
                                                <p className="mt-2 text-2xl font-black text-brandBlue dark:text-white md:text-xl">{formatCurrency((Number(item.price) || 0) * item.quantity)}</p>
                                                {stockLimit !== null ? (
                                                    <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                                        {stockLimit > 0 ? `المتاح حالياً: ${stockLimit}` : 'غير متاح حالياً'}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>

                <aside className="space-y-5 xl:sticky xl:top-28 xl:self-start">
                    <div className="rounded-[1.8rem] border border-brandGold/20 bg-white p-6 shadow-[0_20px_45px_rgba(18,25,38,0.06)] dark:bg-darkCard">
                        <div className="flex items-center justify-between gap-3 border-b border-brandGold/12 pb-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">Customer Details</p>
                                <h2 className="mt-2 text-xl font-black text-brandBlue dark:text-white">بيانات تأكيد الطلب</h2>
                            </div>
                            {!auth.currentUser ? (
                                <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-red-500 dark:bg-red-500/10">Login Required</span>
                            ) : null}
                        </div>

                        {isCustomerLoading ? (
                            <div className="space-y-3 pt-5">
                                <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"></div>
                                <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"></div>
                                <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"></div>
                            </div>
                        ) : customerInfo ? (
                            <div className="space-y-3 pt-5">
                                <div className="rounded-2xl border border-brandGold/12 bg-gray-50 px-4 py-4 dark:bg-gray-900/50">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">الاسم</p>
                                    <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{customerInfo.name}</p>
                                </div>
                                <div className="rounded-2xl border border-brandGold/12 bg-gray-50 px-4 py-4 dark:bg-gray-900/50">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">البريد الإلكتروني</p>
                                    <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{customerInfo.email}</p>
                                </div>
                                <div className="rounded-2xl border border-brandGold/12 bg-gray-50 px-4 py-4 dark:bg-gray-900/50">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">رقم الهاتف</p>
                                    <p className="mt-2 text-sm font-black text-brandBlue dark:text-white">{customerInfo.phone}</p>
                                </div>

                                <div className="rounded-[1.5rem] border border-brandGold/15 bg-brandGold/[0.04] px-4 py-4 dark:bg-brandGold/[0.06]">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="text-right sm:flex-1">
                                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brandGold">Delivery Method</p>
                                            <h3 className="mt-2 text-lg font-black leading-[1.45] text-brandBlue dark:text-white sm:text-base sm:leading-[1.35]">طريقة الاستلام أو التوصيل</h3>
                                            <p className="mt-2 text-sm font-bold leading-7 text-slate-500 dark:text-slate-300 sm:max-w-[26rem]">
                                                اختَر إذا كنت ستستلم الطلب من المعرض أو تريد شحنه إلى عنوانك.
                                            </p>
                                        </div>
                                        <span className="inline-flex w-fit self-start rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-brandBlue shadow-sm dark:bg-white/10 dark:text-brandGold sm:self-auto">
                                            {isShippingSelected ? 'Shipping' : 'Pickup'}
                                        </span>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        <div className={`overflow-hidden rounded-[1.35rem] border transition-colors ${!isShippingSelected ? 'border-brandBlue bg-brandBlue text-white shadow-lg shadow-brandBlue/15 dark:border-brandGold dark:bg-brandGold dark:text-brandBlue' : 'border-brandGold/18 bg-white text-brandBlue dark:bg-gray-900/60 dark:text-white'}`}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDeliveryMethod('pickup');
                                                    setShippingAddressError('');
                                                }}
                                                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-right"
                                            >
                                                <div>
                                                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${!isShippingSelected ? 'text-white/75 dark:text-brandBlue/75' : 'text-brandGold'}`}>Pickup</p>
                                                    <p className="mt-2 text-base font-black">استلام الطلب من المعرض</p>
                                                </div>
                                                <i className={`fa-solid ${!isShippingSelected ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm ${!isShippingSelected ? 'text-white/75 dark:text-brandBlue/75' : 'text-brandGold'}`}></i>
                                            </button>

                                            {!isShippingSelected ? (
                                                <div className="border-t border-white/12 px-4 pb-4 pt-4 dark:border-brandBlue/15">
                                                    <p className="text-sm font-bold leading-7 text-white/85 dark:text-brandBlue/85">
                                                        بدون رسوم شحن، وتأكيد الطلب يتم بنفس بياناتك الحالية.
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className={`overflow-hidden rounded-[1.35rem] border transition-colors ${isShippingSelected ? 'border-brandBlue bg-brandBlue text-white shadow-lg shadow-brandBlue/15 dark:border-brandGold dark:bg-brandGold dark:text-brandBlue' : 'border-brandGold/18 bg-white text-brandBlue dark:bg-gray-900/60 dark:text-white'}`}>
                                            <button
                                                type="button"
                                                onClick={() => setDeliveryMethod('shipping')}
                                                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-right"
                                            >
                                                <div>
                                                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isShippingSelected ? 'text-white/75 dark:text-brandBlue/75' : 'text-brandGold'}`}>Shipping</p>
                                                    <p className="mt-2 text-base font-black">شحن الطلب إلى عنواني</p>
                                                </div>
                                                <i className={`fa-solid ${isShippingSelected ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm ${isShippingSelected ? 'text-white/75 dark:text-brandBlue/75' : 'text-brandGold'}`}></i>
                                            </button>

                                            {isShippingSelected ? (
                                                <div className="border-t border-white/12 px-4 pb-4 pt-4 dark:border-brandBlue/15">
                                                    <p className="text-sm font-bold leading-7 text-white/85 dark:text-brandBlue/85">
                                                        رسوم الشحن الحالية: {formatCurrency(configuredShippingAmount)}
                                                    </p>

                                                    <label className="mt-4 block text-right text-[11px] font-black uppercase tracking-[0.2em] text-white/75 dark:text-brandBlue/75">Shipping Address | عنوان الشحن</label>
                                                    <textarea
                                                        value={shippingAddress}
                                                        onChange={(event) => {
                                                            setShippingAddress(event.target.value);
                                                            setShippingAddressError('');
                                                        }}
                                                        rows={4}
                                                        placeholder="اكتب عنوان الشحن بالتفصيل: المحافظة، المنطقة، الشارع، رقم العقار، وأي علامة مميزة"
                                                        className={`mt-3 min-h-[120px] w-full rounded-[1.35rem] border bg-white px-4 py-3 text-sm font-bold text-brandBlue outline-none transition-colors placeholder:text-slate-400 dark:bg-gray-900 dark:text-white ${shippingAddressError ? 'border-red-400 focus:border-red-500' : 'border-brandGold/20 focus:border-brandGold'}`}
                                                    />
                                                    {shippingAddressError ? (
                                                        <p className="mt-2 text-sm font-extrabold text-red-200 dark:text-red-500">{shippingAddressError}</p>
                                                    ) : (
                                                        <p className="mt-2 text-sm font-bold leading-7 text-white/80 dark:text-brandBlue/80">سيُحفظ هذا العنوان مع الطلب حتى يظهر للإدارة أثناء المراجعة.</p>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 pt-5">
                                <p className="rounded-2xl border border-dashed border-brandGold/25 bg-brandGold/5 px-4 py-4 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
                                    لازم تسجل الدخول أو تنشئ حساب قبل تأكيد الطلب. السلة محفوظة عندك، وبعد تسجيل الدخول هترجع لنفس صفحة الـ checkout.
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Link href={loginTarget} className="inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-4 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01]">
                                        تسجيل الدخول
                                    </Link>
                                    <Link href={signupTarget} className="inline-flex items-center justify-center rounded-2xl border border-brandGold/35 px-4 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                                        إنشاء حساب
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-[1.8rem] border border-brandGold/20 bg-white p-6 shadow-[0_20px_45px_rgba(18,25,38,0.06)] dark:bg-darkCard">
                        <div className="border-b border-brandGold/12 pb-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">Order Summary</p>
                            <h2 className="mt-2 text-xl font-black text-brandBlue dark:text-white">ملخص الطلب</h2>
                        </div>

                        <div className="space-y-4 pt-5 text-sm font-bold text-slate-600 dark:text-slate-300">
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Items</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">عدد الأصناف</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{productCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Subtotal</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">الطلب</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Discount</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">الخصم</span>
                                </span>
                                <span className={discountAmount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-brandBlue dark:text-white'}>
                                    {discountAmount > 0 ? `- ${formatCurrency(discountAmount)}` : formatCurrency(0)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Delivery</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">طريقة الاستلام</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{isShippingSelected ? 'شحن' : 'استلام من المعرض'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Shipping</span>
                                    <span className="block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">الشحن</span>
                                </span>
                                <span className="text-brandBlue dark:text-white">{formatCurrency(shippingAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-dashed border-brandGold/15 pt-4 text-base">
                                <span className="flex flex-col items-end gap-1 text-right font-black text-brandBlue dark:text-white">
                                    <span className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Total</span>
                                    <span className="block w-full text-right text-[1.05rem] font-extrabold leading-tight text-brandBlue dark:text-white">الإجمالي النهائي</span>
                                </span>
                                <span className="text-2xl font-black text-green-600 dark:text-brandGold">{formatCurrency(finalTotal)}</span>
                            </div>
                        </div>

                        <div className="mt-5 rounded-[1.4rem] border border-brandGold/15 bg-brandGold/[0.04] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 text-right">
                                    <p className="block w-full text-right text-[9px] font-black uppercase leading-none tracking-[0.32em] text-brandGold">Promo Code</p>
                                    <p className="mt-1 block w-full text-right text-base font-extrabold leading-tight text-brandBlue dark:text-white">كود الخصم</p>
                                    <p className="mt-2 block w-full text-right text-[0.95rem] font-bold leading-7 text-slate-500 dark:text-slate-300">
                                        {promoSettings.normalizedCode ? 'اكتب البرومو كود واضغط تطبيق عشان الخصم ينزل على الطلب.' : 'لا يوجد Promo Code مفعّل حالياً من لوحة الإدارة.'}
                                    </p>
                                </div>
                                {isPromoApplied ? (
                                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-500">
                                        Applied
                                    </span>
                                ) : null}
                            </div>

                            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <input
                                    type="text"
                                    value={promoCodeInput}
                                    onChange={(event) => {
                                        setPromoCodeInput(event.target.value);
                                        setAppliedPromoCode('');
                                        setPromoFeedback(null);
                                    }}
                                    placeholder="اكتب الـ Promo Code"
                                    disabled={!promoSettings.normalizedCode}
                                    className="min-w-0 flex-1 rounded-2xl border border-brandGold/20 bg-white px-4 py-3 text-sm font-black uppercase text-brandBlue outline-none transition-colors placeholder:text-slate-400 focus:border-brandGold dark:bg-gray-900 dark:text-white"
                                />
                                <button
                                    type="button"
                                    onClick={handleApplyPromoCode}
                                    disabled={!promoSettings.normalizedCode}
                                    className="inline-flex items-center justify-center rounded-2xl border border-brandBlue bg-brandBlue px-5 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    تطبيق الكود
                                </button>
                            </div>

                            {promoFeedback ? (
                                <p className={`mt-3 text-sm font-extrabold leading-7 ${promoFeedback.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                    {promoFeedback.message}
                                </p>
                            ) : null}

                            {isPromoApplied ? (
                                <button
                                    type="button"
                                    onClick={handleClearPromoCode}
                                    className="mt-3 text-sm font-extrabold text-brandBlue transition-colors hover:text-brandGold dark:text-brandGold"
                                >
                                    إزالة البرومو كود
                                </button>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={handleConfirmOrder}
                            disabled={isSubmitting}
                            className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-4 text-sm font-black uppercase tracking-[0.18em] shadow-lg transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 ${isWholesale ? 'border-brandGold bg-brandGold text-brandBlue shadow-brandGold/20' : 'border-brandGold bg-brandBlue text-white shadow-brandBlue/20'}`}
                        >
                            <span>{isSubmitting ? 'Processing...' : (auth.currentUser ? 'Confirm Order | تأكيد الطلب' : 'Login To Confirm | سجل الدخول أولاً')}</span>
                            <i className="fa-solid fa-check"></i>
                        </button>

                        <Link href="/" className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-brandGold/20 px-5 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 dark:text-brandGold">
                            متابعة التسوق
                        </Link>
                    </div>
                </aside>
            </div>
            {isPhonePromptOpen ? (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#060b17]/72 px-4 py-6 backdrop-blur-sm" onClick={closePhonePrompt}>
                    <div className="w-full max-w-md rounded-[1.8rem] border border-brandGold/20 bg-white p-6 shadow-[0_28px_80px_rgba(6,11,23,0.38)] dark:bg-darkCard" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brandGold">Mobile Number Required</p>
                                <h3 className="mt-2 text-2xl font-black text-brandBlue dark:text-white">أضف رقم الموبايل لإكمال الطلب</h3>
                                <p className="mt-3 text-sm font-bold leading-7 text-slate-500 dark:text-slate-300">
                                    قبل تأكيد الطلب نحتاج رقم موبايلك. بعد حفظه سيتم تسجيله في حسابك وإرسال الطلب للإدارة بشكل طبيعي.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closePhonePrompt}
                                disabled={isSavingPhone || isSubmitting}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brandGold/15 text-brandBlue transition-colors hover:bg-brandGold/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
                                aria-label="إغلاق"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <form className="mt-6" onSubmit={handlePhonePromptSubmit}>
                            <label className="block text-right text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Mobile Number | رقم الموبايل</label>
                            <input
                                type="tel"
                                inputMode="tel"
                                autoFocus
                                dir="ltr"
                                value={phonePromptValue}
                                onChange={(event) => {
                                    setPhonePromptValue(event.target.value);
                                    setPhonePromptError('');
                                }}
                                placeholder="01012345678 أو +201012345678"
                                className={`mt-3 w-full rounded-[1.35rem] border bg-white px-4 py-3 text-left text-sm font-black text-brandBlue outline-none transition-colors placeholder:text-slate-400 dark:bg-gray-900 dark:text-white ${phonePromptError ? 'border-red-400 focus:border-red-500' : 'border-brandGold/20 focus:border-brandGold'}`}
                            />

                            {phonePromptError ? (
                                <p className="mt-3 text-sm font-extrabold leading-7 text-red-500 dark:text-red-400">{phonePromptError}</p>
                            ) : (
                                <p className="mt-3 text-sm font-bold leading-7 text-slate-500 dark:text-slate-300">
                                    يمكنك كتابة الرقم بصيغة `010...` أو `+20...` وسنحفظه في بياناتك مباشرة.
                                </p>
                            )}

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={closePhonePrompt}
                                    disabled={isSavingPhone || isSubmitting}
                                    className="inline-flex items-center justify-center rounded-2xl border border-brandGold/20 px-5 py-3 text-sm font-black text-brandBlue transition-colors hover:bg-brandGold/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brandGold"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingPhone || isSubmitting}
                                    className="inline-flex items-center justify-center gap-3 rounded-2xl border border-brandGold bg-brandBlue px-5 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <span>{isSavingPhone ? 'Saving...' : 'حفظ الرقم وتأكيد الطلب'}</span>
                                    <i className="fa-solid fa-check"></i>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </section>
    );
}