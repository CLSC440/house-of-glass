'use client';
import Link from 'next/link';

export default function DataDeletion() {
    return (
        <div className="flex-1 flex flex-col items-center min-h-screen px-4 py-10 w-full relative">
            <div className="max-w-3xl w-full bg-white dark:bg-darkCard rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-6 md:p-12">
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block group mb-4">
                        <div className="rounded-lg">
                            <img src="/logo.png" alt="Logo" className="h-16 md:h-24 mx-auto transition-transform group-hover:scale-105" />
                        </div>
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-bold text-brandBlue dark:text-brandGold italic mb-2">Data Deletion Instructions</h1>
                </div>
                
                <div className="space-y-6 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                    <p className="font-medium text-lg text-brandBlue dark:text-brandGold">To delete your account and all associated personal data:</p>
                    <ol className="list-decimal list-inside space-y-4 ml-4">
                        <li>Log in to your account.</li>
                        <li>Open the user menu from the top right navigation.</li>
                        <li>Select <strong>Settings</strong> to open your account settings.</li>
                        <li>Scroll to the bottom of the settings screen.</li>
                        <li>Click on the <strong>Delete Account</strong> button.</li>
                        <li>Confirm your choice when prompted.</li>
                    </ol>
                    <p className="mt-6 text-sm">Alternatively, you can email us at <a href="mailto:support@houseofglass.app" className="text-brandGold font-bold underline">support@houseofglass.app</a> from the email address associated with your account, and we will process the deletion for you.</p>
                </div>
                
                <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
                    <Link href="/" className="text-brandGold hover:underline font-bold">← Return to Gallery</Link>
                </div>
            </div>
        </div>
    );
}