import { useEffect, useState, type FormEvent } from 'react';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

type Category = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  name: string;
  barcode: string;
  category: Category;
  quantity: number;
};

async function handleResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function App() {
  const [token, setToken] = useState<string>('');
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'admin' });
  const [loginError, setLoginError] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [lookup, setLookup] = useState<Item | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    barcode: '',
    categoryId: '',
    initialQuantity: 1,
  });
  const [adjustForm, setAdjustForm] = useState({
    itemId: '',
    delta: 1,
    reason: '',
  });

  const authedFetch = (path: string, options?: RequestInit) => {
    if (!token) throw new Error('Token missing');
    return fetch(`${API_BASE}${path}`, {
      ...(options ?? {}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options?.headers ?? {}),
      },
    });
  };

  const login = async (evt: FormEvent) => {
    evt.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await handleResponse(res);
      setToken(data.access_token);
      setMessage('Sesión iniciada');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login error');
    }
  };

  const loadData = async () => {
    if (!token) return;
    try {
      const [catsRes, itemsRes] = await Promise.all([
        authedFetch('/categories'),
        authedFetch('/items'),
      ]);
      setCategories(await handleResponse(catsRes));
      setItems(await handleResponse(itemsRes));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error cargando datos');
    }
  };

  useEffect(() => {
    loadData().catch((err) => setMessage(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const lookupBarcode = async () => {
    if (!barcode) return;
    setLookup(null);
    try {
      const res = await authedFetch(`/items/barcode/${barcode}`);
      setLookup(await handleResponse(res));
      setMessage('Producto encontrado');
    } catch (err) {
      setLookup(null);
      setMessage('No existe, crealo manualmente');
    }
  };

  const submitNewItem = async (evt: FormEvent) => {
    evt.preventDefault();
    try {
      await handleResponse(
        await authedFetch('/items', {
          method: 'POST',
          body: JSON.stringify(createForm),
        }),
      );
      setMessage('Item creado');
      setCreateForm({ name: '', barcode: '', categoryId: '', initialQuantity: 1 });
      setBarcode('');
      await loadData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al crear item');
    }
  };

  const submitAdjustment = async (evt: FormEvent) => {
    evt.preventDefault();
    if (!adjustForm.itemId) return;
    try {
      await handleResponse(
        await authedFetch(`/items/${adjustForm.itemId}/adjust`, {
          method: 'POST',
          body: JSON.stringify({ delta: adjustForm.delta, reason: adjustForm.reason }),
        }),
      );
      setMessage('Movimiento registrado');
      setAdjustForm({ itemId: '', delta: 1, reason: '' });
      await loadData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error ajustando stock');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <header className="rounded-xl bg-white p-4 shadow">
          <h1 className="text-2xl font-semibold">Inventario</h1>
          <p className="text-sm text-slate-500">
            Escaneá o tipeá un código para ver el stock. Login con admin/admin por defecto.
          </p>
        </header>

        {!token && (
          <section className="rounded-xl bg-white p-4 shadow space-y-4">
            <h2 className="text-lg font-semibold">Login</h2>
            <form className="space-y-3" onSubmit={login}>
              <label className="block text-sm font-medium text-slate-600">
                Usuario
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  placeholder="Usuario"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Password
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  type="password"
                  placeholder="Password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </label>
              {loginError && <p className="text-sm text-red-600">{loginError}</p>}
              <button
                type="submit"
                className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
              >
                Ingresar
              </button>
            </form>
          </section>
        )}

        {token && (
          <>
            <section className="rounded-xl bg-white p-4 shadow space-y-4">
              <h2 className="text-lg font-semibold">Buscar / Escanear</h2>
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  className="flex-1 rounded border px-3 py-2"
                  placeholder="Código de barras"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                />
                <button
                  className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
                  onClick={lookupBarcode}
                >
                  Buscar
                </button>
              </div>
              {lookup && (
                <div className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm">
                  <p className="font-semibold">{lookup.name}</p>
                  <p>Categoría: {lookup.category?.name}</p>
                  <p>Stock: {lookup.quantity}</p>
                </div>
              )}
            </section>

            <section className="rounded-xl bg-white p-4 shadow space-y-4">
              <h2 className="text-lg font-semibold">Nuevo item</h2>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={submitNewItem}>
                <input
                  className="rounded border px-3 py-2"
                  placeholder="Nombre"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
                <input
                  className="rounded border px-3 py-2"
                  placeholder="Código de barras"
                  required
                  value={createForm.barcode}
                  onChange={(e) => setCreateForm({ ...createForm, barcode: e.target.value })}
                />
                <select
                  aria-label="Categoría"
                  className="rounded border px-3 py-2"
                  required
                  value={createForm.categoryId}
                  onChange={(e) => setCreateForm({ ...createForm, categoryId: e.target.value })}
                >
                  <option value="">Categoría</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded border px-3 py-2"
                  type="number"
                  placeholder="Cantidad inicial"
                  value={createForm.initialQuantity}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, initialQuantity: Number(e.target.value) })
                  }
                />
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-500"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-xl bg-white p-4 shadow space-y-4">
              <h2 className="text-lg font-semibold">Ajustar stock</h2>
              <form className="flex flex-col gap-3 md:flex-row" onSubmit={submitAdjustment}>
                <select
                  className="flex-1 rounded border px-3 py-2"
                  required
                  value={adjustForm.itemId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, itemId: e.target.value })}
                >
                  <option value="">Seleccionar item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.quantity})
                    </option>
                  ))}
                </select>
                <input
                  className="w-24 rounded border px-3 py-2"
                  type="number"
                  value={adjustForm.delta}
                  onChange={(e) => setAdjustForm({ ...adjustForm, delta: Number(e.target.value) })}
                />
                <input
                  className="flex-1 rounded border px-3 py-2"
                  placeholder="Motivo"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                />
                <button
                  type="submit"
                  className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                >
                  Aplicar
                </button>
              </form>
            </section>

            <section className="rounded-xl bg-white p-4 shadow space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Stock actual</h2>
                <button
                  className="text-sm text-indigo-600 underline"
                  onClick={() => loadData()}
                >
                  Actualizar
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2">Nombre</th>
                      <th className="py-2">Código</th>
                      <th className="py-2">Categoría</th>
                      <th className="py-2">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b last:border-none">
                        <td className="py-2 font-medium">{item.name}</td>
                        <td className="py-2">{item.barcode}</td>
                        <td className="py-2">{item.category?.name}</td>
                        <td className="py-2">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {message && (
          <div
            role="status"
            className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
