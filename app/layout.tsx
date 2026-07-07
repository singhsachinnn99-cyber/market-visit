import type { Metadata } from 'next';
import { Inter, Calistoga, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/providers/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import QueryProvider from '@/providers/query-provider';
import { SessionProvider } from 'next-auth/react';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const calistoga = Calistoga({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: '400',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Supervisor Field Visit Management',
  description: 'Enterprise Audit and NPD Checking Tool for Supervisor Field Operations.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} ${calistoga.variable} ${jetbrainsMono.variable} antialiased h-full`}>
        <SessionProvider>
          <QueryProvider>
            <ThemeProvider>
              <ToastProvider>{children}</ToastProvider>
            </ThemeProvider>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
export type RootLayoutProps = {
  children: React.ReactNode;
};
