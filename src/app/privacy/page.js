'use client';
import Link from 'next/link';

export default function PrivacyPolicy() {
    return (
        <div className="flex-1 flex flex-col items-center min-h-screen px-4 py-10 w-full relative">
            <div className="max-w-3xl w-full bg-white dark:bg-darkCard rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-6 md:p-12">
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block group mb-4">
                        <div className="rounded-lg">
                            <img src="/logo.png" alt="Logo" className="h-16 md:h-24 mx-auto transition-transform group-hover:scale-105" />
                        </div>
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-bold text-brandBlue dark:text-brandGold italic mb-2">Privacy Policy</h1>
                    <p className="text-gray-500">Effective Date: {new Date().toLocaleDateString()}</p>
                </div>
                
                <div className="space-y-6 text-gray-700 dark:text-gray-300">
                    <section>
                        <h2 className="text-xl font-bold text-brandBlue dark:text-white mb-3">1. Information We Collect</h2>
                        <p>We collect information that you provide directly to us when you create an account or make a purchase, including your name, email address, phone number, and shipping details.</p>
                    </section>
                    
                    <section>
                        <h2 className="text-xl font-bold text-brandBlue dark:text-white mb-3">2. How We Use Information</h2>
                        <p>We use the information we collect to securely process your orders, provide customer support, and improve our services.</p>
                    </section>
                    
                    <section>
                        <h2 className="text-xl font-bold text-brandBlue dark:text-white mb-3">3. Data Protection</h2>
                        <p>We use standard security measures to protect your personal data. Authentication is handled securely via Firebase Auth, and sensitive payment information is not stored on our servers.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brandBlue dark:text-white mb-3">4. Your Rights</h2>
                        <p>You have the right to request access to your data or request data deletion by contacting our support team or using the <Link href="/data-deletion" className="text-brandGold hover:underline">Data Deletion</Link> page.</p>
                    </section>
                </div>
                
                <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
                    <Link href="/" className="text-brandGold hover:underline font-bold">← Return to Gallery</Link>
                </div>
            </div>
        </div>
    );
}