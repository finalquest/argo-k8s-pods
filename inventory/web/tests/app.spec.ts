import { test, expect } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:3000';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Usuario').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Stock actual' })).toBeVisible();
}

test('login and load stock table', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Stock actual' })).toBeVisible();
});

test('create category and item, adjust stock', async ({ page, request }) => {
  const barcode = `pw-${Date.now()}`;
  const auth = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'admin' },
  });
  const { access_token } = await auth.json();
  const createRes = await request.post(`${API_BASE}/categories`, {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { name: 'Playwright Cat' },
    failOnStatusCode: false,
  });
  let category;
  if (createRes.status() === 409) {
    const list = await request.get(`${API_BASE}/categories`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const data = await list.json();
    category = data.find((c) => c.name === 'Playwright Cat');
  } else {
    category = await createRes.json();
  }
  expect(category).toBeTruthy();

  await login(page);
  await page
    .getByRole('heading', { name: 'Buscar / Escanear' })
    .locator('..')
    .getByPlaceholder('Código de barras')
    .fill(barcode);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByPlaceholder('Nombre').fill('Item Playwright');
  await page
    .getByRole('heading', { name: 'Nuevo item' })
    .locator('..')
    .getByPlaceholder('Código de barras')
    .fill(barcode);
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption(category.id);
  await page.getByPlaceholder('Cantidad inicial').fill('4');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByText('Item creado')).toBeVisible();
  const itemRes = await request.get(`${API_BASE}/items/barcode/${barcode}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const item = await itemRes.json();
  const initialQty = item.quantity;
  expect(initialQty).toBeGreaterThanOrEqual(2);
  const row = page.getByRole('row', { name: new RegExp(barcode) });
  await expect(row).toBeVisible();
  await expect(row.locator('td').first()).toHaveText('Item Playwright');

  const adjustSection = page.getByRole('heading', { name: 'Ajustar stock' }).locator('..');
  await adjustSection.getByRole('combobox').selectOption(item.id);
  await adjustSection.getByRole('spinbutton').first().fill('-2');
  await adjustSection.getByPlaceholder('Motivo').fill('consumo playwright');
  await adjustSection.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(row.locator('td').nth(3)).toHaveText(String(initialQty - 2));
});
