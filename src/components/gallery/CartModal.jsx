'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useGallery } from '@/contexts/GalleryContext';

export default function CartModal() {
    const router = useRouter();
    const {
        cartItems,
        cartCount,
        cartSubtotal,
        isCartOpen,
        closeCart,
        removeFromCart,
        updateCartQuantity,
        checkoutCart,
        isCheckingOut,
        showToast,
        wholesaleCartItems,
        wholesaleCartCount,
        wholesaleCartSubtotal,
        isWholesaleCartOpen,
        closeWholesaleCart,
        removeFromWholesaleCart,
        updateWholesaleCartQuantity,
        checkoutWholesaleCart,
        isCheckingOutWholesale
    } = useGallery();

    const handleCheckout = async () => {
        const result = await checkoutCart();
        if (result.requiresAuth) {
            showToast('سجل الدخول أولاً لإتمام الطلب.', 'error');
            closeCart();
            router.push('/login');
        }
    };

    const handleWholesaleCheckout = async () => {
        const result = await checkoutWholesaleCart();
        if (result.requiresAuth) {
            showToast('سجل الدخول أولاً لإتمام طلب الجملة.', 'error');
            closeWholesaleCart();
            router.push('/login');
        }
    };

    return (
        <>
            <CartDialog
                isOpen={isCartOpen}
                title="Shopping Cart | عربة التسوق"
                itemCount={cartCount}
                items={cartItems}
                subtotal={cartSubtotal}
                closeCart={closeCart}
                removeFromCart={removeFromCart}
                updateCartQuantity={updateCartQuantity}
                onCheckout={handleCheckout}
                isCheckingOut={isCheckingOut}
                checkoutLabel="Checkout Order | اتمام الطلب"
                priceLabel="السعر"
                accent="retail"
            />
            <CartDialog
                isOpen={isWholesaleCartOpen}
                title="Wholesale Order | طلب جملة"
                itemCount={wholesaleCartCount}
                items={wholesaleCartItems}
                subtotal={wholesaleCartSubtotal}
                closeCart={closeWholesaleCart}
                removeFromCart={removeFromWholesaleCart}
                updateCartQuantity={updateWholesaleCartQuantity}
                onCheckout={handleWholesaleCheckout}
                isCheckingOut={isCheckingOutWholesale}
                checkoutLabel="Checkout Wholesale | اتمام طلب الجملة"
                priceLabel="Wholesale"
                accent="wholesale"
            />
        </>
    );
}

function CartDialog({
    isOpen,
    title,
    itemCount,
    items,
    subtotal,
    closeCart,
    removeFromCart,
    updateCartQuantity,
    onCheckout,
    isCheckingOut,
    checkoutLabel,
    priceLabel,
    accent
}) {
    if (!isOpen) return null;

    const accentClasses = accent === 'wholesale'
        ? {
            panel: 'border-brandGold/35 bg-white dark:bg-darkCard',
            header: 'border-brandGold/20 bg-brandGold/5 dark:bg-brandGold/10',
            item: 'border-brandGold/30 bg-brandGold/5 dark:bg-brandGold/10',
            qty: 'border-brandGold/25 text-brandGold dark:text-brandGold',
            qtyHover: 'hover:bg-brandGold/10',
            total: 'text-brandGold',
            button: 'border-brandGold bg-brandGold text-brandBlue shadow-brandGold/20',
            history: 'border-brandGold/40 text-brandGold dark:text-brandGold hover:bg-brandGold hover:text-brandBlue dark:hover:text-brandBlue'
        }
        : {
            panel: 'border-brandGold/20 bg-white dark:bg-darkCard',
            header: 'border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-900/40',
            item: 'border-brandGold/20 bg-gray-50 dark:bg-gray-800/40 dark:border-gray-700',
            qty: 'border-green-500/20 text-green-600 dark:text-green-500',
            qtyHover: 'hover:bg-green-50 dark:hover:bg-green-500/10',
            total: 'text-brandBlue dark:text-white',
            button: 'border-brandGold bg-brandBlue text-white shadow-brandBlue/20',
            history: 'border-brandGold/30 text-brandBlue dark:text-brandGold hover:bg-brandBlue hover:text-white dark:hover:bg-brandGold dark:hover:text-brandBlue'
        };

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6" dir="rtl">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCart}></div>
            <div className={`relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border shadow-2xl ${accentClasses.panel}`}>
                <div className={`flex items-center justify-between gap-4 border-b px-6 py-5 ${accentClasses.header}`}>
                    <div>
                        <h2 className={`text-xl font-black uppercase italic tracking-tight ${accent === 'wholesale' ? 'text-brandGold' : 'text-brandBlue dark:text-brandGold'}`}>{title}</h2>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{itemCount} Items</p>
                    </div>
                    <button onClick={closeCart} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm transition-colors hover:text-red-500 dark:bg-gray-800 dark:text-gray-300">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
                    {items.length === 0 ? (
                        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-gray-200 bg-gray-50 text-center dark:border-gray-700 dark:bg-gray-800/30">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-gray-300 shadow-sm dark:bg-darkCard dark:text-gray-600">
                                <i className={`fa-solid ${accent === 'wholesale' ? 'fa-boxes-stacked' : 'fa-cart-shopping'} text-2xl`}></i>
                            </div>
                            <h3 className="text-lg font-black text-brandBlue dark:text-white">{accent === 'wholesale' ? 'طلب الجملة فارغ' : 'العربة فارغة'}</h3>
                            <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                                {accent === 'wholesale'
                                    ? 'أضف المنتجات التي تريدها كجملة من نافذة المنتج، وستظهر هنا لإتمام الطلب.'
                                    : 'ابدأ بإضافة المنتجات التي تريدها من نافذة المنتج، وبعدها ستظهر هنا للتعديل وإتمام الطلب.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {items.map((item) => (
                                <div key={item.cartId} className={`rounded-[1.5rem] border p-4 shadow-[0_6px_20px_rgba(196,164,81,0.08)] ${accentClasses.item}`}>
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.2rem] border border-gray-100 bg-white p-2 dark:border-gray-700 dark:bg-darkCard">
                                            <img src={item.image || '/logo.png'} alt={item.title || item.name} className="max-h-full max-w-full object-contain" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h3 className="text-sm font-black text-brandBlue dark:text-white md:text-base">{item.title || item.name}</h3>
                                                    {item.category ? <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brandGold">{item.category}</p> : null}
                                                </div>
                                                <button onClick={() => removeFromCart(item.cartId)} className="text-sm text-red-400 transition-colors hover:text-red-500">
                                                    <i className="fa-solid fa-trash-can"></i>
                                                </button>
                                            </div>

                                            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{priceLabel}</p>
                                                    <p className={`text-lg font-black ${accent === 'wholesale' ? 'text-brandGold' : 'text-green-600'}`}>
                                                        {(Number(item.price) || 0).toLocaleString()} ج.م
                                                    </p>
                                                </div>

                                                <div className={`flex items-center rounded-2xl border bg-white shadow-sm dark:bg-gray-900 ${accentClasses.qty}`}>
                                                    <button type="button" onClick={() => updateCartQuantity(item.cartId, item.quantity - 1)} className={`flex h-11 w-11 items-center justify-center text-lg font-black transition-colors ${accentClasses.qtyHover}`}>
                                                        -
                                                    </button>
                                                    <span className="min-w-10 border-x border-current/15 px-3 text-center text-sm font-black text-brandBlue dark:text-white">{item.quantity}</span>
                                                    <button type="button" onClick={() => updateCartQuantity(item.cartId, item.quantity + 1)} className={`flex h-11 w-11 items-center justify-center text-lg font-black transition-colors ${accentClasses.qtyHover}`}>
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-4 border-t border-gray-100 bg-gray-50/80 px-6 py-5 dark:border-gray-800 dark:bg-gray-900/40">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">الإجمالي</p>
                            <p className={`text-2xl font-black ${accentClasses.total}`}>{subtotal.toLocaleString()} ج.م</p>
                        </div>
                        <Link href={auth.currentUser ? '/profile' : '/login'} onClick={closeCart} className={`rounded-xl border bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] transition-colors dark:bg-gray-900 ${accentClasses.history}`}>
                            {auth.currentUser ? 'Order History' : 'Login First'}
                        </Link>
                    </div>

                    <button type="button" onClick={onCheckout} disabled={items.length === 0 || isCheckingOut} className={`flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-4 text-sm font-black uppercase tracking-[0.18em] shadow-lg transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 ${accentClasses.button}`}>
                        <span>{isCheckingOut ? 'Processing...' : checkoutLabel}</span>
                        <i className="fa-solid fa-arrow-left"></i>
                    </button>
                </div>
            </div>
        </div>
    );
}