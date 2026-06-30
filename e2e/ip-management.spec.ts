import { test, expect } from '@playwright/test'

test.describe('IP Management Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Asumir admin logueado
  })

  test('IP management page loads with tabs', async ({ page }) => {
    await page.goto('/admin/security/ip-management')

    await page.waitForLoadState('networkidle')

    // Verificar que existen los 3 tabs
    expect(await page.locator('button:has-text("IPs Bloqueadas")').isVisible()).toBe(true)
    expect(await page.locator('button:has-text("IPs Permitidas")').isVisible()).toBe(true)
    expect(await page.locator('button:has-text("Activity Log")').isVisible()).toBe(true)
  })

  test('blacklist tab shows "Bloquear IP" button', async ({ page }) => {
    await page.goto('/admin/security/ip-management')

    await page.waitForLoadState('networkidle')

    const blockButton = await page.locator('button:has-text("Bloquear IP")')
    expect(await blockButton.isVisible()).toBe(true)
  })

  test('block IP modal opens and submits', async ({ page }) => {
    await page.goto('/admin/security/ip-management')

    await page.waitForLoadState('networkidle')

    // Click en botón de bloquear
    await page.locator('button:has-text("Bloquear IP")').click()

    // Esperar a que el modal sea visible
    const modal = await page.locator('text=Bloquear IP').first()
    expect(await modal.isVisible()).toBe(true)

    // Rellenar formulario
    await page.fill('input[placeholder="192.168.1.100"]', '203.0.113.42')
    await page.selectOption('select', 'bot')

    // Enviar
    await page.locator('button:has-text("Bloquear")').click()

    // Modal debería cerrar
    await page.waitForTimeout(500)
    expect(await page.locator('text=Bloquear IP').isVisible()).toBe(false)
  })

  test('activity log tab displays entries', async ({ page }) => {
    await page.goto('/admin/security/ip-management')

    await page.waitForLoadState('networkidle')

    // Hacer click en tab de Activity Log
    await page.locator('button:has-text("Activity Log")').click()

    await page.waitForTimeout(500)

    // Verificar que la tabla existe
    const table = await page.locator('table')
    expect(await table.isVisible()).toBe(true)
  })
})
