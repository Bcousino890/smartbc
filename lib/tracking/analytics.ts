// NO server-only. Este archivo corre en el browser.

export class AnalyticsTracker {
  private static instance: AnalyticsTracker

  private pageViewId: string | null = null
  private sessionId: string
  private eventQueue: Array<{ eventType: string; data?: unknown }> = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private timeOnPageStart: number = Date.now()

  private constructor() {
    this.sessionId = this.getOrCreateSessionId()
    this.flushTimer = setInterval(() => {
      this.flush()
    }, 5000)
    window.addEventListener("beforeunload", () => {
      this.trackTimeOnPage()
      this.flush()
    })
  }

  static getInstance(): AnalyticsTracker {
    if (!AnalyticsTracker.instance) {
      AnalyticsTracker.instance = new AnalyticsTracker()
    }
    return AnalyticsTracker.instance
  }

  init(params: {
    pageType: string
    propertyId?: string
    shareId?: string
  }): void {
    this.pageViewId = null
    this.timeOnPageStart = Date.now()
    void this.sendPageView(params)
  }

  private async sendPageView(params: {
    pageType: string
    propertyId?: string
    shareId?: string
  }): Promise<void> {
    try {
      const res = await fetch("/api/tracking/page-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageType: params.pageType,
          propertyId: params.propertyId ?? null,
          shareId: params.shareId ?? null,
          sessionId: this.sessionId,
          referrer: document.referrer,
          pagePath: window.location.pathname,
        }),
      })
      if (res.ok) {
        const json = (await res.json()) as { pageViewId?: string }
        if (json.pageViewId) {
          this.pageViewId = json.pageViewId
        }
      }
    } catch {
      // tracking no debe bloquear la app
    }
  }

  trackPhotoView(photoIndex: number): void {
    this.enqueue({ eventType: "photo_view", data: { photoIndex } })
  }

  trackVideoPlay(videoIndex: number): void {
    this.enqueue({ eventType: "video_play", data: { videoIndex } })
  }

  trackPlanView(planIndex: number): void {
    this.enqueue({ eventType: "plan_view", data: { planIndex } })
  }

  trackScroll(depthPercent: number): void {
    const checkpoints = [25, 50, 75, 90]
    if (!checkpoints.includes(depthPercent)) return
    this.enqueue({ eventType: "scroll", data: { depthPercent } })
  }

  trackContactClick(method: "whatsapp" | "email" | "phone"): void {
    this.enqueue({ eventType: "contact_click", data: { method } })
  }

  trackShareClick(method: "whatsapp" | "email" | "copy"): void {
    this.enqueue({ eventType: "share_click", data: { method } })
  }

  trackVisitRequest(): void {
    this.enqueue({ eventType: "visit_request" })
  }

  private enqueue(event: { eventType: string; data?: unknown }): void {
    this.eventQueue.push(event)
    if (this.eventQueue.length >= 10) {
      this.flush()
    }
  }

  flush(): void {
    if (!this.pageViewId || this.eventQueue.length === 0) {
      this.eventQueue = []
      return
    }
    const events = [...this.eventQueue]
    this.eventQueue = []
    this.sendEvents(events)
  }

  private sendEvents(
    events: Array<{ eventType: string; data?: unknown }>
  ): void {
    if (!this.pageViewId) return
    const payload = JSON.stringify({
      pageViewId: this.pageViewId,
      events,
    })
    const url = "/api/tracking/event"
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        url,
        new Blob([payload], { type: "application/json" })
      )
    } else {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // tracking no debe bloquear la app
      })
    }
  }

  private getOrCreateSessionId(): string {
    try {
      const stored = localStorage.getItem("bc_analytics_session")
      if (stored) {
        const parsed = JSON.parse(stored) as { id: string; ts: number }
        const thirtyMinutes = 30 * 60 * 1000
        if (Date.now() - parsed.ts < thirtyMinutes) {
          return parsed.id
        }
      }
    } catch {
      // localStorage not available
    }
    const id = this.generateUUID()
    try {
      localStorage.setItem(
        "bc_analytics_session",
        JSON.stringify({ id, ts: Date.now() })
      )
    } catch {
      // localStorage not available
    }
    return id
  }

  private generateUUID(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID()
    }
    // Fallback manual UUID v4
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0
        const v = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
      }
    )
  }

  private trackTimeOnPage(): void {
    const timeSeconds = Math.round(
      (Date.now() - this.timeOnPageStart) / 1000
    )
    this.enqueue({
      eventType: "time_on_page",
      data: { time_seconds: timeSeconds },
    })
  }
}

export function getTracker(): AnalyticsTracker {
  if (typeof window === "undefined") return null as unknown as AnalyticsTracker
  return AnalyticsTracker.getInstance()
}
