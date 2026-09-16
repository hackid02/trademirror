import type { Metadata } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const jbMono = JetBrains_Mono({ variable: '--font-jbmono', subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const display = Space_Grotesk({ variable: '--font-display', subsets: ['latin'], weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  title: 'TradeMirror · Behavioral Audit Workbench — Bitget AI Hackathon S2',
  description:
    'Track 3 AI Trading Desk · Review & Self-Evolution. Diagnose why money bled: weekend spread traps, revenge tilt, disposition asymmetry — quantified in dollars, with deployable defense guardrails.',
  openGraph: {
    title: 'TradeMirror · See why your PnL bled',
    description:
      'Post-trade forensic workbench for Bitget UTA v3. Counterfactual PnL, bias taxonomy in dollars, Qwen-powered defense plan. #BitgetHackathon @Bitget_AI',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jbMono.variable} ${display.variable} min-h-screen font-sans antialiased`}
      >
        <Script
          id="tm-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('tm-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
