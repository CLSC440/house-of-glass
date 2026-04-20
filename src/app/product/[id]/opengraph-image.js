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
                    background: '#ffffff'
                }}
            >
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
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
                            background: '#ffffff'
                        }}
                    >
                        <img
                            src={previewImageDataUri}
                            alt={String(sharedProduct?.title || 'House Of Glass Product')}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                objectPosition: 'center center',
                                background: '#ffffff'
                            }}
                        />

                        <div
                            style={{
                                position: 'absolute',
                                top: '24px',
                                left: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '16px 24px 16px 16px',
                                borderRadius: '999px',
                                background: 'rgba(11, 16, 32, 0.92)',
                                border: '1px solid rgba(248, 214, 122, 0.32)',
                                color: '#f8fafc',
                                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.24)'
                            }}
                        >
                            <img
                                src={logoDataUri}
                                alt="House Of Glass"
                                style={{
                                    width: '92px',
                                    height: '92px',
                                    objectFit: 'contain',
                                    borderRadius: '999px',
                                    background: 'rgba(255, 255, 255, 0.12)'
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
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        letterSpacing: '0.18em',
                                        color: '#f8d67a'
                                    }}
                                >
                                    HOUSE OF GLASS
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        marginTop: '6px',
                                        fontSize: '24px',
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
                                right: '18px',
                                bottom: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '10px 16px',
                                borderRadius: '999px',
                                background: 'rgba(11, 16, 32, 0.82)',
                                color: '#f8fafc',
                                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)'
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    letterSpacing: '0.04em'
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