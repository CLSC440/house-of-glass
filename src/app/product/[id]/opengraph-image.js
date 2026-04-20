import { ImageResponse } from 'next/og';
import { cache } from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSharedProductById } from '@/lib/server/product-share';

export const alt = 'House Of Glass product share image';
export const size = {
    width: 1200,
    height: 630
};
export const contentType = 'image/png';
export const runtime = 'nodejs';

const getLogoDataUri = cache(async () => {
    const logoBuffer = await readFile(join(process.cwd(), 'public', 'logo.png'));
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
});

async function fetchImageDataUri(url = '', fallbackDataUri = '') {
    const normalizedUrl = String(url || '').trim();

    if (!normalizedUrl) {
        return fallbackDataUri;
    }

    try {
        const response = await fetch(normalizedUrl, { cache: 'force-cache' });

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${imageBuffer.toString('base64')}`;
    } catch (_error) {
        return fallbackDataUri;
    }
}

export default async function Image({ params }) {
    const { id } = await params;
    const sharedProduct = await getSharedProductById(id);
    const logoDataUri = await getLogoDataUri();
    const previewImageDataUri = await fetchImageDataUri(sharedProduct?.imageUrl || '', logoDataUri);
    const previewCode = String(sharedProduct?.shareCode || '').trim();

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    position: 'relative',
                    background: 'linear-gradient(135deg, #edf2f7 0%, #ffffff 52%, #e2e8f0 100%)'
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        inset: '0',
                        display: 'flex',
                        background: 'radial-gradient(circle at top right, rgba(212, 175, 55, 0.18), transparent 28%)'
                    }}
                />

                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        padding: '18px',
                        zIndex: '1'
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: '24px',
                            border: '1px solid rgba(15, 23, 42, 0.08)',
                            background: '#ffffff',
                            boxShadow: '0 24px 54px rgba(15, 23, 42, 0.12)'
                        }}
                    >
                        <img
                            src={previewImageDataUri}
                            alt={String(sharedProduct?.title || 'House Of Glass Product')}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center center',
                                background: '#ffffff'
                            }}
                        />

                        <div
                            style={{
                                position: 'absolute',
                                inset: '0',
                                display: 'flex',
                                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.04) 0%, transparent 24%, transparent 76%, rgba(15, 23, 42, 0.05) 100%)'
                            }}
                        />

                        <div
                            style={{
                                position: 'absolute',
                                top: '20px',
                                left: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px 18px 12px 12px',
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, rgba(11, 16, 32, 0.96), rgba(30, 41, 59, 0.92))',
                                border: '1px solid rgba(248, 214, 122, 0.34)',
                                color: '#f8fafc',
                                boxShadow: '0 18px 36px rgba(15, 23, 42, 0.22)'
                            }}
                        >
                            <img
                                src={logoDataUri}
                                alt="House Of Glass"
                                style={{
                                    width: '86px',
                                    height: '86px',
                                    objectFit: 'contain',
                                    borderRadius: '999px',
                                    background: 'rgba(255, 255, 255, 0.08)'
                                }}
                            />
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    marginLeft: '16px'
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: '17px',
                                        fontWeight: 700,
                                        letterSpacing: '0.2em',
                                        color: '#f8d67a'
                                    }}
                                >
                                    HOUSE OF GLASS
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        marginTop: '8px',
                                        fontSize: '24px',
                                        fontWeight: 600,
                                        color: '#f8fafc'
                                    }}
                                >
                                    hg-alshour.online
                                </div>
                            </div>
                        </div>

                        <div
                            style={{
                                position: 'absolute',
                                right: '20px',
                                bottom: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '14px 20px',
                                borderRadius: '20px',
                                background: 'rgba(11, 16, 32, 0.86)',
                                color: '#f8fafc',
                                boxShadow: '0 18px 36px rgba(15, 23, 42, 0.22)'
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: '24px',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em'
                                }}
                            >
                                {previewCode ? `CODE ${previewCode}` : 'HOUSE OF GLASS'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ),
        size
    );
}