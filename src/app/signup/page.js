'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import Link from 'next/link';
import { checkAccountAvailability, upsertCurrentUserProfile } from '@/lib/account-api';
import { isAdminRole, normalizeUserRole } from '@/lib/user-roles';

function SignupForm() {
    const markNotificationPromptPending = () => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('hog_prompt_notifications_after_login', '1');
        }
    };

    const router = useRouter();
    const searchParams = useSearchParams();
    
    const [formData, setFormData] = useState({
        username: '',
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handlePasswordChange = (e) => {
        const nextPassword = e.target.value;
        setFormData((currentValue) => ({
            ...currentValue,
            password: nextPassword,
            confirmPassword: nextPassword
        }));
    };

    const normalizeEgyptPhoneForSignup = (value) => {
        const digits = String(value || '').replace(/\D/g, '');
        if (/^01[0125]\d{8}$/.test(digits)) return `+20${digits.slice(1)}`;
        if (/^1[0125]\d{8}$/.test(digits)) return `+20${digits}`;
        if (/^20\d{10}$/.test(digits)) return `+${digits}`;
        if (/^\+20\d{10}$/.test(String(value || '').trim())) return String(value || '').trim();
        return '';
    };

    const buildPhoneCredentialEmail = (phone) => {
        const digits = String(phone || '').replace(/\D/g, '');
        return `phone${digits}@users.houseofglass.app`;
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match!');
            setLoading(false);
            return;
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters!');
            setLoading(false);
            return;
        }

        try {
            const normalizedPhone = normalizeEgyptPhoneForSignup(formData.phone);
            if (!normalizedPhone) {
                throw new Error('Phone number is required and must be a valid Egyptian mobile number.');
            }

            const availability = await checkAccountAvailability({ username: formData.username, phone: normalizedPhone });
            if (!availability.usernameAvailable) {
                throw new Error('Username is already taken. Please choose another one.');
            }
            if (!availability.phoneAvailable) {
                throw new Error('Phone number is already registered to another account.');
            }

            const authEmail = formData.email.trim().toLowerCase() || buildPhoneCredentialEmail(normalizedPhone);
            const userCredential = await createUserWithEmailAndPassword(auth, authEmail, formData.password);
            const user = userCredential.user;

            const savedProfile = await upsertCurrentUserProfile(user, {
                username: formData.username,
                firstName: formData.firstName,
                lastName: formData.lastName,
                name: `${formData.firstName} ${formData.lastName}`.trim(),
                email: formData.email.trim().toLowerCase(),
                phone: normalizedPhone
            });

            handleRedirect(savedProfile?.profile || null);
        } catch (err) {
            console.error('Signup error:', err);
            if (err.code === 'auth/email-already-in-use') {
                setError('This email is already in use!');
            } else {
                setError(err.message || 'Failed to create account. Please try again.');
            }
            setLoading(false);
        }
    };

    const handleGoogleSignup = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                const parts = String(user.displayName || '').trim().split(' ').filter(Boolean);
                const firstName = parts[0] || '';
                const lastName = parts.slice(1).join(' ');
                await upsertCurrentUserProfile(user, {
                    firstName,
                    lastName,
                    name: user.displayName || 'Google User',
                    email: user.email || '',
                    phone: user.phoneNumber || '',
                    photoURL: user.photoURL || ''
                }, { autoGenerateUsername: true });
            }

            handleRedirect(userDoc.exists() ? userDoc.data() : null);
        } catch (err) {
            console.error('Google Signup Error:', err);
            setError('Google sign up failed!');
            setLoading(false);
        }
    };

    const handleRedirect = (userData = null) => {
        const redirectParam = searchParams.get('redirect');
        
        if (userData && isAdminRole(normalizeUserRole(userData.role))) {
            markNotificationPromptPending();
            sessionStorage.setItem('isAdmin', 'true');
            sessionStorage.setItem('userRole', normalizeUserRole(userData.role));
            router.push('/admin');
        } else {
            markNotificationPromptPending();
            sessionStorage.removeItem('isAdmin');
            router.push(redirectParam === 'checkout' ? '/?action=checkout' : '/');
        }
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
                            <p className="mt-6 text-[10px] font-black uppercase text-brandGold tracking-[0.5em] animate-pulse">Creating Profile</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-[30rem] rounded-2xl border border-gray-100 bg-white px-6 pb-6 pt-3 shadow-2xl dark:border-gray-800 dark:bg-darkCard md:px-8 md:pb-8 md:pt-4">
                <div className="mb-5 text-center md:mb-6">
                    <Link href="/" className="group mb-4 inline-block">
                        <div className="inline-flex items-center justify-center rounded-lg">
                            <img src="/logo.png" alt="Logo" className="mx-auto h-16 w-auto transition-transform group-hover:scale-105 md:h-20" />
                        </div>
                    </Link>
                    <div className="space-y-0.5">
                        <h1 className="text-xl font-bold italic text-brandBlue dark:text-brandGold md:text-2xl">Create Account</h1>
                        <p className="font-arabic text-sm font-bold text-brandBlue dark:text-brandGold md:text-base" dir="rtl">إنشاء حساب</p>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-slate-400 md:text-sm">
                        <p>Join us to save your favorite pieces</p>
                        <p className="font-arabic" dir="rtl">انضم إلينا لحفظ قطعك المفضلة</p>
                    </div>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                            <span>Username</span>
                            <span className="font-arabic" dir="rtl">اسم المستخدم</span>
                        </label>
                        <input
                            name="username"
                            type="text"
                            required
                            value={formData.username}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none focus:ring-2 focus:ring-brandGold dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                            placeholder="e.g. name123"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                                <span>First Name</span>
                                <span className="font-arabic" dir="rtl">الاسم الأول</span>
                            </label>
                            <input
                                name="firstName"
                                type="text"
                                required
                                value={formData.firstName}
                                onChange={handleChange}
                                className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none focus:ring-2 focus:ring-brandGold dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                            />
                        </div>
                        <div>
                            <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                                <span>Last Name</span>
                                <span className="font-arabic" dir="rtl">الاسم الأخير</span>
                            </label>
                            <input
                                name="lastName"
                                type="text"
                                required
                                value={formData.lastName}
                                onChange={handleChange}
                                className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none focus:ring-2 focus:ring-brandGold dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                            <span>Email Address (Optional)</span>
                            <span className="font-arabic" dir="rtl">البريد الإلكتروني (اختياري)</span>
                        </label>
                        <input
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none focus:ring-2 focus:ring-brandGold dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                            placeholder="e.g. name@example.com"
                        />
                    </div>

                    <div>
                        <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                            <span>Phone Number (Required)</span>
                            <span className="font-arabic" dir="rtl">رقم الهاتف (إجباري)</span>
                        </label>
                        <div className="mt-1 flex group">
                            <span className="flex items-center justify-center rounded-l-xl border border-gray-200 bg-gray-100 px-3 text-sm font-bold tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-700 dark:text-slate-400">
                                +20
                            </span>
                            <input
                                name="phone"
                                type="tel"
                                required
                                value={formData.phone}
                                onChange={handleChange}
                                className="flex-1 block rounded-r-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none focus:ring-2 focus:ring-brandGold dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                                placeholder="01XXXXXXXXX"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                            <span>Password</span>
                            <span className="font-arabic" dir="rtl">كلمة المرور</span>
                        </label>
                        <div className="group relative">
                            <input
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength="6"
                                value={formData.password}
                                onChange={handlePasswordChange}
                                className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none transition-all focus:ring-2 focus:ring-brandGold ltr:pr-10 rtl:pl-10 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((currentValue) => !currentValue)}
                                className="absolute top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-brandGold ltr:right-3 rtl:left-3"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </button>
                        </div>
                        <input type="hidden" name="confirmPassword" value={formData.confirmPassword} readOnly />
                    </div>

                    <div className={`${error ? '' : 'hidden'} text-center text-[10px] italic text-red-500 md:text-xs`}>
                        {error}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl border border-brandGold/30 bg-brandBlue p-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-70 md:p-4 md:text-base"
                    >
                        Create Account | إنشاء حساب
                    </button>
                </form>

                <div className="mt-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 md:text-xs">OR</span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                </div>

                <button
                    onClick={handleGoogleSignup}
                    type="button"
                    disabled={loading}
                    className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-bold text-brandBlue shadow-sm transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700 md:px-5 md:py-4 md:text-base"
                >
                    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.766 32.653 29.201 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.651-.389-3.917z" />
                        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 19.01 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4c-7.681 0-14.344 4.327-17.694 10.691z" />
                        <path fill="#4CAF50" d="M24 44c5.128 0 9.805-1.961 13.333-5.148l-6.161-5.212C29.137 35.091 26.695 36 24 36c-5.176 0-9.73-3.331-11.284-7.946l-6.52 5.025C9.52 39.556 16.227 44 24 44z" />
                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.02 12.02 0 0 1-4.131 5.64l.002-.001 6.161 5.212C36.87 39.306 44 34 44 24c0-1.341-.138-2.651-.389-3.917z" />
                    </svg>
                    <span className="flex flex-col items-center text-center leading-tight">
                        <span>Continue with Google</span>
                        <span className="font-arabic text-xs md:text-sm" dir="rtl">المتابعة باستخدام جوجل</span>
                    </span>
                </button>

                <div className="mt-6 text-center">
                    <div className="space-y-1 text-sm text-gray-500">
                        <p>Already have an account? <span className="font-arabic" dir="rtl">لديك حساب بالفعل؟</span></p>
                        <Link href="/login" className="inline-flex items-center gap-2 font-bold text-brandBlue hover:underline dark:text-brandGold">
                            <span>Login here</span>
                            <span className="text-brandGold/70">|</span>
                            <span className="font-arabic" dir="rtl">سجل الدخول</span>
                        </Link>
                    </div>
                </div>

                <div className="mt-8 border-t border-gray-100 pt-6 text-center dark:border-gray-800">
                    <p className="mb-1 text-[10px] italic tracking-[0.2em] text-gray-400 uppercase">Premium Home Glassware</p>
                    <p className="font-arabic text-xl font-black text-[#163159] dark:text-brandGold" dir="rtl">ال عاشور عدس</p>
                </div>

                <div className="mt-6 text-center">
                    <Link href="/" className="text-xs text-gray-400 transition-colors hover:text-brandBlue">
                        ← Back to Gallery
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function Signup() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-darkBg flex items-center justify-center">Loading...</div>}>
            <SignupForm />
        </Suspense>
    );
}


