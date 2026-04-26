'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
    IconArrowUpRight,
    IconBrandFacebook,
    IconBrandInstagram,
    IconBrandTiktok,
    IconBrandWhatsapp,
    IconMapPin,
    IconMessageCircle,
    IconPhoneCall,
    IconWorldWww
} from '@tabler/icons-react';
import { useSiteSettings } from '@/lib/use-site-settings';

function orderInfoCards(cards, orderedIds = []) {
    const positionMap = new Map(orderedIds.map((id, index) => [id, index]));

    return [...cards].sort((leftCard, rightCard) => {
        const leftIndex = positionMap.has(leftCard.id) ? positionMap.get(leftCard.id) : Number.MAX_SAFE_INTEGER;
        const rightIndex = positionMap.has(rightCard.id) ? positionMap.get(rightCard.id) : Number.MAX_SAFE_INTEGER;

        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return 0;
    });
}

function formatPhoneLabel(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

function simplifyUrl(value) {
    return String(value || '')
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');
}

export default function InfoPage() {
    const { derivedSettings, isLoading } = useSiteSettings();
    const cardsSectionRef = useRef(null);

    useEffect(() => {
        let firstFrameId = 0;
        let secondFrameId = 0;

        firstFrameId = window.requestAnimationFrame(() => {
            secondFrameId = window.requestAnimationFrame(() => {
                cardsSectionRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            });
        });

        return () => {
            window.cancelAnimationFrame(firstFrameId);
            window.cancelAnimationFrame(secondFrameId);
        };
    }, []);

    const socialCards = orderInfoCards([
        {
            id: 'website',
            title: 'Website',
            description: 'اتفرج على الموقع والمتجر كامل.',
            href: derivedSettings.websiteUrl,
            value: simplifyUrl(derivedSettings.websiteUrl),
            icon: <IconWorldWww className="h-6 w-6" />,
            accentClassName: 'from-[#1d4ed8]/30 via-[#1d4ed8]/10 to-transparent'
        },
        {
            id: 'whatsapp',
            title: 'WhatsApp',
            description: 'راسلنا بسرعة على الواتساب.',
            href: derivedSettings.whatsappUrl,
            value: formatPhoneLabel(derivedSettings.whatsappNumber),
            icon: <IconBrandWhatsapp className="h-6 w-6" />,
            accentClassName: 'from-[#25D366]/30 via-[#25D366]/10 to-transparent'
        },
        {
            id: 'phone',
            title: 'Call Us',
            description: 'كلمنا مباشرة على أرقامنا الحالية.',
            href: derivedSettings.phoneUrl,
            value: derivedSettings.primaryPhone ? formatPhoneLabel(derivedSettings.primaryPhone) : 'Phone line',
            icon: <IconPhoneCall className="h-6 w-6" />,
            accentClassName: 'from-[#f59e0b]/30 via-[#f59e0b]/10 to-transparent'
        },
        {
            id: 'facebook',
            title: 'Facebook',
            description: 'تابع أحدث العروض والمنشورات.',
            href: derivedSettings.facebookUrl,
            value: simplifyUrl(derivedSettings.facebookUrl),
            icon: <IconBrandFacebook className="h-6 w-6" />,
            accentClassName: 'from-[#2563eb]/30 via-[#2563eb]/10 to-transparent'
        },
        {
            id: 'instagram',
            title: 'Instagram',
            description: 'شوف الصور والستايل اليومي.',
            href: derivedSettings.instagramUrl,
            value: simplifyUrl(derivedSettings.instagramUrl),
            icon: <IconBrandInstagram className="h-6 w-6" />,
            accentClassName: 'from-[#f43f5e]/30 via-[#f43f5e]/10 to-transparent'
        },
        {
            id: 'tiktok',
            title: 'TikTok',
            description: 'اكتشف الفيديوهات واللقطات السريعة.',
            href: derivedSettings.tiktokUrl,
            value: simplifyUrl(derivedSettings.tiktokUrl),
            icon: <IconBrandTiktok className="h-6 w-6" />,
            accentClassName: 'from-[#06b6d4]/30 via-[#06b6d4]/10 to-transparent'
        },
        {
            id: 'channel',
            title: 'WhatsApp Channel',
            description: 'تابع التحديثات والعروض على القناة.',
            href: derivedSettings.whatsappChannelUrl,
            value: simplifyUrl(derivedSettings.whatsappChannelUrl),
            icon: <IconMessageCircle className="h-6 w-6" />,
            accentClassName: 'from-[#84cc16]/30 via-[#84cc16]/10 to-transparent'
        },
        {
            id: 'maps',
            title: 'Maps',
            description: 'اعرف مكاننا ووصل لنا بسهولة.',
            href: derivedSettings.mapsUrl,
            value: simplifyUrl(derivedSettings.mapsUrl),
            icon: <IconMapPin className="h-6 w-6" />,
            accentClassName: 'from-[#f97316]/30 via-[#f97316]/10 to-transparent'
        }
    ], derivedSettings.infoPageCardOrder).filter((item) => Boolean(item.href));

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.18),transparent_28%),linear-gradient(180deg,#07111f_0%,#020617_100%)] text-white">
            <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10 lg:gap-8 lg:px-8 lg:py-14">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href="/" className="inline-flex items-center justify-center rounded-full border border-brandGold/35 bg-brandGold/10 px-4 py-2 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                        Back to Gallery
                    </Link>
                    <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-300 sm:self-auto">
                        <span>Info</span>
                        {isLoading ? <span className="text-brandGold">Syncing</span> : <span className="text-emerald-300">Live</span>}
                    </div>
                </div>

                <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.96),rgba(10,15,29,0.92))] shadow-[0_28px_70px_rgba(2,6,23,0.45)]">
                    <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                        <div className="px-5 py-6 md:px-8 md:py-8 lg:px-10 lg:py-10">
                            <p className="text-[11px] font-black uppercase tracking-[0.34em] text-brandGold/75">Reach House Of Glass</p>
                            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-white md:text-5xl">{derivedSettings.infoPageTitle}</h1>
                            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base md:leading-8">{derivedSettings.infoPageDescription}</p>

                            <div className="mt-6 flex flex-wrap gap-3">
                                {socialCards.slice(0, 3).map((item) => (
                                    <a
                                        key={item.id}
                                        href={item.href}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-slate-100 transition-colors hover:border-brandGold/35 hover:text-brandGold"
                                    >
                                        <span>{item.title}</span>
                                        <IconArrowUpRight className="h-4 w-4" />
                                    </a>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-white/10 bg-[linear-gradient(180deg,rgba(212,175,55,0.08),rgba(255,255,255,0.03))] px-5 py-6 md:px-8 md:py-8 lg:border-l lg:border-t-0 lg:px-8 lg:py-10">
                            <div className="rounded-[1.6rem] border border-white/10 bg-[#0b1324]/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <p className="text-[11px] font-black uppercase tracking-[0.26em] text-brandGold/80">Quick Contact</p>
                                <div className="mt-5 flex items-center gap-4">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-brandGold/20 bg-brandGold/10">
                                        <Image src="/logo.png" alt="House Of Glass" width={48} height={48} className="h-12 w-12 object-contain" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-black text-white">House Of Glass</p>
                                        <p className="mt-1 text-sm leading-6 text-slate-300">{derivedSettings.infoPageNote}</p>
                                    </div>
                                </div>

                                <div className="mt-6 space-y-3">
                                    {derivedSettings.phoneNumbers.length > 0 ? derivedSettings.phoneNumbers.map((entry) => (
                                        <a
                                            key={entry.digits}
                                            href={`tel:${entry.digits}`}
                                            className="flex items-center justify-between rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:border-brandGold/30 hover:bg-brandGold/10"
                                        >
                                            <div>
                                                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Phone</p>
                                                <p className="mt-1 text-sm font-bold text-white">{formatPhoneLabel(entry.raw)}</p>
                                            </div>
                                            <IconPhoneCall className="h-5 w-5 text-brandGold" />
                                        </a>
                                    )) : (
                                        <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                                            Add a phone number from admin settings to show it here.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section ref={cardsSectionRef} className="grid scroll-mt-6 gap-4 md:grid-cols-2 md:scroll-mt-8 xl:grid-cols-4">
                    {socialCards.map((item) => (
                        <a
                            key={item.id}
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(10,15,29,0.96))] p-5 shadow-[0_20px_36px_rgba(2,6,23,0.24)] transition-transform duration-200 hover:-translate-y-1 hover:border-brandGold/30"
                        >
                            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.accentClassName} opacity-100 transition-opacity duration-200 group-hover:opacity-100`}></div>
                            <div className="relative flex h-full flex-col">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-brandGold">
                                        {item.icon}
                                    </div>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition-colors group-hover:text-brandGold">
                                        <IconArrowUpRight className="h-4 w-4" />
                                    </div>
                                </div>

                                <div className="mt-8 flex-1">
                                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Contact Channel</p>
                                    <h2 className="mt-2 text-2xl font-black text-white">{item.title}</h2>
                                    <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
                                </div>

                                <div className="mt-6 border-t border-white/10 pt-4">
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-brandGold/80">Link</p>
                                    <p className="mt-2 break-all text-sm font-semibold text-slate-100">{item.value}</p>
                                </div>
                            </div>
                        </a>
                    ))}
                </section>
            </main>
        </div>
    );
}