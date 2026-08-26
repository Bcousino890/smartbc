import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./portal.css";
import { SiteHeader } from "./_components/SiteHeader";
import { SiteFooter } from "./_components/SiteFooter";
import { CurrencyProvider } from "./_components/CurrencyProvider";
import { GoogleTranslate } from "./_components/GoogleTranslate";
import { ZintoWebChat } from "@/components/zinto-webchat";
import { fetchExchangeRates } from "@/lib/exchange-rates";

export const metadata: Metadata = {
  title: {
    default: "Benjamín Cousiño Propiedades — Personal Shopper Inmobiliario · España · Chile",
    template: "%s — Benjamín Cousiño Propiedades",
  },
  description: "Personal shopper inmobiliario de lujo en España y Chile. 1.800+ propiedades off market en Madrid, Santiago, Marbella y Costa Brava.",
  openGraph: {
    siteName: "Benjamín Cousiño Propiedades",
    type: "website",
  },
};

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const rates = await fetchExchangeRates();
  return (
    <div className="portal-web flex min-h-screen flex-col bg-cream text-navy">
      <CurrencyProvider rates={rates}>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </CurrencyProvider>
      <GoogleTranslate />
      <ZintoWebChat />
    </div>
  );
}
