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

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
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
            sessionStorage.setItem('isAdmin', 'true');
            sessionStorage.setItem('userRole', normalizeUserRole(userData.role));
            router.push('/admin');
        } else {
            sessionStorage.removeItem('isAdmin');
            router.push(redirectParam === 'checkout' ? '/?action=checkout' : '/');
        }
    };

    return (
        <div className="bg-white dark:bg-darkBg font-sans flex items-center justify-center min-h-screen px-4 pt-12 pb-12 transition-colors duration-300">
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

            <div className="max-w-md w-full bg-white dark:bg-darkCard rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 mt-8">
                <div className="text-center mb-6 md:mb-8">
                    <Link href="/" className="inline-block group mb-4">
                        <div className="relative inline-flex items-center justify-center z-1">
                            <img src="/logo.png" alt="House Of Glass" className="h-20 md:h-24 w-auto transform transition-transform group-hover:scale-105" />
                        </div>
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-black text-brandBlue dark:text-white mt-4 tracking-tight">Join House of Glass</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Create an account for faster checkout</p>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-4 rounded-xl font-semibold mb-6 flex items-center gap-3">
                        <i className="fa-solid fa-circle-exclamation"></i> {error}
                    </div>
                )}

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Username</label>
                        <input 
                            name="username"
                            type="text" 
                            required
                            value={formData.username}
                            onChange={handleChange}
                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                            placeholder="e.g. name123" 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">First Name</label>
                            <input 
                                name="firstName"
                                type="text" 
                                required
                                value={formData.firstName}
                                onChange={handleChange}
                                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Last Name</label>
                            <input 
                                name="lastName"
                                type="text" 
                                required
                                value={formData.lastName}
                                onChange={handleChange}
                                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Email Address (Optional)</label>
                        <input 
                            name="email"
                            type="email" 
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                            placeholder="example@mail.com" 
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Phone Number (Required)</label>
                        <div className="flex group">
                            <span className="inline-flex items-center justify-center bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-l-xl px-3 text-sm text-gray-500 dark:text-gray-400 font-bold tracking-wider">+20</span>
                            <input 
                                name="phone"
                                type="tel" 
                                required
                                value={formData.phone}
                                onChange={handleChange}
                                className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-r-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium text-gray-900 dark:text-white" 
                                placeholder="01xxxxxxxxx" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Password</label>
                            <input 
                                name="password"
                                type="password" 
                                required
                                minLength="6"
                                value={formData.password}
                                onChange={handleChange}
                                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                                placeholder="Min. 6 chars" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Confirm</label>
                            <input 
                                name="confirmPassword"
                                type="password" 
                                required
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                                placeholder="Match password" 
                            />
                        </div>
                    </div>
                    
                    <button type="submit" className="w-full bg-brandGold hover:bg-brandBlue text-white font-bold rounded-xl px-4 py-4 mt-2 transition-all transform hover:-translate-y-0.5 shadow-lg shadow-brandGold/30">
                        Create Account
                    </button>
                </form>

                <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                        <span className="bg-white dark:bg-darkCard px-4 text-gray-500 font-semibold uppercase tracking-wider">Or register with</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <button onClick={handleGoogleSignup} type="button" className="flex items-center justify-center gap-3 w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 hover:border-brandGold dark:hover:border-brandGold text-gray-700 dark:text-gray-300 font-bold rounded-xl px-4 py-3.5 transition-all">
                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                        Google Sign Up
                    </button>
                </div>

                <p className="mt-8 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Already have an account? <Link href="/login" className="text-brandGold hover:text-brandBlue dark:hover:text-white transition-colors">Sign in</Link>
                </p>
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


