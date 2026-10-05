import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Navbar from './components/Navbar'
import { UIProvider } from './components/ui'
import { LanguageProvider } from '@/lib/i18n'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Life in Weeks',
  description: 'Votre vie, semaine par semaine.',
  applicationName: 'Life in Weeks',
  appleWebApp: { capable: true, title: 'Life in Weeks', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={geist.variable}>
      <body className="bg-ink text-fg antialiased">
        <LanguageProvider>
          <UIProvider>
            {/* Sur ordinateur, la navigation est une colonne de 80 px à gauche */}
            <div className="md:ps-20 min-h-dvh">{children}</div>
            <Navbar />
          </UIProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
