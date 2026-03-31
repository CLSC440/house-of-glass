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

    const handleReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            await sendPasswordResetEmail(auth, email);
            setMessage('Password reset link sent! Check your email inbox.');
            setEmail('');
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/user-not-found') {
                setError('No user found with this email address.');
            } else {
                setError('Failed to send reset email. Please try again.');
            }
        }
        setLoading(false);
    };

    return (
        <div className="bg-white dark:bg-darkBg font-sans flex items-center justify-center min-h-screen px-4 transition-colors duration-300">
            <div className="max-w-md w-full bg-white dark:bg-darkCard rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-6 md:p-8">
                <div className="text-center mb-6 md:mb-8">
                    <Link href="/" className="inline-block group mb-4">
                        <div className="relative inline-flex items-center justify-center z-1">
                            <img src="/logo.png" alt="House Of Glass" className="h-20 md:h-24 w-auto transform transition-transform group-hover:scale-105" />
                        </div>
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-black text-brandBlue dark:text-white mt-4 tracking-tight">Reset Password</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Enter your email to receive a reset link</p>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-4 rounded-xl font-semibold mb-6 flex items-center gap-3">
                        <i className="fa-solid fa-circle-exclamation"></i> {error}
                    </div>
                )}
                {message && (
                    <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm p-4 rounded-xl font-semibold mb-6 flex items-center gap-3">
                        <i className="fa-solid fa-circle-check"></i> {message}
                    </div>
                )}

                <form onSubmit={handleReset} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Email Address</label>
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brandGold focus:border-transparent transition-all font-medium" 
                            placeholder="Enter your email" 
                        />
                    </div>
                    
                    <button type="submit" disabled={loading} className={'w-full font-bold rounded-xl px-4 py-4 transition-all transform hover:-translate-y-0.5 shadow-lg shadow-brandGold/30 ' + (loading ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-brandGold hover:bg-brandBlue text-white')}>
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                </form>

                <p className="mt-8 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Remember your password? <Link href="/login" className="text-brandGold hover:text-brandBlue dark:hover:text-white transition-colors">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
