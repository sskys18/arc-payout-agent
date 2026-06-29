import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arc Payout Agent — Dashboard',
  description: 'Recurring USDC contractor payouts on Arc testnet.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
