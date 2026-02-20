import { test, expect } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:3000';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Usuario').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByPlaceholder('Código de barras').first()).toBeVisible();
}

async function authedApi(request) {
  const auth = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'admin' },
  });
  const { access_token } = await auth.json();
  const headers = { Authorization: `Bearer ${access_token}` };
  return {
    token: access_token,
    get: (path: string) => request.get(`${API_BASE}${path}`, { headers }),
    post: (path: string, data: unknown) =>
      request.post(`${API_BASE}${path}`, { headers, data }),
    delete: (path: string) => request.delete(`${API_BASE}${path}`, { headers }),
  };
}

async function ensureCategory(api, name: string) {
  const res = await api.post('/categories', { name });
  if (res.status() === 201) {
    const body = await res.json();
    return body.id as string;
  }
  if (res.status() === 409) {
    const listRes = await api.get('/categories');
    const data = await listRes.json();
    const existing = data.find((c) => c.name === name);
    if (existing) return existing.id;
  }
  throw new Error(`No se pudo asegurar la categoría ${name}`);
}

async function ensureLocation(api, name: string) {
  const res = await api.post('/locations', { name });
  if (res.status() === 201) {
    const body = await res.json();
    return body.id as string;
  }
  if (res.status() === 409) {
    const listRes = await api.get('/locations');
    const data = await listRes.json();
    const existing = data.find((l) => l.name === name);
    if (existing) return existing.id;
  }
  throw new Error(`No se pudo asegurar la ubicación ${name}`);
}

async function ensureUnit(api, name: string) {
  const res = await api.post('/units', { name });
  if (res.status() === 201) {
    const body = await res.json();
    return body.id as string;
  }
  if (res.status() === 409) {
    const listRes = await api.get('/units');
    const data = await listRes.json();
    const existing = data.find((u) => u.name === name);
    if (existing) return existing.id;
  }
  throw new Error(`No se pudo asegurar la unidad ${name}`);
}

test('login and load inventory table', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Inventario' }).click();
  await expect(page.getByRole('heading', { name: 'Stock actual' })).toBeVisible();
});

test('create item with location and unit via UI', async ({ page, request }) => {
  const barcode = `pw-${Date.now()}`;
  const api = await authedApi(request);
  
  // Create test data via API
  const categoryId = await ensureCategory(api, 'Playwright Category');
  
  // Get pre-existing location and unit from seed
  const locationsRes = await api.get('/locations');
  const locations = await locationsRes.json();
  const locationId = locations.find(l => l.name === 'Nevera')?.id;
  
  const unitsRes = await api.get('/units');
  const units = await unitsRes.json();
  const unitId = units.find(u => u.name === 'unidad')?.id;
  
  expect(locationId).toBeTruthy();
  expect(unitId).toBeTruthy();

  await login(page);
  const barcodeInput = page.getByPlaceholder('Código de barras').first();
  await barcodeInput.fill(barcode);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByPlaceholder('Nombre *')).toBeVisible();
  
  await page.getByPlaceholder('Nombre *').fill('Item Playwright');
  await page.getByPlaceholder('Código de barras *').fill(barcode);
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption(categoryId);
  await page.getByRole('combobox', { name: 'Ubicación' }).selectOption(locationId);
  await page.getByRole('combobox', { name: 'Unidad' }).selectOption(unitId);
  await page.getByPlaceholder('Cantidad inicial').fill('5');
  await page.getByPlaceholder('Cantidad mínima (alerta)').fill('2');
  
  // Set expiration date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  await page.getByPlaceholder('Fecha de vencimiento').fill(dateStr);
  
  const saveButton = page.getByRole('button', { name: 'Guardar' });
  await saveButton.click();
  
  // Wait for button to be re-enabled (indicates operation completed)
  await expect(saveButton).toBeEnabled({ timeout: 10_000 });
  
  // Navigate to inventory and verify item was created
  await page.getByRole('button', { name: 'Inventario' }).click();
  const row = page.getByRole('row', { name: new RegExp(barcode) });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator('td').nth(2)).toHaveText(barcode);

  const itemRes = await api.get(`/pantry-items/barcode/${barcode}`);
  const item = await itemRes.json();
  expect(item.name).toBe('Item Playwright');
  expect(item.minQuantity).toBe(2);
  expect(item.expirationDate?.split('T')[0]).toBe(dateStr);
});

test('freeze and thaw item', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryId = await ensureCategory(api, `Freeze Test ${Date.now()}`);
  const locationId = await ensureLocation(api, 'Nevera');
  const unitId = await ensureUnit(api, 'unidad');
  const barcode = `freeze-${Date.now()}`;
  
  await api.post('/pantry-items', {
    name: 'Item para congelar',
    barcode,
    initialQuantity: 3,
    categoryId,
    locationId,
    unitId,
  });

  await login(page);
  await page.getByRole('button', { name: 'Inventario' }).click();
  
  // Filter by category to find the item
  const filterSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .first();
  await filterSelect.selectOption(categoryId);
  
  const row = page.locator('table.inventory-table tbody tr', { hasText: barcode }).first();
  await expect(row).toBeVisible();
  
  // Check initial state - should show "Fresco" badge
  await expect(row.locator('td').nth(5)).toContainText('Fresco');
  
  // Freeze the item
  await row.getByRole('button', { name: 'Congelar' }).click();
  await expect(page.getByText('Producto congelado')).toBeVisible();
  
  // Verify frozen state
  await expect(row.locator('td').nth(5)).toContainText('Congelado');
  
  // Thaw the item
  await row.getByRole('button', { name: 'Descongelar' }).click();
  await expect(page.getByText('Producto descongelado')).toBeVisible();
  
  // Verify thawed state
  await expect(row.locator('td').nth(5)).toContainText('Fresco');
});

test('alerts tab shows expiring and low stock items', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryId = await ensureCategory(api, `Alerts Test ${Date.now()}`);
  
  // Use existing location and unit from seed
  const locationsRes = await api.get('/locations');
  const locations = await locationsRes.json();
  const locationId = locations.find(l => l.name === 'Despensa')?.id;
  
  const unitsRes = await api.get('/units');
  const units = await unitsRes.json();
  const unitId = units.find(u => u.name === 'gramos')?.id;
  
  expect(locationId).toBeTruthy();
  expect(unitId).toBeTruthy();
  
  // Create item expiring today
  const expiringBarcode = `expiring-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  await api.post('/pantry-items', {
    name: 'Item vencido hoy',
    barcode: expiringBarcode,
    initialQuantity: 5,
    categoryId,
    locationId,
    unitId,
    expirationDate: today,
  });
  
  // Create item with low stock
  const lowStockBarcode = `lowstock-${Date.now()}`;
  await api.post('/pantry-items', {
    name: 'Item stock bajo',
    barcode: lowStockBarcode,
    initialQuantity: 1,
    categoryId,
    locationId,
    unitId,
    minQuantity: 5,
  });

  await login(page);
  await page.getByRole('button', { name: 'Alertas' }).click();

  // Check expiring items section
  await expect(page.getByRole('heading', { name: /Próximos a vencer/ })).toBeVisible();
  await expect(page.getByText('Item vencido hoy').first()).toBeVisible();

  // Check low stock section
  await expect(page.getByRole('heading', { name: /Stock bajo/ })).toBeVisible();
  await expect(page.getByText('Item stock bajo').first()).toBeVisible();
  await expect(page.getByText(/1 \/ 5/).first()).toBeVisible();
});

test('extract one unit from inventory', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryId = await ensureCategory(api, `Extract Test ${Date.now()}`);
  const locationId = await ensureLocation(api, 'Alacena');
  const unitId = await ensureUnit(api, 'paquete');
  const barcode = `extract-${Date.now()}`;
  
  await api.post('/pantry-items', {
    name: 'Item para extraer',
    barcode,
    initialQuantity: 5,
    categoryId,
    locationId,
    unitId,
  });

  await login(page);
  await page.getByRole('button', { name: 'Sacar' }).click();
  
  const extractSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Sacar del stock' }) });
  
  await extractSection.getByPlaceholder('Código de barras').fill(barcode);
  await extractSection.getByRole('button', { name: 'Buscar' }).click();
  await expect(extractSection.getByRole('button', { name: 'Sacar 1 unidad' })).toBeVisible();
  
  await extractSection.getByRole('button', { name: 'Sacar 1 unidad' }).click();
  await expect(page.getByText('Se extrajo una unidad')).toBeVisible();
  
  // Verify stock decreased
  await page.getByRole('button', { name: 'Inventario' }).click();
  const filterSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .first();
  await filterSelect.selectOption(categoryId);
  
  const row = page.locator('table.inventory-table tbody tr', { hasText: barcode }).first();
  await expect(row).toContainText('4');
});

test('batch operations on inventory', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryName = `Batch Test ${Date.now()}`;
  const categoryId = await ensureCategory(api, categoryName);
  const locationId = await ensureLocation(api, 'Congelador');
  const unitId = await ensureUnit(api, 'caja');
  
  const barcodeA = `batch-a-${Date.now()}`;
  const barcodeB = `batch-b-${Date.now()}`;
  
  await api.post('/pantry-items', {
    name: 'Batch Item A',
    barcode: barcodeA,
    initialQuantity: 5,
    categoryId,
    locationId,
    unitId,
  });
  
  await api.post('/pantry-items', {
    name: 'Batch Item B',
    barcode: barcodeB,
    initialQuantity: 3,
    categoryId,
    locationId,
    unitId,
  });

  await login(page);
  await page.getByRole('button', { name: 'Inventario' }).click();
  
  // Filter by category
  const filterSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .first();
  await filterSelect.selectOption(categoryId);
  
  // Select all items in the group
  const table = page.locator('table.inventory-table').first();
  await table.locator('thead input[type="checkbox"]').check();
  
  // Verify selection banner shows
  const selectionBanner = page.getByTestId('selection-banner');
  await expect(selectionBanner).toBeVisible();
  await expect(selectionBanner.getByText(/2 seleccionados/)).toBeVisible();
  
  // Batch extract
  await page.getByRole('button', { name: 'Extraer 1 c/u' }).click();
  await expect(page.getByText('Se extrajo 1 unidad de cada item seleccionado')).toBeVisible();
  
  // Verify stocks decreased
  const rowA = table.locator('tbody tr', { hasText: barcodeA }).first();
  const rowB = table.locator('tbody tr', { hasText: barcodeB }).first();
  await expect(rowA).toContainText('4');
  await expect(rowB).toContainText('2');
});

test('sorting by expiration date', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryId = await ensureCategory(api, `Sort Test ${Date.now()}`);
  const locationId = await ensureLocation(api, 'Nevera');
  const unitId = await ensureUnit(api, 'litros');
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const barcodeA = `sort-exp-a-${Date.now()}`;
  const barcodeB = `sort-exp-b-${Date.now()}`;
  
  await api.post('/pantry-items', {
    name: 'Expires Next Week',
    barcode: barcodeA,
    initialQuantity: 1,
    categoryId,
    locationId,
    unitId,
    expirationDate: nextWeek.toISOString().split('T')[0],
  });
  
  await api.post('/pantry-items', {
    name: 'Expires Tomorrow',
    barcode: barcodeB,
    initialQuantity: 1,
    categoryId,
    locationId,
    unitId,
    expirationDate: tomorrow.toISOString().split('T')[0],
  });

  await login(page);
  await page.getByRole('button', { name: 'Inventario' }).click();
  
  // Filter by category
  const filterSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .first();
  await filterSelect.selectOption(categoryId);
  
  // Sort by expiration date
  const table = page.locator('table.inventory-table').first();
  const expHeader = table.locator('thead button', { hasText: 'Vencimiento' }).first();
  await expHeader.click();
  
  // Verify sorting - expires tomorrow should be first
  const rows = table.locator('tbody tr');
  const firstRowText = await rows.first().textContent();
  expect(firstRowText).toContain('Expires Tomorrow');
});

test('mobile layout shows location groups', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryId = await ensureCategory(api, `Mobile Test ${Date.now()}`);
  const locationId = await ensureLocation(api, 'Nevera Test');
  const unitId = await ensureUnit(api, 'unidad');
  const barcode = `mobile-${Date.now()}`;
  
  await api.post('/pantry-items', {
    name: 'Mobile Item',
    barcode,
    initialQuantity: 2,
    categoryId,
    locationId,
    unitId,
  });

  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Inventario' }).click();
  
  // Filter by category
  const filterSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .first();
  await filterSelect.selectOption(categoryId);
  
  // Check that the item is displayed
  const row = page.locator('table.inventory-table tbody tr', { hasText: barcode }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('[data-label="Nombre"]')).toBeVisible();
  await expect(row.locator('[data-label="Stock"]')).toBeVisible();
  await expect(row.locator('[data-label="Vencimiento"]')).toBeVisible();
  await expect(row.locator('[data-label="Estado"]')).toBeVisible();
});

test('dynamic location creation', async ({ page, request }) => {
  const api = await authedApi(request);
  const uniqueLocation = `Nueva Ubicación ${Date.now()}`;
  const barcode = `dyn-loc-${Date.now()}`;
  const categoryId = await ensureCategory(api, 'Dynamic Location Test');
  
  await login(page);
  
  // Create new item with dynamic location
  await page.getByPlaceholder('Código de barras').first().fill(barcode);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  
  await page.getByPlaceholder('Nombre *').fill('Item con ubicación dinámica');
  await page.getByPlaceholder('Código de barras *').fill(barcode);
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption(categoryId);
  await page.getByPlaceholder('Ubicación (nueva si no existe)').fill(uniqueLocation);
  
  const saveButton = page.getByRole('button', { name: 'Guardar' });
  await saveButton.click();
  
  // Wait for button to be re-enabled (indicates operation completed)
  await expect(saveButton).toBeEnabled({ timeout: 10_000 });
  
  // Go to inventory and check that the new location was created
  await page.getByRole('button', { name: 'Inventario' }).click();
  await expect(page.getByRole('heading', { name: uniqueLocation })).toBeVisible();
});

test('filter by location', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryId = await ensureCategory(api, `Filter Test ${Date.now()}`);
  const locationNevera = await ensureLocation(api, 'Nevera Filter');
  const locationDespensa = await ensureLocation(api, 'Despensa Filter');
  const unitId = await ensureUnit(api, 'unidad');
  
  const barcodeA = `filter-a-${Date.now()}`;
  const barcodeB = `filter-b-${Date.now()}`;
  
  await api.post('/pantry-items', {
    name: 'Item Nevera',
    barcode: barcodeA,
    initialQuantity: 1,
    categoryId,
    locationId: locationNevera,
    unitId,
  });
  
  await api.post('/pantry-items', {
    name: 'Item Despensa',
    barcode: barcodeB,
    initialQuantity: 1,
    categoryId,
    locationId: locationDespensa,
    unitId,
  });

  await login(page);
  await page.getByRole('button', { name: 'Inventario' }).click();
  
  // Filter by location
  const locationSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .nth(1);
  
  await locationSelect.selectOption(locationNevera);
  
  // Should show only Nevera item
  const table = page.locator('table.inventory-table').first();
  await expect(table.locator('tbody tr', { hasText: barcodeA })).toBeVisible();
  await expect(table.locator('tbody tr', { hasText: barcodeB })).not.toBeVisible();
});
