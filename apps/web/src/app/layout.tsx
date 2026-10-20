import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { RegisterServiceWorker } from '@/components/sw';
import './globals.css';

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'PontoNexo', template: '%s · PontoNexo' },
  description: 'Controle de jornada para trabalho doméstico.',
  applicationName: 'PontoNexo',
  appleWebApp: { capable: true, title: 'PontoNexo', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#000f4b',
  width: 'device-width',
  initialScale: 1,
  // ocupa a tela toda no celular (inclusive atrás do entalhe), como aplicativo
  viewportFit: 'cover',
  // só tema claro: impede o "modo escuro forçado" do Samsung Internet e do navegador da Xiaomi de trocar as cores
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plex.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
