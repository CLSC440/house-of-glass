'use client';
import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';

export default function ResetPassword() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const resetMessages = {
        sent: 'Password reset link sent. Check your email inbox. | تم إرسال رابط إعادة تعيين كلمة المرور. راجع بريدك الإلكتروني.',
        userNotFound: 'No user found with this email address. | لا يوجد مستخدم بهذا البريد الإلكتروني.',
        genericError: 'Failed to send reset email. Please try again. | تعذر إرسال رسالة إعادة التعيين. حاول مرة أخرى.'
    };

    const handleReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            await sendPasswordResetEmail(auth, email);
            setMessage(resetMessages.sent);
            setEmail('');
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/user-not-found') {
                setError(resetMessages.userNotFound);
            } else {
                setError(resetMessages.genericError);
            }
        }
        setLoading(false);
    };

    return (
        <div className="bg-white dark:bg-darkBg font-sans flex min-h-screen items-center justify-center px-4 transition-colors duration-300">
            {loading && (
                <div className="fixed inset-0 z-[200] bg-white dark:bg-brandBlue flex flex-col items-center justify-center transition-opacity duration-300">
                    <div className="relative flex flex-col items-center">
                        <img src="/logo.png" className="h-32 md:h-48 w-auto animate-pulse" alt="Loading..." />
                        <div className="mt-12 flex flex-col items-center">
                            <div className="w-48 h-1 bg-gray-100 dark:bg-brandGold/10 rounded-full overflow-hidden relative">
                                <div className="absolute h-full bg-brandGold w-1/3 rounded-full animate-[loading-bar_2s_infinite_ease-in-out]"></div>
                            </div>
                            <p className="mt-6 text-[10px] font-black uppercase text-brandGold tracking-[0.5em] animate-pulse">Verifying Email</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-[30rem] rounded-2xl border border-gray-100 bg-white px-6 pb-6 pt-3 shadow-2xl dark:border-gray-800 dark:bg-darkCard md:px-8 md:pb-8 md:pt-4">
                <div className="mb-5 text-center md:mb-6">
                    <Link href="/" className="group mb-2 inline-block">
                        <div className="inline-flex items-center justify-center rounded-lg">
                            <img src="/logo.png" alt="Logo" className="mx-auto h-16 w-auto transition-transform group-hover:scale-105 md:h-20" />
                        </div>
                    </Link>
                    <div className="space-y-0.5">
                        <h1 className="text-xl font-bold italic text-brandBlue dark:text-brandGold md:text-2xl">Reset Password</h1>
                        <p className="font-arabic text-sm font-bold text-brandBlue dark:text-brandGold md:text-base" dir="rtl">إعادة تعيين كلمة المرور</p>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-slate-400 md:text-sm">
                        <p>Enter your email to receive a reset link</p>
                        <p className="font-arabic" dir="rtl">أدخل بريدك الإلكتروني لاستلام رابط إعادة التعيين</p>
                    </div>
                </div>

                {error && (
                    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">
                        {error}
                    </div>
                )}
                {message && (
                    <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300">
                        {message}
                    </div>
                )}

                <form onSubmit={handleReset} className="space-y-6">
                    <div>
                        <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                            <span>Email Address</span>
                            <span className="font-arabic" dir="rtl">البريد الإلكتروني</span>
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none focus:ring-2 focus:ring-brandGold dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                            placeholder="e.g. name@example.com"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={
                            'w-full rounded-xl border p-3.5 text-base font-bold transition-all md:p-4 ' +
                            (loading
                                ? 'cursor-not-allowed border-gray-400 bg-gray-400 text-white'
                                : 'border-brandGold/30 bg-brandBlue text-white shadow-lg hover:bg-opacity-90')
                        }
                    >
                        {loading ? 'Sending... | جاري الإرسال...' : 'Verify Email | تأكيد البريد'}
                    </button>
                </form>

                <div className="mt-8 border-t border-gray-100 pt-6 text-center dark:border-gray-800">
                    <Link href="/login" className="text-sm text-gray-500 transition-colors hover:text-brandBlue dark:text-slate-400 dark:hover:text-brandGold">
                        ← Back to Login
                    </Link>
                    <p className="mt-2 font-arabic text-sm text-gray-500 dark:text-slate-400" dir="rtl">العودة إلى تسجيل الدخول</p>
                </div>

                <div className="mt-6 text-center">
                    <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-gray-400 italic">Premium Home Glassware</p>
                    <p className="font-arabic text-xl font-black text-[#163159] dark:text-brandGold" dir="rtl">ال عاشور عدس</p>
                </div>
            </div>
        </div>
    );
}
