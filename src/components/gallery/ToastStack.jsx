'use client';
import { useGallery } from '@/contexts/GalleryContext';

export default function ToastStack() {
    const { toast, dismissToast } = useGallery();

    if (!toast) return null;

    const isError = toast.type === 'error';

    return (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[160] -translate-x-1/2 px-4">
            <button
                type="button"
                onClick={dismissToast}
                className={[
                    'pointer-events-auto flex min-w-[280px] items-center gap-3 rounded-[1.4rem] border px-5 py-4 text-right shadow-2xl backdrop-blur-xl transition-all',
                    isError
                        ? 'border-red-400/20 bg-red-500/90 text-white'
                        : 'border-brandGold/30 bg-brandGold/95 text-brandBlue'
                ].join(' ')}
            >
                <span className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    isError ? 'bg-white/15' : 'bg-brandBlue/10'
                ].join(' ')}>
                    <i className={isError ? 'fa-solid fa-xmark' : 'fa-solid fa-check'}></i>
                </span>
                <span className="flex-1 text-sm font-black tracking-wide">{toast.message}</span>
            </button>
        </div>
    );
}