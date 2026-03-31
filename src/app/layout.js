import { Cairo, Almarai } from 'next/font/google'
import './globals.css'

const cairo = Cairo({ subsets: ['latin', 'arabic'], variable: '--font-cairo' })
const almarai = Almarai({ subsets: ['arabic'], weight: ['300', '400', '700', '800'], variable: '--font-almarai' })

export const metadata = {
  title: 'House Of Glass | Gallery',
  description: 'Static Gallery with Serverless API',
  icons: {
    icon: '/favicon.svg?v=2',
    apple: '/logo.png',
  },
}

export const viewport = {
  themeColor: '#121926'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${cairo.variable} ${almarai.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            function applySmartTheme() {
                const isAutoEnabled = localStorage.getItem('autoThemeEnabled') !== 'false';
                const manualTheme = localStorage.getItem('darkMode');
                const overrideTime = localStorage.getItem('themeOverrideTime');
                const now = Date.now();
                
                if (!isAutoEnabled) {
                    if (manualTheme === 'true') document.documentElement.classList.add('dark');
                    else if (manualTheme === 'false') document.documentElement.classList.remove('dark');
                    return;
                }

                if (overrideTime && (now - overrideTime > 600000)) {
                    localStorage.removeItem('darkMode');
                    localStorage.removeItem('themeOverrideTime');
                } else if (manualTheme !== null) {
                    if (manualTheme === 'true') document.documentElement.classList.add('dark');
                    else document.documentElement.classList.remove('dark');
                    return;
                }

                const hour = new Date().getHours();
                if (hour < 6 || hour >= 18) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            }
            applySmartTheme();
          `
        }} />
      <script src="/account-api.js"></script>
<script src="/locales-data.js"></script>
<script src="/i18n.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossOrigin="anonymous" referrerPolicy="no-referrer" />
</head>
      <body suppressHydrationWarning className={`bg-gray-50 dark:bg-darkBg text-gray-900 dark:text-gray-100 transition-colors duration-300 font-arabic min-h-screen flex flex-col w-full`}>
        {children}
      </body>
    </html>
  )
}






