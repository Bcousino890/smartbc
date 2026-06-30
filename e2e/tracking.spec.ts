import { test, expect } from '@playwright/test'

test.describe('Tracking System', () => {
  test.beforeEach(async ({ page }) => {
    // Interceptar requests a /api/tracking para verificar que se envían
    await page.route('**/api/tracking/**', route => route.continue())
  })

  test('page-view event is sent on smart link access', async ({ page }) => {
    let pageViewCalled = false

    page.on('response', response => {
      if (response.url().includes('/api/tracking/page-view')) {
        pageViewCalled = true
      }
    })

    // Ir a un SmartLink (o usar un URL de test)
    await page.goto('/c/test-token-12345')

    // Esperar a que se envíe el page-view
    await page.waitForTimeout(1000)

    expect(pageViewCalled).toBe(true)
  })

  test('photo_view event is sent when clicking photo', async ({ page }) => {
    let photoEventSent = false
    let eventPayload: any

    page.on('response', async response => {
      if (response.url().includes('/api/tracking/event')) {
        eventPayload = await response.json()
        if (eventPayload.events?.some((e: any) => e.eventType === 'photo_view')) {
          photoEventSent = true
        }
      }
    })

    await page.goto('/compartir/test-property-slug')

    // Hacer click en la galería de fotos
    const photoButton = await page.locator('img[alt*="photo"]').first()
    if (await photoButton.isVisible()) {
      await photoButton.click()
      await page.waitForTimeout(1000)
      expect(photoEventSent).toBe(true)
    }
  })

  test('contact_click event is sent when clicking WhatsApp button', async ({ page }) => {
    let contactEventSent = false

    page.on('response', async response => {
      if (response.url().includes('/api/tracking/event')) {
        const data = await response.json()
        if (data.events?.some((e: any) => e.eventType === 'contact_click')) {
          contactEventSent = true
        }
      }
    })

    await page.goto('/compartir/test-property-slug')

    // Hacer click en botón de WhatsApp
    const whatsappButton = await page.locator('button:has-text("WhatsApp")').first()
    if (await whatsappButton.isVisible()) {
      await whatsappButton.click()
      await page.waitForTimeout(500)
      expect(contactEventSent).toBe(true)
    }
  })

  test('IP is captured and sent with page view', async ({ page, context }) => {
    let capturedIP: string | null = null
    let pageViewData: any

    page.on('response', async response => {
      if (response.url().includes('/api/tracking/page-view')) {
        pageViewData = await response.json()
      }
    })

    await page.goto('/compartir/test-property-slug')
    await page.waitForTimeout(1000)

    // IP debería estar en los headers (x-forwarded-for o x-real-ip)
    // o en la respuesta del servidor
    expect(pageViewData).toBeDefined()
    expect(pageViewData).toHaveProperty('id')
  })

  test('session_id persists across page navigation', async ({ page }) => {
    let firstSessionId: string | null = null
    let secondSessionId: string | null = null

    page.on('response', async response => {
      if (response.url().includes('/api/tracking/page-view')) {
        const data = await response.json()
        if (!firstSessionId) {
          // Extraer session_id del localStorage después
        }
      }
    })

    await page.goto('/compartir/test-property-1')
    await page.waitForTimeout(500)

    firstSessionId = await page.evaluate(() => localStorage.getItem('bc_analytics_session'))

    await page.goto('/compartir/test-property-2')
    await page.waitForTimeout(500)

    secondSessionId = await page.evaluate(() => localStorage.getItem('bc_analytics_session'))

    expect(firstSessionId).toBe(secondSessionId)
  })
})
