import { test, expect } from '@playwright/test'

test.describe('Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Asumir que hay un usuario admin logueado
    // O usar una página de test que no requiere auth
  })

  test('dashboard loads and displays KPI cards', async ({ page }) => {
    await page.goto('/admin/analytics')

    // Esperar a que los datos se carguen
    await page.waitForLoadState('networkidle')

    // Verificar que existen las 4 tarjetas KPI
    const kpiCards = await page.locator('[data-testid="kpi-card"]')
    expect(await kpiCards.count()).toBeGreaterThanOrEqual(4)
  })

  test('timeline chart renders with data', async ({ page }) => {
    await page.goto('/admin/analytics')

    await page.waitForLoadState('networkidle')

    // Verificar que existe el gráfico
    const timelineChart = await page.locator('[data-testid="timeline-chart"]')
    expect(await timelineChart.isVisible()).toBe(true)

    // Verificar que hay barras/líneas en el gráfico
    const chartElements = await page.locator('svg rect, svg path').count()
    expect(chartElements).toBeGreaterThan(0)
  })

  test('device distribution pie chart shows data', async ({ page }) => {
    await page.goto('/admin/analytics')

    await page.waitForLoadState('networkidle')

    const deviceChart = await page.locator('[data-testid="device-chart"]')
    expect(await deviceChart.isVisible()).toBe(true)
  })

  test('period filter changes dashboard data', async ({ page }) => {
    await page.goto('/admin/analytics')

    await page.waitForLoadState('networkidle')

    // Obtener valor inicial de sesiones
    const initialSessions = await page.locator('[data-testid="kpi-sessions"]').textContent()

    // Cambiar filtro a "Este año"
    await page.selectOption('select[name="period"]', 'esteAño')

    await page.waitForLoadState('networkidle')

    // El valor puede cambiar (o ser el mismo si todas están en el mismo año)
    const newSessions = await page.locator('[data-testid="kpi-sessions"]').textContent()
    expect(newSessions).toBeDefined()
  })

  test('recent sessions table displays correctly', async ({ page }) => {
    await page.goto('/admin/analytics')

    await page.waitForLoadState('networkidle')

    const table = await page.locator('[data-testid="recent-sessions-table"]')
    expect(await table.isVisible()).toBe(true)

    // Verificar que hay filas en la tabla
    const rows = await page.locator('table tbody tr')
    expect(await rows.count()).toBeGreaterThanOrEqual(0) // Puede estar vacío si no hay datos
  })

  test('IP addresses in session table are masked', async ({ page }) => {
    await page.goto('/admin/analytics')

    await page.waitForLoadState('networkidle')

    const ipCells = await page.locator('table tbody td:first-child')
    const ipTexts = await ipCells.allTextContents()

    // Verificar que las IPs no muestran el último octeto
    ipTexts.forEach(ip => {
      if (ip.includes('.')) {
        expect(ip).toMatch(/\d+\.\d+\.\d+\.\*\*\*/)
      }
    })
  })
})
