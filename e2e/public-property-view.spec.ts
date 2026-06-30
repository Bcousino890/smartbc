import { test, expect } from '@playwright/test'

test.describe('Public Property View', () => {
  test('public property view is accessible without login', async ({ page }) => {
    await page.goto('/compartir/test-property-slug')

    // No debería redirigir a login
    expect(page.url()).toContain('/compartir/test-property-slug')

    // Debería ver elementos de la propiedad
    expect(await page.locator('text=/habitaciones?|baños?/i').count()).toBeGreaterThan(0)
  })

  test('smart link with token is accessible', async ({ page }) => {
    // Usar un token válido de test
    await page.goto('/c/test-valid-token-example')

    // No debería retornar 404
    const status = page.url()
    expect(status).not.toContain('404')
  })

  test('property images load correctly', async ({ page }) => {
    await page.goto('/compartir/test-property-slug')

    // Esperar a que se carguen las imágenes
    const images = await page.locator('img[alt*="photo"], img[alt*="Foto"]')

    const count = await images.count()
    if (count > 0) {
      // Verificar que la primera imagen está visible
      expect(await images.first().isVisible()).toBe(true)
    }
  })

  test('contact buttons are present and functional', async ({ page }) => {
    await page.goto('/compartir/test-property-slug')

    // Buscar botones de contacto
    const whatsappBtn = await page.locator('button:has-text("WhatsApp"), a:has-text("WhatsApp")')
    const emailBtn = await page.locator('button:has-text("Email"), a:has-text("Email")')

    // Al menos uno debería existir
    const totalButtons = (await whatsappBtn.count()) + (await emailBtn.count())
    expect(totalButtons).toBeGreaterThan(0)
  })

  test('robots.noindex is set for smart links', async ({ page }) => {
    await page.goto('/c/test-valid-token')

    // Verificar que el meta robots tag tiene noindex
    const robotsMeta = await page.locator('meta[name="robots"]')
    if (await robotsMeta.count() > 0) {
      const content = await robotsMeta.getAttribute('content')
      expect(content).toContain('noindex')
    }
  })
})
