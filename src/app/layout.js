import { Cairo, Almarai } from 'next/font/google'
import Script from 'next/script'
import InstallAppPrompt from '@/components/layout/InstallAppPrompt'
import NotificationPermissionPrompt from '@/components/layout/NotificationPermissionPrompt'
import './globals.css'

const cairo = Cairo({ subsets: ['latin', 'arabic'], variable: '--font-cairo' })
const almarai = Almarai({ subsets: ['arabic'], weight: ['300', '400', '700', '800'], variable: '--font-almarai' })

export const metadata = {
  title: 'House Of Glass | Gallery',
  applicationName: 'House Of Glass',
  description: 'Static Gallery with Serverless API',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'House Of Glass'
  },
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
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossOrigin="anonymous" referrerPolicy="no-referrer" />
</head>
      <body suppressHydrationWarning className={`bg-gray-50 dark:bg-darkBg text-gray-900 dark:text-gray-100 transition-colors duration-300 font-arabic min-h-screen flex flex-col w-full`}>
        <Script
          src="/apply-smart-theme.js"
          strategy="beforeInteractive"
        />
        <Script src="/account-api.js" strategy="beforeInteractive" />
        <Script src="/locales-data.js" strategy="beforeInteractive" />
        <Script src="/i18n.js" strategy="beforeInteractive" />
        <Script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js" strategy="beforeInteractive" />
        {children}
        <InstallAppPrompt />
        <NotificationPermissionPrompt />
      </body>
    </html>
  )
}







