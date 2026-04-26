'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSiteSettings } from '@/lib/use-site-settings';

function formatPhoneLabel(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.startsWith('+')) {
        return normalized;
    }

    return `+${normalized}`;
}

export default function Footer() {
    const { derivedSettings } = useSiteSettings();
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);

    useEffect(() => {
        if (!isCallModalOpen) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsCallModalOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isCallModalOpen]);

    return (
        <>
            <footer className="bg-white dark:bg-darkCard border-t border-brandGold/20 pt-24 pb-12">
                <div className="max-w-7xl mx-auto px-4 text-center">
                <div className="mb-16 flex flex-col items-center">
                    <button
                        type="button"
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="shine-effect"
                        aria-label="Scroll to top"
                    >
                        <img src="/logo.png" alt="Logo" className="h-32 md:h-48 transition-all cursor-pointer relative z-10" />
                    </button>

                    <p className="text-[10px] md:text-xs font-black tracking-[0.4em] uppercase opacity-40 dark:text-brandGold dark:opacity-80 mb-8">
                        Powered By
                    </p>

                    <div className="mb-6 grid w-full max-w-2xl grid-cols-[minmax(24px,1fr)_auto_minmax(24px,1fr)] items-center gap-4 md:gap-8">
                        <div className="h-px w-full bg-gradient-to-l from-brandGold/40 to-transparent"></div>
                        <p className="justify-self-center text-center text-2xl md:text-3xl font-black text-brandBlue dark:text-brandGold font-arabic tracking-tight" dir="rtl">
                            ال عاشور عدس
                        </p>
                        <div className="h-px w-full bg-gradient-to-r from-brandGold/40 to-transparent"></div>
                    </div>

                    <p className="text-brandBlue dark:text-brandGold/80 text-[10px] md:text-xs font-black tracking-[0.3em] uppercase opacity-70 mb-10">
                        Premium Home Glassware
                    </p>

                    <div className="flex items-center justify-center gap-8 mb-12 text-gray-400">
                        {derivedSettings.phoneNumbers.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setIsCallModalOpen(true)}
                                className="hover:text-brandGold transition-colors"
                                aria-label="Call us"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.11.37 2.3.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.06 21 3 13.94 3 5a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.28.19 2.47.57 3.58a1 1 0 0 1-.25 1.01l-2.19 2.2Z" />
                                </svg>
                            </button>
                        ) : null}
                        <a href={derivedSettings.whatsappUrl} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors" aria-label="WhatsApp">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                        </a>
                        <a href={derivedSettings.facebookUrl} target="_blank" rel="noreferrer" className="hover:text-brandGold transition-colors" aria-label="Facebook">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                        </a>
                        <a href={derivedSettings.mapsUrl} target="_blank" rel="noreferrer" className="hover:text-brandGold transition-colors" aria-label="Location">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" /></svg>
                        </a>
                    </div>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center text-gray-400 text-[10px] md:text-xs gap-4 md:gap-6">
                    <p>© 2026 Al Ashour Ades. All rights reserved.</p>
                    <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
                        <div className="flex items-center gap-4 text-[10px] md:text-xs">
                            <Link href="/info" className="hover:text-brandGold transition-colors">Info</Link>
                            <Link href="/privacy-policy" className="hover:text-brandGold transition-colors">Privacy Policy</Link>
                            <Link href="/data-deletion" className="hover:text-brandGold transition-colors">Data Deletion</Link>
                        </div>
                        <div className="flex flex-col items-center gap-2 md:flex-row md:gap-6">
                            <span>Sat - Thu: 10AM - 10PM</span>
                            <span className="text-brandGold font-bold tracking-widest uppercase">Premium Home Glassware</span>
                        </div>
                    </div>
                </div>
                </div>
            </footer>

            {isCallModalOpen ? (
                <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 px-4 py-4 backdrop-blur-sm" onClick={() => setIsCallModalOpen(false)}>
                    <div
                        className="relative z-[150] mx-auto w-11/12 max-w-xs overflow-hidden rounded-3xl border border-brandGold/20 bg-white shadow-2xl dark:bg-darkCard"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="p-6 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brandGold/10">
                                <svg className="h-8 w-8 text-brandGold" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 0 1 2-2h3.28a1 1 0 0 1 .948.684l1.498 4.493a1 1 0 0 1-.502 1.21l-2.257 1.13a11.042 11.042 0 0 0 5.516 5.516l1.13-2.257a1 1 0 0 1 1.21-.502l4.493 1.498A1 1 0 0 1 21 16.28V19a2 2 0 0 1-2 2h-1C9.716 21 3 14.284 3 6V5Z" />
                                </svg>
                            </div>

                            <h3 className="mb-6 text-xl font-black uppercase italic text-brandBlue dark:text-brandGold">Contact Us</h3>

                            <div className="space-y-3">
                            {derivedSettings.phoneNumbers.map((phoneEntry) => (
                                <a
                                    key={phoneEntry.digits}
                                    href={`tel:${phoneEntry.digits}`}
                                    className="group flex items-center justify-between rounded-2xl border border-transparent bg-gray-50 p-4 text-left transition-all hover:border-brandGold/30 hover:bg-brandGold/10 dark:bg-gray-800"
                                >
                                    <span className="text-sm font-bold text-brandBlue dark:text-white">{formatPhoneLabel(phoneEntry.raw)}</span>
                                    <svg className="h-5 w-5 text-brandGold transition-transform group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 0 1 2-2h3.28a1 1 0 0 1 .948.684l1.498 4.493a1 1 0 0 1-.502 1.21l-2.257 1.13a11.042 11.042 0 0 0 5.516 5.516l1.13-2.257a1 1 0 0 1 1.21-.502l4.493 1.498A1 1 0 0 1 21 16.28V19a2 2 0 0 1-2 2h-1C9.716 21 3 14.284 3 6V5Z" />
                                    </svg>
                                </a>
                            ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsCallModalOpen(false)}
                                className="mt-8 text-xs font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-red-500"
                            >
                                Cancel | إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}