import { ImageResponse } from 'next/og';
import { getSharedProductById } from '@/lib/server/product-share';

export const alt = 'House Of Glass product share card';
export const size = {
    width: 1200,
    height: 630
};
export const contentType = 'image/png';

function truncateLabel(value = '', maxLength = 64) {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue.length <= maxLength) {
        return normalizedValue;
    }

    return `${normalizedValue.slice(0, maxLength - 1).trim()}…`;
}

export default async function Image({ params }) {
    const { id } = await params;
    const sharedProduct = await getSharedProductById(id);
    const previewTitle = truncateLabel(sharedProduct?.title || 'House Of Glass Product', 68);
    const previewCode = truncateLabel(sharedProduct?.shareCode || sharedProduct?.id || '', 28);
    const previewBadge = truncateLabel(sharedProduct?.brand || sharedProduct?.category || 'PRODUCT PREVIEW', 28).toUpperCase();
    const previewImage = sharedProduct?.imageUrl || 'https://www.hg-alshour.online/logo.png';

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    padding: '36px',
                    background: 'linear-gradient(135deg, #07111f 0%, #0f1d33 54%, #132844 100%)',
                    color: '#f8fafc',
                    position: 'relative'
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        inset: '0',
                        background: 'radial-gradient(circle at top right, rgba(212, 175, 55, 0.22), transparent 34%)'
                    }}
                />
                <div
                    style={{
                        width: '54%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '34px',
                        background: 'rgba(255, 255, 255, 0.94)',
                        overflow: 'hidden',
                        boxShadow: '0 28px 60px rgba(0, 0, 0, 0.28)',
                        position: 'relative'
                    }}
                >
                    <img
                        src={previewImage}
                        alt={previewTitle}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            background: '#ffffff'
                        }}
                    />
                </div>
                <div
                    style={{
                        width: '46%',
                        height: '100%',
                        paddingLeft: '34px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative'
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                alignSelf: 'flex-start',
                                padding: '10px 18px',
                                borderRadius: '999px',
                                background: 'rgba(212, 175, 55, 0.16)',
                                border: '1px solid rgba(212, 175, 55, 0.32)',
                                color: '#f7d776',
                                fontSize: '22px',
                                letterSpacing: '0.18em'
                            }}
                        >
                            {previewBadge}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div
                                style={{
                                    fontSize: '24px',
                                    letterSpacing: '0.2em',
                                    color: 'rgba(226, 232, 240, 0.86)'
                                }}
                            >
                                HOUSE OF GLASS
                            </div>
                            <div
                                style={{
                                    fontSize: '54px',
                                    lineHeight: 1.08,
                                    fontWeight: 700,
                                    maxWidth: '100%'
                                }}
                            >
                                {previewTitle}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                alignSelf: 'flex-start',
                                padding: '14px 18px',
                                borderRadius: '20px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                color: '#e2e8f0',
                                fontSize: '24px'
                            }}
                        >
                            {previewCode ? `CODE ${previewCode}` : 'SHOP NOW'}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px'
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '20px',
                                        letterSpacing: '0.16em',
                                        color: 'rgba(226, 232, 240, 0.72)'
                                    }}
                                >
                                    OPEN THE PRODUCT DIRECTLY ON THE WEBSITE
                                </div>
                                <div
                                    style={{
                                        fontSize: '24px',
                                        color: '#f8fafc'
                                    }}
                                >
                                    www.hg-alshour.online
                                </div>
                            </div>
                            <div
                                style={{
                                    width: '74px',
                                    height: '74px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    background: '#f59e0b',
                                    color: '#0f172a',
                                    fontSize: '34px',
                                    fontWeight: 700
                                }}
                            >
                                ↗
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ),
        size
    );
}