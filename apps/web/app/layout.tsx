import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'WorkingBetter', description: 'Performance management & employee experience' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
