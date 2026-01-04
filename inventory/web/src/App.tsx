import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import './index.css';
import { BarcodeScanner } from './components/BarcodeScanner';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
const THEME_STORAGE_KEY = 'inventory-theme';
const SELECT_COLUMN_WIDTH = '48px';
const QUANTITY_COLUMN_WIDTH = '90px';
const ACTIONS_COLUMN_WIDTH = '22%';

type Category = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  name: string;
  barcode: string;
  category: Category | null;
  quantity: number;
  createdAt?: string;
  updatedAt?: string;
};

type ExternalProduct = {
  name: string;
  brand?: string;
  quantity?: string;
  category?: string;
  image?: string;
  source: string;
};

type StatusBanner = {
  type: 'success' | 'error' | 'info';
  text: string;
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

const Spinner = () => (
  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent align-middle" />
);

export default function App() {
  const [token, setToken] = useState('');
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'admin' });
  const [loginError, setLoginError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark' | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  const [barcode, setBarcode] = useState('');
  const [lookup, setLookup] = useState<Item | null>(null);
  const [externalLookup, setExternalLookup] = useState<ExternalProduct | null>(null);
  const [pendingIncrementItem, setPendingIncrementItem] = useState<Item | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<'capture' | 'inventory'>('capture');
  const [scannerOpen, setScannerOpen] = useState(false);

  const [status, setStatus] = useState<StatusBanner | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loginLoading, setLoginLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowActionType, setRowActionType] = useState<'extract' | 'delete' | null>(null);
  type SortKey = 'name' | 'barcode' | 'quantity' | 'updatedAt';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'updatedAt',
    direction: 'desc',
  });

  const authedFetch = useCallback(
    (path: string, options?: RequestInit) => {
      if (!token) throw new Error('Token missing');
      return fetch(`${API_BASE}${path}`, {
        ...(options ?? {}),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options?.headers ?? {}),
        },
      });
    },
    [token],
  );

  const showStatus = useCallback((type: StatusBanner['type'], text: string) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus({ type, text });
    statusTimer.current = setTimeout(() => setStatus(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  const [createForm, setCreateForm] = useState({
    name: '',
    barcode: '',
    categoryId: '',
    externalCategoryName: '',
    initialQuantity: 1,
  });

  const login = async (evt: FormEvent) => {
    evt.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await handleResponse<{ access_token: string }>(res);
      setToken(data.access_token);
      showStatus('success', 'Sesión iniciada');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login error');
    } finally {
      setLoginLoading(false);
    }
  };

  const fetchCategories = useCallback(async () => {
    const res = await authedFetch('/categories');
    setCategories(await handleResponse(res));
  }, [authedFetch]);

  const fetchInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const res = await authedFetch('/items');
      setItems(await handleResponse(res));
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error cargando inventario');
    } finally {
      setInventoryLoading(false);
    }
  }, [authedFetch, showStatus]);

  useEffect(() => {
    if (!token) return;
    fetchCategories().catch(() => {});
    fetchInventory().catch(() => {});
  }, [token, fetchCategories, fetchInventory]);

  useEffect(() => {
    setSelectedItems(new Set());
  }, [categoryFilter]);

  const lookupBarcode = async (value?: string) => {
    const target = value ?? barcode;
    if (!target) return;
    setLookup(null);
    setExternalLookup(null);
    setLookupLoading(true);
    try {
      const res = await authedFetch(`/items/barcode/${encodeURIComponent(target)}`);
      const found = await handleResponse<Item>(res);
      setLookup(found);
      setPendingIncrementItem(found);
      setBarcode('');
      setCreateForm((prev) => ({ ...prev, barcode: '', name: '', externalCategoryName: '' }));
      showStatus('info', 'Producto encontrado, confirmá para sumar al stock');
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
          categoryId:
            categories.find((cat) =>
              external.category
                ? cat.name.toLowerCase() === external.category.toLowerCase()
                : false,
            )?.id ?? prev.categoryId,
        }));
        showStatus(
          'info',
          external.source === 'enc'
            ? 'No existe en inventario, sugerencia de enc.finalq.xyz'
            : 'No existe, usamos datos externos',
        );
      } catch {
        setExternalLookup(null);
        setCreateForm((prev) => ({ ...prev, barcode: target }));
        showStatus('info', 'No existe, completá los datos para crearlo');
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const confirmIncrement = async () => {
    if (!pendingIncrementItem) return;
    setConfirmLoading(true);
    try {
      await authedFetch(`/items/${pendingIncrementItem.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta: 1, reason: 'Ingreso rápido' }),
      });
      setPendingIncrementItem(null);
      setLookup(null);
      showStatus('success', 'Stock actualizado');
      await fetchInventory();
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al ajustar stock');
    } finally {
      setConfirmLoading(false);
    }
  };

  const extractItem = async (id: string) => {
    setRowActionId(id);
    setRowActionType('extract');
    try {
      await authedFetch(`/items/${id}/extract`, { method: 'POST' });
      showStatus('success', 'Se extrajo una unidad');
      await fetchInventory();
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al extraer');
    } finally {
      setRowActionId(null);
      setRowActionType(null);
    }
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('¿Eliminar este item y su historial?')) return;
    setRowActionId(id);
    setRowActionType('delete');
    try {
      await authedFetch(`/items/${id}`, { method: 'DELETE' });
      showStatus('success', 'Item eliminado');
      await fetchInventory();
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setRowActionId(null);
      setRowActionType(null);
    }
  };

  const batchExtract = async () => {
    if (selectedItems.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selectedItems).map((id) =>
          authedFetch(`/items/${id}/extract`, { method: 'POST' }),
        ),
      );
      showStatus('success', 'Se extrajo 1 unidad de cada item seleccionado');
      setSelectedItems(new Set());
      await fetchInventory();
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error en extracción masiva');
    } finally {
      setBulkLoading(false);
    }
  };

  const batchDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!window.confirm('¿Eliminar todos los items seleccionados?')) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selectedItems).map((id) =>
          authedFetch(`/items/${id}`, { method: 'DELETE' }),
        ),
      );
      showStatus('success', 'Items eliminados');
      setSelectedItems(new Set());
      await fetchInventory();
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al eliminar en lote');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleScanned = async (code: string) => {
    setBarcode(code);
    setScannerOpen(false);
    await lookupBarcode(code);
  };

  const submitNewItem = async (evt: FormEvent) => {
    evt.preventDefault();
    setCreateLoading(true);
    try {
      const payload: Record<string, unknown> = { ...createForm };
      if (!createForm.categoryId) {
        delete payload.categoryId;
      }
      const externalCategory = createForm.externalCategoryName.trim();
      if (externalCategory) {
        payload.externalCategoryName = externalCategory;
      } else {
        delete payload.externalCategoryName;
      }
      await handleResponse(
        await authedFetch('/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
      showStatus('success', 'Item cargado');
      setCreateForm({
        name: '',
        barcode: '',
        categoryId: '',
        externalCategoryName: '',
        initialQuantity: 1,
      });
      setExternalLookup(null);
      const needsCategoryRefresh =
        !createForm.categoryId && !!createForm.externalCategoryName?.trim();
      if (needsCategoryRefresh) {
        await fetchCategories().catch(() => {});
      }
      await fetchInventory();
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al crear item');
    } finally {
      setCreateLoading(false);
    }
  };

  const sortedItems = useMemo(() => {
    const copy = [...items];
    const compare = (a: Item, b: Item) => {
      let aValue: string | number = '';
      let bValue: string | number = '';

      switch (sortConfig.key) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'barcode':
          aValue = a.barcode.toLowerCase();
          bValue = b.barcode.toLowerCase();
          break;
        case 'quantity':
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case 'updatedAt':
        default:
          aValue = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
          bValue = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
          break;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    };
    return copy.sort(compare);
  }, [items, sortConfig]);

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return sortedItems;
    return sortedItems.filter((item) => item.category?.id === categoryFilter);
  }, [sortedItems, categoryFilter]);

  const allFilteredSelected = useMemo(
    () => filteredItems.length > 0 && filteredItems.every((item) => selectedItems.has(item.id)),
    [filteredItems, selectedItems],
  );

  const toggleSelectAllFiltered = () => {
    const next = new Set(selectedItems);
    if (allFilteredSelected) {
      filteredItems.forEach((item) => next.delete(item.id));
    } else {
      filteredItems.forEach((item) => next.add(item.id));
    }
    setSelectedItems(next);
  };

  const toggleSelection = (id: string, nextChecked?: boolean) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      const shouldSelect = nextChecked ?? !prev.has(id);
      if (shouldSelect) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleMobileRowClick = (itemId: string, event: React.MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, a, select')) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 640px)').matches) {
      event.preventDefault();
      toggleSelection(itemId);
    }
  };

  const groupedItems = useMemo<[string, Item[]][]>(() => {
    if (categoryFilter !== 'all') {
      const label =
        filteredItems[0]?.category?.name ?? (filteredItems.length ? 'Sin categoría' : '');
      return label ? [[label, filteredItems]] : [];
    }
    const groups = new Map<string, Item[]>();
    filteredItems.forEach((item) => {
      const key = item.category?.name ?? 'Sin categoría';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries());
  }, [filteredItems, categoryFilter]);

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas las categorías' },
      ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
    ],
    [categories],
  );

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' },
    );
  };

  const sortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const renderCaptureTab = () => (
    <div className="space-y-4">
      <section className="card space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">
              Buscar / Escanear
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Escaneá con la cámara o tipeá el código para registrarlo al instante.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setScannerOpen(true)}
          >
            Usar cámara
          </button>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            className="input flex-1"
            placeholder="Código de barras"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={() => lookupBarcode()}
            disabled={lookupLoading}
          >
            {lookupLoading ? (
              <>
                <Spinner /> <span className="ml-2">Buscando</span>
              </>
            ) : (
              'Buscar'
            )}
          </button>
        </div>
        {lookup && (
          <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-bg)] p-3 text-sm text-[var(--accent-text)]">
            <p className="font-semibold">{lookup.name}</p>
            <p>Categoría: {lookup.category?.name ?? 'Sin categoría'}</p>
            <p>Stock actual: {lookup.quantity}</p>
            <p className="text-xs">
              Confirmá para sumar +1 al stock. Cancelá si fue un error.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={confirmIncrement}
                disabled={!pendingIncrementItem || confirmLoading}
              >
                {confirmLoading ? (
                  <>
                    <Spinner /> <span className="ml-2">Procesando</span>
                  </>
                ) : (
                  'Confirmar ingreso'
                )}
              </button>
              <button
                type="button"
                className="btn-muted flex-1"
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
          <div className="rounded-2xl border border-[var(--success-border)] bg-[var(--success-bg)] p-3 text-sm text-[var(--success-text)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {externalLookup.image && (
                <img
                  src={externalLookup.image}
                  alt={externalLookup.name}
                  className="h-24 w-24 rounded-xl object-cover"
                />
              )}
              <div className="space-y-1">
                <p className="font-semibold">{externalLookup.name}</p>
                {externalLookup.brand && <p>Marca: {externalLookup.brand}</p>}
                {externalLookup.category && <p>Categoría sugerida: {externalLookup.category}</p>}
                {externalLookup.quantity && <p>Presentación: {externalLookup.quantity}</p>}
                <p className="text-xs">
                  Datos sugeridos desde {externalLookup.source}. Completá y guardá para agregarlo.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Nuevo item</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submitNewItem}>
          <input
            className="input"
            placeholder="Nombre"
            required
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Código de barras"
            required
            value={createForm.barcode}
            onChange={(e) => setCreateForm({ ...createForm, barcode: e.target.value })}
          />
          <select
            aria-label="Categoría"
            className="input"
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
            className="input"
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
            className="input md:col-span-2"
            placeholder="Categoría externa (opcional)"
            value={createForm.externalCategoryName}
            onChange={(e) =>
              setCreateForm({ ...createForm, externalCategoryName: e.target.value })
            }
          />
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary w-full" disabled={createLoading}>
              {createLoading ? (
                <>
                  <Spinner /> <span className="ml-2">Guardando</span>
                </>
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );

  const renderInventoryTab = () => (
    <div className="space-y-4">
      <section className="card space-y-3 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Stock actual</h2>
            <p className="text-sm text-[var(--muted)]">
              Filtrá por categoría o seleccioná varias filas para operar en lote.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button className="btn-muted" onClick={() => fetchInventory()} disabled={inventoryLoading}>
              {inventoryLoading ? (
                <>
                  <Spinner /> <span className="ml-2">Actualizando</span>
                </>
              ) : (
                'Actualizar'
              )}
            </button>
            {categoryFilter === 'all' && filteredItems.length > 0 && (
              <button className="btn-small-muted" type="button" onClick={toggleSelectAllFiltered}>
                {allFilteredSelected ? 'Quitar selección global' : 'Seleccionar todos'}
              </button>
            )}
          </div>
        </div>
        {selectedItems.size > 0 && (
          <div
            className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-bg)] p-3 text-sm text-[var(--accent-text)]"
            data-testid="selection-banner"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p>{selectedItems.size} seleccionados</p>
              <button
                className="btn-small-primary"
                onClick={batchExtract}
                disabled={bulkLoading}
              >
                {bulkLoading ? 'Procesando...' : 'Extraer 1 c/u'}
              </button>
              <button
                className="btn-small-danger"
                onClick={batchDelete}
                disabled={bulkLoading}
              >
                {bulkLoading ? 'Procesando...' : 'Eliminar'}
              </button>
              <button className="btn-small-muted" onClick={() => setSelectedItems(new Set())}>
                Limpiar
              </button>
            </div>
          </div>
        )}
      </section>

      {inventoryLoading && (
        <div className="card p-4 text-sm text-[var(--muted)]">Cargando inventario...</div>
      )}

      {!inventoryLoading && groupedItems.length === 0 && (
        <div className="card p-4 text-sm text-[var(--muted)]">
          No hay items para la categoría seleccionada.
        </div>
      )}

      {!inventoryLoading &&
        groupedItems.map(([groupName, groupItems]) => (
          <section key={groupName} className="card space-y-3 p-4 md:p-6">
            {categoryFilter === 'all' && (
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {groupName}
                </h3>
              </div>
            )}
            <div className="overflow-x-auto rounded-2xl border border-[var(--card-border)]">
              <table className="inventory-table min-w-full text-left text-sm">
                <colgroup>
                  <col style={{ width: SELECT_COLUMN_WIDTH }} />
                  <col />
                  <col />
                  <col style={{ width: QUANTITY_COLUMN_WIDTH }} />
                  <col />
                  <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
                </colgroup>
                <thead className="bg-[var(--table-header)] text-[var(--muted-strong)]">
                  <tr>
                    <th className="py-3 pl-4 pr-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={
                          groupItems.every((item) => selectedItems.has(item.id)) &&
                          groupItems.length > 0
                        }
                        onChange={(e) => {
                          const { checked } = e.target;
                          const next = new Set(selectedItems);
                          groupItems.forEach((item) => {
                            if (checked) {
                              next.add(item.id);
                            } else {
                              next.delete(item.id);
                            }
                          });
                          setSelectedItems(next);
                        }}
                      />
                    </th>
                    <th className="py-3 px-4">
                      <button type="button" className="sort-button" onClick={() => handleSort('name')}>
                        Nombre <span className="sort-indicator">{sortIndicator('name')}</span>
                      </button>
                    </th>
                    <th className="py-3 px-4">
                      <button type="button" className="sort-button" onClick={() => handleSort('barcode')}>
                        Código <span className="sort-indicator">{sortIndicator('barcode')}</span>
                      </button>
                    </th>
                <th className="py-3 px-4">
                  <button type="button" className="sort-button" onClick={() => handleSort('quantity')}>
                    Stock <span className="sort-indicator">{sortIndicator('quantity')}</span>
                  </button>
                </th>
                <th className="py-3 px-4">
                  <button type="button" className="sort-button" onClick={() => handleSort('updatedAt')}>
                    Actualizado <span className="sort-indicator">{sortIndicator('updatedAt')}</span>
                  </button>
                </th>
                <th className="py-3 pr-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {groupItems.map((item) => (
                    <tr
                      key={item.id}
                      className={`inventory-row border-b border-[var(--card-border)] last:border-0 ${selectedItems.has(item.id) ? 'inventory-row-selected' : ''}`}
                      onClick={(e) => handleMobileRowClick(item.id, e)}
                    >
                      <td className="py-3 pl-4 pr-2" data-label="Seleccionar">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={(e) => toggleSelection(item.id, e.target.checked)}
                        />
                      </td>
                      <td className="py-3 px-4 font-medium" data-label="Nombre">
                        {item.name}
                      </td>
                      <td className="py-3 px-4" data-label="Código">
                        {item.barcode}
                      </td>
                  <td className="py-3 px-4" data-label="Stock">
                    {item.quantity}
                  </td>
                  <td className="py-3 px-4 text-[var(--muted)] text-xs" data-label="Actualizado">
                    {new Date(item.updatedAt ?? item.createdAt ?? '').toLocaleDateString()}
                  </td>
                      <td className="py-3 pr-4 text-right" data-label="Acciones">
                        <div className="flex justify-end gap-2">
                          <button
                            className="btn-small-primary"
                            onClick={() => extractItem(item.id)}
                            disabled={item.quantity <= 0 || rowActionId === item.id}
                          >
                            {rowActionId === item.id && rowActionType === 'extract'
                              ? '...'
                              : 'Extraer'}
                          </button>
                          <button
                            className="btn-small-danger"
                            onClick={() => deleteItem(item.id)}
                            disabled={rowActionId === item.id}
                          >
                            {rowActionId === item.id && rowActionType === 'delete'
                              ? '...'
                              : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </div>
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
        <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
          <section className="card space-y-4 p-6">
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Login</h2>
            <form className="space-y-3" onSubmit={login}>
              <label className="block text-sm font-medium text-[var(--muted)]">
                Usuario
                <input
                  className="input mt-1 w-full"
                  placeholder="Usuario"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-[var(--muted)]">
                Password
                <input
                  className="input mt-1 w-full"
                  type="password"
                  placeholder="Password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </label>
              {loginError && <p className="text-sm text-[var(--danger-text)]">{loginError}</p>}
              <button type="submit" className="btn-primary w-full" disabled={loginLoading}>
                {loginLoading ? (
                  <>
                    <Spinner /> <span className="ml-2">Ingresando</span>
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)] transition-colors">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
          <header className="card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Inventario</h1>
              <p className="text-sm text-[var(--muted)]">
                Escaneá o tipeá códigos para actualizar el stock. Consultá el inventario agrupado
                por categorías.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-muted" onClick={toggleTheme}>
                {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
              </button>
            </div>
          </header>

          <div className="flex gap-2 rounded-full bg-[var(--pill-bg)] p-1 text-sm font-medium text-[var(--muted)]">
            <button
              className={`flex-1 rounded-full px-4 py-2 ${
                tab === 'capture' ? 'bg-[var(--pill-active)] text-[var(--text-strong)]' : ''
              }`}
              onClick={() => setTab('capture')}
            >
              Buscar / Agregar
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-2 ${
                tab === 'inventory' ? 'bg-[var(--pill-active)] text-[var(--text-strong)]' : ''
              }`}
              onClick={() => setTab('inventory')}
            >
              Stocks
            </button>
          </div>

          {tab === 'capture' ? renderCaptureTab() : renderInventoryTab()}

          {status && (
            <div
              className={`fixed bottom-5 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-lg ${
                status.type === 'success'
                  ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
                  : status.type === 'error'
                    ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]'
                    : 'bg-[var(--accent-bg)] text-[var(--accent-text)] border-[var(--accent-border)]'
              }`}
            >
              {status.text}
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
