export default function manifest() {
    return {
        name: 'House Of Glass Gallery',
        short_name: 'House Of Glass',
        description: 'Premium home glassware gallery with retail and wholesale ordering.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#121926',
        theme_color: '#121926',
        lang: 'en',
        icons: [
            {
                src: '/icons/icon-192.png',
                sizes: '192x192',
                type: 'image/png'
            },
            {
                src: '/icons/icon-512.png',
                sizes: '512x512',
                type: 'image/png'
            },
            {
                src: '/icons/icon-512-maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
            }
        ]
    };
}