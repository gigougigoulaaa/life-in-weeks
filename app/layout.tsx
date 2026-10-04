import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Navbar from './components/Navbar'
import { LanguageProvider } from '@/lib/i18n'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Life in Weeks',
  description: 'Votre vie, semaine par semaine.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className={`${geist.className} bg-black`}>
        <LanguageProvider>
          {children}
          <Navbar />
        </LanguageProvider>
      </body>
    </html>
  )
}