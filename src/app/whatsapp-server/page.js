'use client';
import Link from 'next/link';

export default function WhatsappServer() {
    return (
        <div className="flex-1 flex flex-col items-center min-h-screen px-4 py-10 w-full relative">
            <div className="max-w-2xl w-full bg-white dark:bg-darkCard rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6 md:p-10">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-brandBlue dark:text-brandGold">WhatsApp Proxy Interface</h1>
                </div>
                <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-center">
                    <div className="inline-block w-4 h-4 bg-green-500 rounded-full animate-pulse mb-3"></div>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Autorecovery WhatsApp Node active.</p>
                </div>
                <div className="mt-8 text-center text-sm font-bold">
                    <Link href="/admin" className="text-brandGold hover:underline">Return to Admin Dashboard</Link>
                </div>
            </div>
        </div>
    );
}