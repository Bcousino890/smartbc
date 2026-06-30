"use client"

import { useEffect, useRef } from "react"
import { getTracker } from "@/lib/tracking/analytics"
import type { AnalyticsTracker } from "@/lib/tracking/analytics"

export function useAnalytics(params: {
  pageType: string
  propertyId?: string
  shareId?: string
}) {
  const trackerRef = useRef<AnalyticsTracker | null>(null)

  useEffect(() => {
    const tracker = getTracker()
    if (!tracker) return
    trackerRef.current = tracker
    tracker.init(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.pageType, params.propertyId, params.shareId])

  return trackerRef
}
