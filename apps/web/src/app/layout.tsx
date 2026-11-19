import type { Metadata, Viewport } from 'next';
import './globals.css';
import { EmergencyBanner } from '../components/layout/EmergencyBanner';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { I18nProvider } from '../context/I18nContext';
import { NetworkProvider } from '../context/NetworkContext';

export const metadata: Metadata = {
  title: 'ReliefLink | Crisis Response & Aid Matching',
  description:
    'Rapid humanitarian crisis response portal: report emergencies, coordinate volunteers and NGOs, and track relief efforts offline or online.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#991b1b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen flex flex-col antialiased">
        <I18nProvider>
          <NetworkProvider>
            {/* Non-negotiable persistent emergency banner */}
            <EmergencyBanner />
            <Header />
            <main className="flex-1 flex flex-col w-full">{children}</main>
            <Footer />
          </NetworkProvider>
        </I18nProvider>

        <script
          id="service-worker-register"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.log('SW registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
