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

test('login and load stock table', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Stocks' }).click();
  await expect(page.getByRole('heading', { name: 'Stock actual' })).toBeVisible();
});

test('create category and item via UI', async ({ page, request }) => {
  const barcode = `pw-${Date.now()}`;
  const api = await authedApi(request);
  const categoryId = await ensureCategory(api, 'Playwright Cat');

  await login(page);
  const barcodeInput = page.getByPlaceholder('Código de barras').first();
  await barcodeInput.fill(barcode);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByPlaceholder('Nombre')).toBeVisible();
  await page.getByPlaceholder('Nombre').fill('Item Playwright');
  await page
    .getByRole('heading', { name: 'Nuevo item' })
    .locator('..')
    .getByPlaceholder('Código de barras')
    .fill(barcode);
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption(categoryId);
  await page.getByPlaceholder('Cantidad inicial').fill('3');
  const saveButton = page.getByRole('button', { name: 'Guardar' });
  const creationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/items') && response.request().method() === 'POST',
  );
  await saveButton.click();
  const creationResponse = await creationResponsePromise;
  if (creationResponse.status() >= 400) {
    const payload = creationResponse.request().postData() ?? '';
    const body = await creationResponse.text();
    console.error('POST /items failed', {
      status: creationResponse.status(),
      payload,
      body,
    });
  }
  expect(creationResponse.status()).toBeLessThan(400);
  await expect(saveButton).toBeEnabled();

  await page.getByRole('button', { name: 'Stocks' }).click();
  const row = page.getByRole('row', { name: new RegExp(barcode) });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator('td').nth(2)).toHaveText(barcode);

  const itemRes = await api.get(`/items/barcode/${barcode}`);
  const item = await itemRes.json();
  expect(item.name).toBe('Item Playwright');
});

test('sorting and batch selection', async ({ page, request }) => {
  const api = await authedApi(request);
  const categoryName = `Playwright Auto ${Date.now()}`;
  const playCategoryId = await ensureCategory(api, categoryName);
  const barcodeA = `sort-a-${Date.now()}`;
  const barcodeB = `sort-b-${Date.now()}`;
  const barcodeC = `sort-c-${Date.now()}`;
  const payload = (name: string, barcode: string, quantity: number) => ({
    name,
    barcode,
    initialQuantity: quantity,
    categoryId: playCategoryId,
  });
  await api.post('/items', payload('Alpha', barcodeA, 5));
  await api.post('/items', payload('Zulu', barcodeB, 1));
  await api.post('/items', payload('Bravo', barcodeC, 3));

  await login(page);
  await page.getByRole('button', { name: 'Stocks' }).click();
  const filterSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .first();
  await filterSelect.selectOption(playCategoryId);
  const categoryTable = page.locator('table.inventory-table').first();
  const selectionBanner = page.getByTestId('selection-banner');
  const nameHeader = categoryTable.locator('thead button', { hasText: 'Nombre' }).first();
  await nameHeader.click();
  await nameHeader.click();
  const rows = categoryTable.locator('tbody tr');
  const names = await rows.allTextContents();
  expect(names[0]).toContain('Zulu');

  await filterSelect.selectOption('all');
  const globalRows = await page.locator('table.inventory-table tbody tr').count();
  const globalSelectBtn = page
    .getByRole('button', { name: 'Seleccionar todos', exact: true })
    .first();
  await globalSelectBtn.click();
  await expect(page.getByText(new RegExp(`${globalRows} seleccionados`))).toBeVisible();
  await selectionBanner.getByRole('button', { name: /^Limpiar$/ }).click();

  await filterSelect.selectOption(playCategoryId);
  const filteredTable = page.locator('table.inventory-table').first();
  await filteredTable.locator('thead input[type="checkbox"]').check();

  await page.getByRole('button', { name: 'Extraer 1 c/u' }).click();
  await expect(page.getByText('Se extrajo 1 unidad de cada item seleccionado')).toBeVisible();
  const alphaRow = filteredTable.locator('tbody tr', { hasText: barcodeA }).first();
  await expect(alphaRow).toContainText('4');

  await filteredTable.locator('thead input[type="checkbox"]').check();
  page.once('dialog', (dialog) => dialog.accept());
  await selectionBanner.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Items eliminados')).toBeVisible();
  await expect(filteredTable.locator('tbody tr', { hasText: barcodeA })).toHaveCount(0);
  await expect(filteredTable.locator('tbody tr', { hasText: barcodeB })).toHaveCount(0);
  await expect(filteredTable.locator('tbody tr', { hasText: barcodeC })).toHaveCount(0);
});

test('mobile layout labels', async ({ page, request }) => {
  const api = await authedApi(request);
  const mobileCategoryName = `Mobile Test ${Date.now()}`;
  const mobileCategoryId = await ensureCategory(api, mobileCategoryName);
  const mobileBarcode = `mobile-${Date.now()}`;
  const mobileRes = await api.post('/items', {
    name: 'Mobile Item',
    barcode: mobileBarcode,
    initialQuantity: 2,
    categoryId: mobileCategoryId,
  });
  const mobileItem = await mobileRes.json();

  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Stocks' }).click();
  const filterSelect = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Stock actual' }) })
    .locator('select')
    .first();
  await filterSelect.selectOption(mobileCategoryId);
  const firstCard = page
    .locator('table.inventory-table tbody tr', { hasText: mobileBarcode })
    .first();
  await firstCard.waitFor();
  await expect(firstCard.locator('[data-label="Nombre"]')).toBeVisible();
  await expect(firstCard.locator('[data-label="Acciones"]')).toBeVisible();
  await api.delete(`/items/${mobileItem.id}`);
});
