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
                        padding: '30px',
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
                            borderRadius: '30px',
                            border: '1px solid rgba(15, 23, 42, 0.08)',
                            background: '#ffffff',
                            boxShadow: '0 30px 70px rgba(15, 23, 42, 0.12)'
                        }}
                    >
                        <img
                            src={previewImageDataUri}
                            alt={String(sharedProduct?.title || 'House Of Glass Product')}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                background: '#ffffff'
                            }}
                        />

                        <div
                            style={{
                                position: 'absolute',
                                top: '28px',
                                left: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '14px 18px',
                                borderRadius: '999px',
                                background: 'rgba(11, 16, 32, 0.92)',
                                color: '#f8fafc',
                                boxShadow: '0 18px 36px rgba(15, 23, 42, 0.18)'
                            }}
                        >
                            <img
                                src={logoDataUri}
                                alt="House Of Glass"
                                style={{
                                    width: '72px',
                                    height: '72px',
                                    objectFit: 'contain',
                                    borderRadius: '999px'
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
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        letterSpacing: '0.24em',
                                        color: '#f8d67a'
                                    }}
                                >
                                    HOUSE OF GLASS
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        marginTop: '8px',
                                        fontSize: '22px',
                                        fontWeight: 700,
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
                                right: '28px',
                                bottom: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '14px 20px',
                                borderRadius: '18px',
                                background: 'rgba(11, 16, 32, 0.82)',
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