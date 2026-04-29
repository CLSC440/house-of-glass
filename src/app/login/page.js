'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import Link from 'next/link';
import { resolveLoginIdentifier, upsertCurrentUserProfile } from '@/lib/account-api';
import { canAccessAdminArea, getRoleDefinition, normalizeUserRole, SYSTEM_ROLE_DEFINITIONS } from '@/lib/user-roles';

function LoginForm() {
    const markNotificationPromptPending = () => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('hog_prompt_notifications_after_login', '1');
        }
    };

    const router = useRouter();
    const searchParams = useSearchParams();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const resolveRoleAccess = async (role) => {
        const normalizedRole = normalizeUserRole(role);

        if (SYSTEM_ROLE_DEFINITIONS[normalizedRole]) {
            return {
                normalizedRole,
                canAccessAdmin: canAccessAdminArea(normalizedRole),
                permissions: getRoleDefinition(normalizedRole).permissions
            };
        }

        const roleSnap = await getDoc(doc(db, 'roles', normalizedRole));
        const roleDefinitions = roleSnap.exists() ? [{ key: roleSnap.id, ...roleSnap.data() }] : [];
        return {
            normalizedRole,
            canAccessAdmin: canAccessAdminArea(normalizedRole, roleDefinitions),
            permissions: getRoleDefinition(normalizedRole, roleDefinitions).permissions
        };
    };

    const resolvePostAuthRoute = () => {
        const redirectParam = searchParams.get('redirect');
        const checkoutType = String(searchParams.get('type') || '').trim().toLowerCase();

        if (redirectParam === 'checkout') {
            return checkoutType === 'wholesale' ? '/checkout?type=wholesale' : '/checkout';
        }

        return '/';
    };

    const formatGoogleAuthError = (err) => {
        const errorCode = String(err?.code || '').trim().toLowerCase();
        const errorMessage = String(err?.message || '').trim();

        if (errorCode === 'auth/popup-closed-by-user') {
            return 'Google sign-in was cancelled before completion.';
        }

        if (errorCode === 'auth/popup-blocked') {
            return 'The browser blocked the Google sign-in popup. Allow popups and try again.';
        }

        if (errorCode === 'auth/cancelled-popup-request') {
            return 'Google sign-in was interrupted. Please try again.';
        }

        if (errorCode === 'auth/unauthorized-domain') {
            return 'This website domain is not authorized for Google sign-in in Firebase yet.';
        }

        if (errorMessage) {
            return `Google sign-in failed: ${errorMessage}`;
        }

        return 'Google sign-in failed!';
    };

    useEffect(() => {
        const redirectParam = searchParams.get('redirect');
        if (!redirectParam) return;
    }, [searchParams]);

    const normalizeEgyptPhoneForLogin = (value) => {
        const rawValue = String(value || '').trim();
        const digits = rawValue.replace(/\D/g, '');

        if (/^01[0125]\d{8}$/.test(digits)) return `+20${digits.slice(1)}`;
        if (/^1[0125]\d{8}$/.test(digits)) return `+20${digits}`;
        if (/^20\d{10}$/.test(digits)) return `+${digits}`;
        if (/^\+20\d{10}$/.test(rawValue)) return rawValue;

        return '';
    };

    const buildPhoneCredentialEmail = (phone) => {
        const digits = String(phone || '').replace(/\D/g, '');
        return digits ? `phone${digits}@users.houseofglass.app` : '';
    };

    const resolveIdentifierFromLoginLookup = async (rawIdentifier) => {
        const trimmedIdentifier = String(rawIdentifier || '').trim();
        if (!trimmedIdentifier) return '';

        const normalizedIdentifier = trimmedIdentifier.toLowerCase();
        const normalizedPhone = normalizeEgyptPhoneForLogin(trimmedIdentifier);
        const lookupDocIds = [];

        if (trimmedIdentifier.includes('@')) {
            lookupDocIds.push(`email:${normalizedIdentifier}`);
        }

        lookupDocIds.push(`username:${normalizedIdentifier.replace(/\s+/g, '')}`);

        if (normalizedPhone) {
            lookupDocIds.push(`phone:${normalizedPhone}`);
        }

        for (const lookupDocId of Array.from(new Set(lookupDocIds))) {
            const lookupSnap = await getDoc(doc(db, 'login_lookup', lookupDocId));
            if (lookupSnap.exists()) {
                return String(lookupSnap.data()?.authEmail || '').trim().toLowerCase();
            }
        }

        return '';
    };

    const buildLoginCandidates = async (rawIdentifier) => {
        const trimmedIdentifier = String(rawIdentifier || '').trim();
        const normalizedIdentifier = trimmedIdentifier.toLowerCase();
        const candidates = [];

        if (!trimmedIdentifier) return candidates;

        if (trimmedIdentifier.includes('@')) {
            candidates.push(normalizedIdentifier);
        }

        try {
            const resolvedEmail = await resolveLoginIdentifier(trimmedIdentifier);
            if (resolvedEmail) {
                candidates.unshift(String(resolvedEmail).trim().toLowerCase());
            }
        } catch (error) {
            console.warn('Identifier resolution fallback triggered:', error);
        }

        try {
            const lookupResolvedEmail = await resolveIdentifierFromLoginLookup(trimmedIdentifier);
            if (lookupResolvedEmail) {
                candidates.unshift(lookupResolvedEmail);
            }
        } catch (error) {
            console.warn('Login lookup fallback triggered:', error);
        }

        const normalizedPhone = normalizeEgyptPhoneForLogin(trimmedIdentifier);
        if (normalizedPhone) {
            const phoneCredentialEmail = buildPhoneCredentialEmail(normalizedPhone);
            if (phoneCredentialEmail) {
                candidates.push(phoneCredentialEmail.toLowerCase());
            }
        }

        if (candidates.length === 0) {
            candidates.push(normalizedIdentifier);
        }

        return Array.from(new Set(candidates.filter(Boolean)));
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const loginCandidates = await buildLoginCandidates(identifier);
            let authenticatedUser = null;
            let lastError = null;

            for (const candidate of loginCandidates) {
                try {
                    authenticatedUser = await signInWithEmailAndPassword(auth, candidate, password);
                    break;
                } catch (error) {
                    lastError = error;
                }
            }

            if (!authenticatedUser) {
                throw lastError || new Error('Invalid credentials or password!');
            }

            await checkRoleAndRedirect(authenticatedUser.user.uid);
        } catch (err) {
            console.error(err);
            setError('Invalid credentials or password!');
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const userRef = doc(db, 'users', result.user.uid);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                await upsertCurrentUserProfile(result.user, {
                    name: result.user.displayName || 'Google User',
                    email: result.user.email || '',
                    phone: result.user.phoneNumber || '',
                    photoURL: result.user.photoURL || ''
                }, { autoGenerateUsername: true });
            }

            await checkRoleAndRedirect(result.user.uid);
        } catch (err) {
            console.error(err);
            setError(formatGoogleAuthError(err));
            setLoading(false);
        }
    };

    const checkRoleAndRedirect = async (uid) => {
        try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const roleAccess = await resolveRoleAccess(userData.role);
                if (roleAccess.canAccessAdmin) {
                    markNotificationPromptPending();
                    sessionStorage.setItem('isAdmin', 'true');
                    sessionStorage.setItem('userRole', roleAccess.normalizedRole);
                    sessionStorage.setItem('userPermissions', JSON.stringify(roleAccess.permissions));
                    router.push('/admin');
                    return;
                }
            }
            
            markNotificationPromptPending();
            sessionStorage.removeItem('isAdmin');
            sessionStorage.removeItem('userPermissions');
            router.push(resolvePostAuthRoute());
        } catch (err) {
            console.error('Error fetching user role:', err);
            router.push('/');
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
                            <p className="mt-6 text-[10px] font-black uppercase text-brandGold tracking-[0.5em] animate-pulse">Processing</p>
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
                        <h1 className="text-xl font-bold italic text-brandBlue dark:text-brandGold md:text-2xl">Welcome Back</h1>
                        <p className="font-arabic text-sm font-bold text-brandBlue dark:text-brandGold md:text-base" dir="rtl">مرحباً بعودتك</p>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-slate-400 md:text-sm">
                        <p>Login to your account</p>
                        <p className="font-arabic" dir="rtl">سجل الدخول إلى حسابك</p>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                            <span>Email, Phone, or Username</span>
                            <span className="font-arabic" dir="rtl">البريد أو الهاتف أو اسم المستخدم</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-brandBlue outline-none focus:ring-2 focus:ring-brandGold dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 md:p-3"
                            placeholder="e.g. user123, 010..., or email@example.com"
                        />
                    </div>

                    <div>
                        <label className="mb-2 flex items-center justify-between text-xs font-medium text-gray-700 dark:text-slate-300 md:text-sm">
                            <span>Password</span>
                            <span className="font-arabic" dir="rtl">كلمة المرور</span>
                        </label>
                        <div className="group relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
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
                        <div className="mt-1 text-right">
                            <Link href="/reset-password" className="inline-flex items-center gap-2 text-[10px] text-brandGold hover:underline">
                                <span>Forgot Password?</span>
                                <span className="font-arabic" dir="rtl">نسيت كلمة المرور؟</span>
                            </Link>
                        </div>
                    </div>

                    <div className={`${error ? '' : 'hidden'} text-center text-[10px] italic text-red-500 md:text-xs`}>
                        {error}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl border-2 border-brandGold/35 bg-brandBlue p-3.5 text-sm font-bold text-white transition-all hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-70 md:p-4 md:text-base"
                    >
                        Login | دخول
                    </button>
                </form>

                <div className="mt-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 md:text-xs">OR</span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                </div>

                <button
                    onClick={handleGoogleLogin}
                    type="button"
                    disabled={loading}
                    className="mt-5 flex w-full touch-manipulation items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-bold text-brandBlue shadow-sm transition-all active:scale-[0.99] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700 md:px-5 md:py-4 md:text-base"
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
                        <p>Don&apos;t have an account? <span className="font-arabic" dir="rtl">ليس لديك حساب؟</span></p>
                        <Link href="/signup" className="inline-flex items-center gap-2 font-bold text-brandBlue hover:underline dark:text-brandGold">
                            <span>Create one</span>
                            <span className="text-brandGold/70">|</span>
                            <span className="font-arabic" dir="rtl">أنشئ حسابًا</span>
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

export default function Login() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-darkBg flex items-center justify-center">Loading...</div>}>
            <LoginForm />
        </Suspense>
    );
}
