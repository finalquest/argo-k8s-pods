import { useEffect, useState, type FormEvent } from 'react';
import './index.css';
import { BarcodeScanner } from './components/BarcodeScanner';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

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

type ExternalProduct = {
  name: string;
  brand?: string;
  quantity?: string;
  category?: string;
  image?: string;
  source: string;
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function useApi(token: string) {
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

  return { authedFetch };
}

export default function App() {
  const [token, setToken] = useState('');
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'admin' });
  const [loginError, setLoginError] = useState('');
  const [barcode, setBarcode] = useState('');
  const [lookup, setLookup] = useState<Item | null>(null);
  const [externalLookup, setExternalLookup] = useState<ExternalProduct | null>(null);
  const [pendingIncrementItem, setPendingIncrementItem] = useState<Item | null>(null);
  const [message, setMessage] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [createForm, setCreateForm] = useState({
    name: '',
    barcode: '',
    categoryId: '',
    initialQuantity: 1,
    externalCategoryName: '',
  });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<'capture' | 'inventory'>('capture');
  const [autoIncrementDelta] = useState(1);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const { authedFetch } = useApi(token);

  const login = async (evt: FormEvent) => {
    evt.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await handleResponse<{ access_token: string }>(res);
      setToken(data.access_token);
      setMessage('Sesión iniciada');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login error');
    }
  };

  const loadCategories = async () => {
    if (!token) return;
    try {
      const res = await authedFetch('/categories');
      setCategories(await handleResponse(res));
    } catch (err) {
      console.error(err);
    }
  };

  const loadInventory = async () => {
    if (!token) return;
    try {
      const res = await authedFetch('/items');
      setItems(await handleResponse(res));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error cargando inventario');
    }
  };

  useEffect(() => {
    loadCategories().catch(() => {});
    loadInventory().catch(() => {});
  }, [token]);

  const lookupBarcode = async (value?: string) => {
    const target = value ?? barcode;
    if (!target) return;
    setLookup(null);
    setExternalLookup(null);
    try {
      const res = await authedFetch(`/items/barcode/${encodeURIComponent(target)}`);
      const found = await handleResponse<Item>(res);
      setLookup(found);
      setPendingIncrementItem(found);
      setBarcode('');
      setCreateForm((prev) => ({ ...prev, barcode: '', name: '' }));
      setMessage('Producto encontrado, confirmá para sumar al stock');
    } catch (err) {
      try {
        const externalRes = await authedFetch(
          `/items/barcode/${encodeURIComponent(target)}/external`,
        );
        const external = await handleResponse<ExternalProduct>(externalRes);
        setExternalLookup(external);
        setCreateForm((prev) => ({
          ...prev,
          name: external.name ?? prev.name,
          barcode: target,
          externalCategoryName: external.category ?? prev.externalCategoryName,
          categoryId: categories.find((cat) =>
            external.category
              ? cat.name.toLowerCase() === external.category.toLowerCase()
              : false,
          )?.id ?? prev.categoryId,
        }));
        setMessage(
          external.source === 'enc'
            ? 'No existe en inventario, sugerencia de enc.finalq.xyz'
            : 'No existe en inventario, pero encontramos datos externos',
        );
      } catch {
        setExternalLookup(null);
        setCreateForm((prev) => ({ ...prev, barcode: target }));
        setMessage('No existe, completá los datos para crearlo');
      }
    }
  };

  const confirmIncrement = async () => {
    if (!pendingIncrementItem) return;
    try {
      await authedFetch(`/items/${pendingIncrementItem.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta: autoIncrementDelta, reason: 'Ingreso rápido' }),
      });
      setMessage('Stock actualizado');
      setPendingIncrementItem(null);
      setLookup(null);
      await loadInventory();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al ajustar stock');
    }
  };

  const extractItem = async (id: string) => {
    try {
      await authedFetch(`/items/${id}/extract`, { method: 'POST' });
      setMessage('Se extrajo una unidad');
      await loadInventory();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al extraer');
    }
  };

  const batchExtract = async () => {
    if (selectedItems.size === 0) return;
    try {
      await Promise.all(Array.from(selectedItems).map((id) => authedFetch(`/items/${id}/extract`, { method: 'POST' })));
      setMessage('Se extrajo 1 unidad de cada item seleccionado');
      setSelectedItems(new Set());
      await loadInventory();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error en extracción masiva');
    }
  };

  const batchDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!window.confirm('¿Eliminar todos los items seleccionados?')) return;
    try {
      await Promise.all(Array.from(selectedItems).map((id) => authedFetch(`/items/${id}`, { method: 'DELETE' })));
      setMessage('Items eliminados');
      setSelectedItems(new Set());
      await loadInventory();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al eliminar en lote');
    }
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('¿Eliminar este item y su historial?')) return;
    try {
      await authedFetch(`/items/${id}`, { method: 'DELETE' });
      setMessage('Item eliminado');
      await loadInventory();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleScanned = async (code: string) => {
    setBarcode(code);
    setScannerOpen(false);
    await lookupBarcode(code);
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
      setMessage('Item cargado');
      setCreateForm({ name: '', barcode: '', categoryId: '', externalCategoryName: '', initialQuantity: 1 });
      setExternalLookup(null);
      setExternalLookup(null);
      await loadInventory();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al crear item');
    }
  };

  const renderCaptureTab = () => (
    <div className="space-y-4">
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
            onClick={() => lookupBarcode()}
          >
            Buscar
          </button>
          <button
            type="button"
            className="rounded border border-indigo-200 px-4 py-2 text-indigo-700 hover:bg-indigo-50"
            onClick={() => setScannerOpen(true)}
          >
            Escanear
          </button>
        </div>
        {lookup && (
          <div className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm">
            <p className="font-semibold">{lookup.name}</p>
            <p>Categoría: {lookup.category?.name}</p>
            <p>Stock: {lookup.quantity}</p>
            <p className="text-xs text-indigo-700">
              Confirmá para sumar +{autoIncrementDelta} al stock.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
                onClick={confirmIncrement}
                disabled={!pendingIncrementItem}
              >
                Confirmar ingreso
              </button>
              <button
                type="button"
                className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  setPendingIncrementItem(null);
                  setLookup(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {!lookup && externalLookup && (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-semibold">{externalLookup.name}</p>
            {externalLookup.image && (
              <img
                src={externalLookup.image}
                alt={externalLookup.name}
                className="my-2 h-32 w-auto rounded-lg object-contain"
              />
            )}
            {externalLookup.brand && <p>Marca: {externalLookup.brand}</p>}
            {externalLookup.category && <p>Categoría externa: {externalLookup.category}</p>}
            {externalLookup.quantity && <p>Presentación: {externalLookup.quantity}</p>}
            <p className="text-xs text-emerald-700">
              Datos sugeridos desde {externalLookup.source}, completá y guardá para agregarlo.
            </p>
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
            placeholder="Cantidad inicial"
            value={createForm.initialQuantity}
            onChange={(e) =>
              setCreateForm({
                ...createForm,
                initialQuantity: Number(e.target.value.replace(/[^0-9-]/g, '')) || 0,
              })
            }
          />
          <input
            className="rounded border px-3 py-2"
            placeholder="Categoría externa (opcional)"
            value={createForm.externalCategoryName}
            onChange={(e) =>
              setCreateForm({ ...createForm, externalCategoryName: e.target.value })
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
    </div>
  );

  const renderInventoryTab = () => (
    <div className="space-y-4">
      {selectedItems.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow">
          <p className="text-sm text-slate-600">{selectedItems.size} seleccionados</p>
          <button
            className="rounded border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
            onClick={() => batchExtract()}
          >
            Extraer 1 cada uno
          </button>
          <button
            className="rounded border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
            onClick={() => batchDelete()}
          >
            Eliminar todos
          </button>
            <button
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              onClick={() => setSelectedItems(new Set())}
            >
              Limpiar selección
            </button>
        </div>
      )}

      <div className="rounded-xl bg-white p-4 shadow space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Stock actual</h2>
          <button className="text-sm text-indigo-600 underline" onClick={() => loadInventory()}>
            Actualizar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">
                  <input
                    type="checkbox"
                    checked={selectedItems.size > 0 && selectedItems.size === items.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(items.map((item) => item.id)));
                      } else {
                        setSelectedItems(new Set());
                      }
                    }}
                  />
                </th>
                <th className="py-2">Nombre</th>
                <th className="py-2">Código</th>
                <th className="py-2">Categoría</th>
                <th className="py-2">Stock</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-none">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={(e) => {
                        const next = new Set(selectedItems);
                        if (e.target.checked) {
                          next.add(item.id);
                        } else {
                          next.delete(item.id);
                        }
                        setSelectedItems(next);
                      }}
                    />
                  </td>
                  <td className="py-2 font-medium">{item.name}</td>
                  <td className="py-2">{item.barcode}</td>
                  <td className="py-2">{item.category?.name}</td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded border border-amber-200 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50"
                        onClick={() => extractItem(item.id)}
                        disabled={item.quantity <= 0}
                      >
                        Extraer
                      </button>
                      <button
                        className="rounded border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                        onClick={() => deleteItem(item.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
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
                className="w-full rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
              >
                Ingresar
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
          <header className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Inventario</h1>
              <p className="text-sm text-slate-500">
                Escaneá o tipeá un código para registrar ingresos. Tab separado para ver stock.
              </p>
            </div>
            <div className="flex gap-2 rounded-full bg-slate-100 p-1 text-sm font-medium text-slate-600">
              <button
                className={`rounded-full px-4 py-2 ${tab === 'capture' ? 'bg-white shadow text-slate-900' : ''}`}
                onClick={() => setTab('capture')}
              >
                Buscar / Agregar
              </button>
              <button
                className={`rounded-full px-4 py-2 ${tab === 'inventory' ? 'bg-white shadow text-slate-900' : ''}`}
                onClick={() => setTab('inventory')}
              >
                Stocks
              </button>
            </div>
          </header>

          {tab === 'capture' ? renderCaptureTab() : renderInventoryTab()}

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
      {scannerOpen && token && (
        <BarcodeScanner onDetected={handleScanned} onClose={() => setScannerOpen(false)} />
      )}
    </>
  );
}
