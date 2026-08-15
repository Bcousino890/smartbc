"use client";

import { useEffect, useRef } from "react";
import { getTracker } from "@/lib/tracking/analytics";

type PageType =
  | "smartlink"
  | "public_property"
  | "property_list"
  | "home"
  | "contact"
  | "viewing_collection"
  | "other";

interface UseAnalyticsOptions {
  pageType: PageType;
  propertyId?: string;
  shareId?: string;
  collectionShareId?: string;
}

/**
 * Hook que inicializa el tracker de analytics para la página actual.
 * Devuelve una ref estable con el tracker (o null en SSR).
 * El tracker se inicializa una sola vez al montar el componente.
 */
export function useAnalytics(options: UseAnalyticsOptions) {
  // getTracker() devuelve null en SSR (sin window). Usamos optional chaining
  // en todos los métodos del tracker para ser seguros.
  const trackerRef = useRef<ReturnType<typeof getTracker>>(null);

  useEffect(() => {
    const tracker = getTracker();
    trackerRef.current = tracker;
    if (tracker) {
      tracker.init({
        pageType: options.pageType,
        propertyId: options.propertyId,
        shareId: options.shareId,
        collectionShareId: options.collectionShareId,
      });
    }
    // Solo inicializar una vez al montar — no re-inicializar si cambian las opciones
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return trackerRef;
}
