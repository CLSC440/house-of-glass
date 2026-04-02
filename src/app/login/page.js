'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import Link from 'next/link';
import { resolveLoginIdentifier, upsertCurrentUserProfile } from '@/lib/account-api';
import { isAdminRole, normalizeUserRole } from '@/lib/user-roles';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
            await upsertCurrentUserProfile(result.user, {
                name: result.user.displayName || '',
                email: result.user.email || '',
                photoURL: result.user.photoURL || ''
            }, { autoGenerateUsername: true });
            await checkRoleAndRedirect(result.user.uid);
        } catch (err) {
            console.error(err);
            setError('Google sign in failed!');
            setLoading(false);
        }
    };

    const checkRoleAndRedirect = async (uid) => {
        try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            const redirectParam = searchParams.get('redirect');
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const normalizedRole = normalizeUserRole(userData.role);
                if (isAdminRole(normalizedRole)) {
                    sessionStorage.setItem('isAdmin', 'true');
                    sessionStorage.setItem('userRole', normalizedRole);
                    router.push('/admin');
                    return;
                }
            }
            
            sessionStorage.removeItem('isAdmin');
            router.push(redirectParam === 'checkout' ? '/?action=checkout' : '/');
        } catch (err) {
            console.error('Error fetching user role:', err);
            router.push('/');
        }
    };

    return (
        <div className="bg-white dark:bg-darkBg font-sans flex items-center justify-center min-h-screen px-4 transition-colors duration-300">
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

            <div className="max-w-md w-full bg-white dark:bg-darkCard rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-6 md:p-8">
                <div className="text-center mb-6 md:mb-8">
                    <Link href="/" className="inline-block group mb-4">
                        <div className="relative inline-flex items-center justify-center z-1">
                            <img src="/logo.png" alt="House Of Glass" className="h-20 md:h-24 w-auto transform transition-transform group-hover:scale-105" />
                        </div>
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-black text-brandBlue dark:text-white mt-4 tracking-tight">Welcome Back</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Sign in to continue to House Of Glass</p>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-4 rounded-xl font-semibold mb-6 flex items-center gap-3">
                        <i className="fa-solid fa-circle-exclamation"></i> {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Email, Phone, or Username</label>
                        <input 
                            type="text" 
                            required
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                            placeholder="Email, phone, or username" 
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Password</label>
                            <Link href="/reset-password" className="text-xs font-bold text-brandGold hover:text-brandBlue dark:hover:text-white transition-colors">Forgot Password?</Link>
                        </div>
                        <input 
                            type="password" 
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                            placeholder="Enter your password" 
                        />
                    </div>
                    
                    <button type="submit" className="w-full bg-brandGold hover:bg-brandBlue text-white font-bold rounded-xl px-4 py-4 transition-all transform hover:-translate-y-0.5 shadow-lg shadow-brandGold/30">
                        Sign In
                    </button>
                </form>

                <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                        <span className="bg-white dark:bg-darkCard px-4 text-gray-500 font-semibold uppercase tracking-wider">Or continue with</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <button onClick={handleGoogleLogin} type="button" className="flex items-center justify-center gap-3 w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 hover:border-brandGold dark:hover:border-brandGold text-gray-700 dark:text-gray-300 font-bold rounded-xl px-4 py-3.5 transition-all">
                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                        Google
                    </button>
                </div>

                <p className="mt-8 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Don&apos;t have an account? <Link href="/signup" className="text-brandGold hover:text-brandBlue dark:hover:text-white transition-colors">Sign up now</Link>
                </p>
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
