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
const THEME_STORAGE_KEY = 'pantry-theme';
const SELECT_COLUMN_WIDTH = '48px';
const QUANTITY_COLUMN_WIDTH = '100px';
const ACTIONS_COLUMN_WIDTH = '22%';

type Category = {
  id: string;
  name: string;
};

type Location = {
  id: string;
  name: string;
};

type Unit = {
  id: string;
  name: string;
  abbreviation?: string;
};

type PantryItem = {
  id: string;
  name: string;
  barcode: string;
  description?: string;
  notes?: string;
  category: Category | null;
  location: Location | null;
  unit: Unit | null;
  quantity: number;
  minQuantity: number;
  expirationDate?: string;
  frozenAt?: string;
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

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getExpirationColor(days: number | null): string {
  if (days === null) return 'text-[var(--muted)]';
  if (days < 0) return 'text-red-600 font-semibold';
  if (days <= 3) return 'text-orange-500 font-semibold';
  if (days <= 7) return 'text-yellow-600';
  return 'text-green-600';
}

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
  const [extractBarcode, setExtractBarcode] = useState('');
  const [lookup, setLookup] = useState<PantryItem | null>(null);
  const [extractLookup, setExtractLookup] = useState<PantryItem | null>(null);
  const [externalLookup, setExternalLookup] = useState<ExternalProduct | null>(null);
  const [pendingIncrementItem, setPendingIncrementItem] = useState<PantryItem | null>(null);
  
  // Filters and data
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<PantryItem[]>([]);
  const [expiringItems, setExpiringItems] = useState<PantryItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<PantryItem[]>([]);
  
  const [tab, setTab] = useState<'capture' | 'extract' | 'inventory' | 'alerts'>('capture');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerContext, setScannerContext] = useState<'capture' | 'extract'>('capture');

  const [status, setStatus] = useState<StatusBanner | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loginLoading, setLoginLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [extractLookupLoading, setExtractLookupLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [extractConfirmLoading, setExtractConfirmLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowActionType, setRowActionType] = useState<'extract' | 'delete' | 'freeze' | 'thaw' | null>(null);

  // Estado para edición de items
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    notes: '',
    categoryId: '',
    locationId: '',
    unitId: '',
    minQuantity: 1,
    expirationDate: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  type SortKey = 'name' | 'barcode' | 'quantity' | 'expirationDate' | 'updatedAt';
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
    locationId: '',
    externalLocationName: '',
    unitId: '',
    externalUnitName: '',
    initialQuantity: 1,
    expirationDate: '',
    minQuantity: 1,
    description: '',
    notes: '',
  });

  const [showCreateForm, setShowCreateForm] = useState(false);

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

  const fetchLocations = useCallback(async () => {
    const res = await authedFetch('/locations');
    setLocations(await handleResponse(res));
  }, [authedFetch]);

  const fetchUnits = useCallback(async () => {
    const res = await authedFetch('/units');
    setUnits(await handleResponse(res));
  }, [authedFetch]);

  const fetchInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (locationFilter !== 'all') params.set('locationId', locationFilter);
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
      const res = await authedFetch(`/pantry-items?${params.toString()}`);
      setItems(await handleResponse(res));
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error cargando inventario');
    } finally {
      setInventoryLoading(false);
    }
  }, [authedFetch, showStatus, locationFilter, categoryFilter]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const [expiringRes, lowStockRes] = await Promise.all([
        authedFetch('/pantry-items/expiring-soon'),
        authedFetch('/pantry-items/low-stock'),
      ]);
      setExpiringItems(await handleResponse(expiringRes));
      setLowStockItems(await handleResponse(lowStockRes));
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error cargando alertas');
    } finally {
      setAlertsLoading(false);
    }
  }, [authedFetch, showStatus]);

  useEffect(() => {
    if (!token) return;
    fetchCategories().catch(() => {});
    fetchLocations().catch(() => {});
    fetchUnits().catch(() => {});
    fetchInventory().catch(() => {});
    fetchAlerts().catch(() => {});
  }, [token, fetchCategories, fetchLocations, fetchUnits, fetchInventory, fetchAlerts]);

  useEffect(() => {
    setSelectedItems(new Set());
  }, [categoryFilter, locationFilter]);

  const lookupBarcode = async (value?: string) => {
    const target = value ?? barcode;
    if (!target) return;
    setLookup(null);
    setExternalLookup(null);
    setShowCreateForm(false);
    setLookupLoading(true);
    try {
      const res = await authedFetch(`/pantry-items/barcode/${encodeURIComponent(target)}`);
      const found = await handleResponse<PantryItem>(res);
      setLookup(found);
      setPendingIncrementItem(found);
      setBarcode('');
      showStatus('info', `Producto "${found.name}" ya existe. ¿Querés agregar +1 unidad?`);
    } catch (err) {
      setLookup(null);
      setPendingIncrementItem(null);
      try {
        const externalRes = await authedFetch(`/pantry-items/lookup/${encodeURIComponent(target)}`);
        const external = await handleResponse<ExternalProduct>(externalRes);
        setExternalLookup(external);
        setCreateForm((prev) => ({
          ...prev,
          name: external.name ?? '',
          barcode: target,
          externalCategoryName: external.category ?? '',
          categoryId:
            categories.find((cat) =>
              external.category
                ? cat.name.toLowerCase() === external.category.toLowerCase()
                : false,
            )?.id ?? '',
        }));
        setShowCreateForm(true);
        showStatus('info', 'Producto no encontrado. Completá los datos para crearlo.');
      } catch {
        setExternalLookup(null);
        setCreateForm((prev) => ({ 
          ...prev, 
          barcode: target,
          name: '',
          categoryId: '',
          externalCategoryName: '',
          locationId: '',
          externalLocationName: '',
          unitId: '',
          externalUnitName: '',
          initialQuantity: 1,
          minQuantity: 1,
          expirationDate: '',
          description: '',
          notes: ''
        }));
        setShowCreateForm(true);
        showStatus('info', 'Producto no encontrado. Completá los datos para crearlo.');
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const lookupExtractBarcode = async (value?: string) => {
    const target = value ?? extractBarcode;
    if (!target) return;
    setExtractLookup(null);
    setExtractLookupLoading(true);
    try {
      const res = await authedFetch(`/pantry-items/barcode/${encodeURIComponent(target)}`);
      const found = await handleResponse<PantryItem>(res);
      setExtractLookup(found);
      setExtractBarcode('');
      showStatus('info', 'Producto listo para extraer 1 unidad');
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'No encontramos ese código');
    } finally {
      setExtractLookupLoading(false);
    }
  };

  const confirmIncrement = async () => {
    if (!pendingIncrementItem) return;
    setConfirmLoading(true);
    try {
      await authedFetch(`/pantry-items/${pendingIncrementItem.id}/stock`, {
        method: 'POST',
        body: JSON.stringify({ delta: 1, reason: 'Ingreso rápido' }),
      });
      setPendingIncrementItem(null);
      setLookup(null);
      showStatus('success', 'Stock actualizado');
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al ajustar stock');
    } finally {
      setConfirmLoading(false);
    }
  };

  const confirmExtractQuick = async () => {
    if (!extractLookup) return;
    setExtractConfirmLoading(true);
    try {
      await authedFetch(`/pantry-items/${extractLookup.id}/extract`, { method: 'POST' });
      showStatus('success', 'Se extrajo una unidad');
      setExtractLookup(null);
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'No se pudo extraer');
    } finally {
      setExtractConfirmLoading(false);
    }
  };

  const extractItem = async (id: string) => {
    setRowActionId(id);
    setRowActionType('extract');
    try {
      await authedFetch(`/pantry-items/${id}/extract`, { method: 'POST' });
      showStatus('success', 'Se extrajo una unidad');
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al extraer');
    } finally {
      setRowActionId(null);
      setRowActionType(null);
    }
  };

  const freezeItem = async (id: string) => {
    setRowActionId(id);
    setRowActionType('freeze');
    try {
      await authedFetch(`/pantry-items/${id}/freeze`, { method: 'POST' });
      showStatus('success', 'Producto congelado');
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al congelar');
    } finally {
      setRowActionId(null);
      setRowActionType(null);
    }
  };

  const thawItem = async (id: string) => {
    setRowActionId(id);
    setRowActionType('thaw');
    try {
      await authedFetch(`/pantry-items/${id}/thaw`, { method: 'POST' });
      showStatus('success', 'Producto descongelado');
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al descongelar');
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
      await authedFetch(`/pantry-items/${id}`, { method: 'DELETE' });
      showStatus('success', 'Item eliminado');
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setRowActionId(null);
      setRowActionType(null);
    }
  };

  const openEditModal = (item: PantryItem) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      description: item.description || '',
      notes: item.notes || '',
      categoryId: item.category?.id || '',
      locationId: item.location?.id || '',
      unitId: item.unit?.id || '',
      minQuantity: item.minQuantity,
      expirationDate: item.expirationDate || '',
    });
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditForm({
      name: '',
      description: '',
      notes: '',
      categoryId: '',
      locationId: '',
      unitId: '',
      minQuantity: 1,
      expirationDate: '',
    });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    
    setEditLoading(true);
    try {
      const payload: Record<string, unknown> = {};
      
      if (editForm.name !== editingItem.name) payload.name = editForm.name;
      if (editForm.description !== (editingItem.description || '')) payload.description = editForm.description || undefined;
      if (editForm.notes !== (editingItem.notes || '')) payload.notes = editForm.notes || undefined;
      if (editForm.categoryId !== editingItem.category?.id) payload.categoryId = editForm.categoryId || undefined;
      if (editForm.locationId !== editingItem.location?.id) payload.locationId = editForm.locationId || undefined;
      if (editForm.unitId !== editingItem.unit?.id) payload.unitId = editForm.unitId || undefined;
      if (editForm.minQuantity !== editingItem.minQuantity) payload.minQuantity = editForm.minQuantity;
      if (editForm.expirationDate !== (editingItem.expirationDate || '')) payload.expirationDate = editForm.expirationDate || undefined;
      
      if (Object.keys(payload).length === 0) {
        showStatus('info', 'No hay cambios para guardar');
        closeEditModal();
        return;
      }

      await authedFetch(`/pantry-items/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      
      showStatus('success', 'Item actualizado');
      closeEditModal();
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setEditLoading(false);
    }
  };

  const batchExtract = async () => {
    if (selectedItems.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selectedItems).map((id) =>
          authedFetch(`/pantry-items/${id}/extract`, { method: 'POST' }),
        ),
      );
      showStatus('success', 'Se extrajo 1 unidad de cada item seleccionado');
      setSelectedItems(new Set());
      await Promise.all([fetchInventory(), fetchAlerts()]);
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
          authedFetch(`/pantry-items/${id}`, { method: 'DELETE' }),
        ),
      );
      showStatus('success', 'Items eliminados');
      setSelectedItems(new Set());
      await Promise.all([fetchInventory(), fetchAlerts()]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al eliminar en lote');
    } finally {
      setBulkLoading(false);
    }
  };

  const openScanner = (context: 'capture' | 'extract') => {
    setScannerContext(context);
    setScannerOpen(true);
  };

  const handleScanned = async (code: string) => {
    setScannerOpen(false);
    if (scannerContext === 'capture') {
      setBarcode(code);
      await lookupBarcode(code);
    } else {
      setExtractBarcode(code);
      await lookupExtractBarcode(code);
    }
  };

  const submitNewItem = async (evt: FormEvent) => {
    evt.preventDefault();
    setCreateLoading(true);
    try {
      const payload: Record<string, unknown> = { ...createForm };
      
      // Clean empty strings
      if (!createForm.categoryId) delete payload.categoryId;
      if (!createForm.locationId) delete payload.locationId;
      if (!createForm.unitId) delete payload.unitId;
      if (!createForm.expirationDate) delete payload.expirationDate;
      if (!createForm.description) delete payload.description;
      if (!createForm.notes) delete payload.notes;
      
      const externalCategory = createForm.externalCategoryName.trim();
      if (externalCategory) {
        payload.externalCategoryName = externalCategory;
      } else {
        delete payload.externalCategoryName;
      }
      
      const externalLocation = createForm.externalLocationName.trim();
      if (externalLocation) {
        payload.externalLocationName = externalLocation;
      } else {
        delete payload.externalLocationName;
      }
      
      const externalUnit = createForm.externalUnitName.trim();
      if (externalUnit) {
        payload.externalUnitName = externalUnit;
      } else {
        delete payload.externalUnitName;
      }
      
      await handleResponse(
        await authedFetch('/pantry-items', {
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
        locationId: '',
        externalLocationName: '',
        unitId: '',
        externalUnitName: '',
        initialQuantity: 1,
        expirationDate: '',
        minQuantity: 1,
        description: '',
        notes: '',
      });
      setExternalLookup(null);
      
      // Refresh related data if needed
      const needsCategoryRefresh = !createForm.categoryId && !!createForm.externalCategoryName?.trim();
      const needsLocationRefresh = !createForm.locationId && !!createForm.externalLocationName?.trim();
      const needsUnitRefresh = !createForm.unitId && !!createForm.externalUnitName?.trim();
      
      await Promise.all([
        needsCategoryRefresh ? fetchCategories().catch(() => {}) : Promise.resolve(),
        needsLocationRefresh ? fetchLocations().catch(() => {}) : Promise.resolve(),
        needsUnitRefresh ? fetchUnits().catch(() => {}) : Promise.resolve(),
        fetchInventory(),
        fetchAlerts(),
      ]);
    } catch (err) {
      showStatus('error', err instanceof Error ? err.message : 'Error al crear item');
    } finally {
      setCreateLoading(false);
    }
  };

  const sortedItems = useMemo(() => {
    const copy = [...items];
    const compare = (a: PantryItem, b: PantryItem) => {
      let aValue: string | number | Date = '';
      let bValue: string | number | Date = '';

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
        case 'expirationDate':
          aValue = a.expirationDate ? new Date(a.expirationDate).getTime() : 0;
          bValue = b.expirationDate ? new Date(b.expirationDate).getTime() : 0;
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
    return sortedItems;
  }, [sortedItems]);

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

  const groupedItems = useMemo<[string, PantryItem[]][]>(() => {
    const groups = new Map<string, PantryItem[]>();
    filteredItems.forEach((item) => {
      const key = item.location?.name ?? 'Sin ubicación';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries());
  }, [filteredItems]);

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas las categorías' },
      ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
    ],
    [categories],
  );

  const locationOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas las ubicaciones' },
      ...locations.map((loc) => ({ value: loc.id, label: loc.name })),
    ],
    [locations],
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
            onClick={() => openScanner('capture')}
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
            <p>Ubicación: {lookup.location?.name ?? 'Sin ubicación'}</p>
            <p>Stock actual: {lookup.quantity} {lookup.unit?.abbreviation || lookup.unit?.name || ''}</p>
            {lookup.expirationDate && (
              <p>Vence: {formatDate(lookup.expirationDate)}</p>
            )}
            {lookup.frozenAt && (
              <p className="text-blue-600">Congelado el {formatDate(lookup.frozenAt)}</p>
            )}
            <p className="text-xs mt-2">
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

      {showCreateForm && (
      <section className="card space-y-4 p-4 md:p-6">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Nuevo item</h2>
          <button 
            type="button" 
            className="btn-small-muted"
            onClick={() => setShowCreateForm(false)}
          >
            Cancelar
          </button>
        </div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submitNewItem}>
          <input
            className="input"
            placeholder="Nombre *"
            required
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Código de barras *"
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
          <select
            aria-label="Ubicación"
            className="input"
            value={createForm.locationId}
            onChange={(e) => setCreateForm({ ...createForm, locationId: e.target.value })}
          >
            <option value="">Ubicación</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Unidad"
            className="input"
            value={createForm.unitId}
            onChange={(e) => setCreateForm({ ...createForm, unitId: e.target.value })}
          >
            <option value="">Unidad</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} {unit.abbreviation ? `(${unit.abbreviation})` : ''}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Cantidad inicial"
            type="number"
            min="0"
            value={createForm.initialQuantity}
            onChange={(e) =>
              setCreateForm({
                ...createForm,
                initialQuantity: Number(e.target.value) || 0,
              })
            }
          />
          <input
            className="input"
            placeholder="Cantidad mínima (alerta)"
            type="number"
            min="0"
            value={createForm.minQuantity}
            onChange={(e) =>
              setCreateForm({
                ...createForm,
                minQuantity: Number(e.target.value) || 0,
              })
            }
          />
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-[var(--muted)] mb-1">
              Fecha de vencimiento (opcional)
            </label>
            <input
              className="input w-full"
              placeholder="Seleccioná la fecha de vencimiento"
              type="date"
              value={createForm.expirationDate}
              onChange={(e) => setCreateForm({ ...createForm, expirationDate: e.target.value })}
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Te avisaremos cuando el producto esté próximo a vencer
            </p>
          </div>
          <input
            className="input"
            placeholder="Categoría (nueva si no existe)"
            value={createForm.externalCategoryName}
            onChange={(e) => setCreateForm({ ...createForm, externalCategoryName: e.target.value })}
          />
          <input
            className="input"
            placeholder="Ubicación (nueva si no existe)"
            value={createForm.externalLocationName}
            onChange={(e) => setCreateForm({ ...createForm, externalLocationName: e.target.value })}
          />
          <input
            className="input"
            placeholder="Unidad (nueva si no existe)"
            value={createForm.externalUnitName}
            onChange={(e) => setCreateForm({ ...createForm, externalUnitName: e.target.value })}
          />
          <input
            className="input md:col-span-2"
            placeholder="Descripción"
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
          />
          <input
            className="input md:col-span-2"
            placeholder="Notas"
            value={createForm.notes}
            onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
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
      )}
    </div>
  );

  const renderExtractTab = () => (
    <div className="space-y-4">
      <section className="card space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Sacar del stock</h2>
            <p className="text-sm text-[var(--muted)]">
              Escaneá un producto existente y confirmá para restar una unidad.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => openScanner('extract')}>
            Usar cámara
          </button>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            className="input flex-1"
            placeholder="Código de barras"
            value={extractBarcode}
            onChange={(e) => setExtractBarcode(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={() => lookupExtractBarcode()}
            disabled={extractLookupLoading}
          >
            {extractLookupLoading ? (
              <>
                <Spinner /> <span className="ml-2">Buscando</span>
              </>
            ) : (
              'Buscar'
            )}
          </button>
        </div>
        {extractLookup && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm">
            <p className="text-sm text-[var(--muted)]">Producto</p>
            <p className="text-lg font-semibold text-[var(--text-strong)]">{extractLookup.name}</p>
            <p className="text-sm text-[var(--muted)]">
              Stock actual: {extractLookup.quantity} {extractLookup.unit?.abbreviation || extractLookup.unit?.name || ''}
            </p>
            {extractLookup.expirationDate && (
              <p className="text-sm text-[var(--muted)]">
                Vence: {formatDate(extractLookup.expirationDate)}
              </p>
            )}
            {extractLookup.frozenAt && (
              <p className="text-sm text-blue-600">
                Congelado el {formatDate(extractLookup.frozenAt)}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-small-danger w-full rounded-full px-4 py-3 text-base font-semibold"
                onClick={confirmExtractQuick}
                disabled={extractConfirmLoading}
              >
                {extractConfirmLoading ? (
                  <>
                    <Spinner /> <span className="ml-2">Sacando…</span>
                  </>
                ) : (
                  'Sacar 1 unidad'
                )}
              </button>
              <button type="button" className="btn-muted w-full" onClick={() => setExtractLookup(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
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
              Filtrá por categoría y ubicación. Seleccioná varias filas para operar en lote.
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
            <select
              className="input"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              {locationOptions.map((opt) => (
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
            {filteredItems.length > 0 && (
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
          No hay items para los filtros seleccionados.
        </div>
      )}

      {!inventoryLoading &&
        groupedItems.map(([groupName, groupItems]) => (
          <section key={groupName} className="card space-y-3 p-4 md:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                {groupName}
              </h3>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[var(--card-border)]">
              <table className="inventory-table min-w-full text-left text-sm">
                <colgroup>
                  <col style={{ width: SELECT_COLUMN_WIDTH }} />
                  <col />
                  <col />
                  <col style={{ width: QUANTITY_COLUMN_WIDTH }} />
                  <col />
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
                      <button type="button" className="sort-button" onClick={() => handleSort('expirationDate')}>
                        Vencimiento <span className="sort-indicator">{sortIndicator('expirationDate')}</span>
                      </button>
                    </th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 pr-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {groupItems.map((item) => {
                    const daysToExpiry = daysUntil(item.expirationDate);
                    const isLowStock = item.minQuantity > 0 && item.quantity <= item.minQuantity;
                    return (
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
                          <span className={isLowStock ? 'text-orange-500 font-semibold' : ''}>
                            {item.quantity} {item.unit?.abbreviation || item.unit?.name || ''}
                            {isLowStock && ' ⚠️'}
                          </span>
                        </td>
                        <td className="py-3 px-4" data-label="Vencimiento">
                          <span className={getExpirationColor(daysToExpiry)}>
                            {formatDate(item.expirationDate)}
                            {daysToExpiry !== null && (
                              <span className="text-xs ml-1">
                                ({daysToExpiry < 0 ? `vencido hace ${Math.abs(daysToExpiry)} días` : 
                                   daysToExpiry === 0 ? 'vence hoy' : 
                                   `en ${daysToExpiry} días`})
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4" data-label="Estado">
                          {item.frozenAt ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              Congelado
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                              Fresco
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right" data-label="Acciones">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <button
                              className="btn-small-secondary"
                              onClick={() => openEditModal(item)}
                              disabled={rowActionId === item.id}
                            >
                              Editar
                            </button>
                            <button
                              className="btn-small-primary"
                              onClick={() => extractItem(item.id)}
                              disabled={item.quantity <= 0 || rowActionId === item.id}
                            >
                              {rowActionId === item.id && rowActionType === 'extract'
                                ? '...'
                                : 'Extraer'}
                            </button>
                            {item.frozenAt ? (
                              <button
                                className="btn-small-muted"
                                onClick={() => thawItem(item.id)}
                                disabled={rowActionId === item.id}
                              >
                                {rowActionId === item.id && rowActionType === 'thaw'
                                  ? '...'
                                  : 'Descongelar'}
                              </button>
                            ) : (
                              <button
                                className="btn-small-secondary"
                                onClick={() => freezeItem(item.id)}
                                disabled={rowActionId === item.id}
                              >
                                {rowActionId === item.id && rowActionType === 'freeze'
                                  ? '...'
                                  : 'Congelar'}
                              </button>
                            )}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      {/* Modal de edición */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-[var(--text-strong)]">
                  Editar: {editingItem.name}
                </h2>
                <button
                  type="button"
                  className="btn-small-muted"
                  onClick={closeEditModal}
                  disabled={editLoading}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={saveEdit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Nombre
                    </label>
                    <input
                      className="input w-full"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Categoría
                    </label>
                    <select
                      className="input w-full"
                      value={editForm.categoryId}
                      onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                    >
                      <option value="">Sin categoría</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Ubicación
                    </label>
                    <select
                      className="input w-full"
                      value={editForm.locationId}
                      onChange={(e) => setEditForm({ ...editForm, locationId: e.target.value })}
                    >
                      <option value="">Sin ubicación</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Unidad
                    </label>
                    <select
                      className="input w-full"
                      value={editForm.unitId}
                      onChange={(e) => setEditForm({ ...editForm, unitId: e.target.value })}
                    >
                      <option value="">Sin unidad</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} {unit.abbreviation ? `(${unit.abbreviation})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Cantidad mínima (alerta)
                    </label>
                    <input
                      className="input w-full"
                      type="number"
                      min="0"
                      value={editForm.minQuantity}
                      onChange={(e) => setEditForm({ ...editForm, minQuantity: Number(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Fecha de vencimiento
                    </label>
                    <input
                      className="input w-full"
                      type="date"
                      value={editForm.expirationDate}
                      onChange={(e) => setEditForm({ ...editForm, expirationDate: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Descripción
                    </label>
                    <input
                      className="input w-full"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--muted)] mb-1">
                      Notas
                    </label>
                    <input
                      className="input w-full"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    className="btn-primary flex-1"
                    disabled={editLoading}
                  >
                    {editLoading ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    className="btn-muted"
                    onClick={closeEditModal}
                    disabled={editLoading}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderAlertsTab = () => (
    <div className="space-y-4">
      <section className="card space-y-3 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Alertas</h2>
            <p className="text-sm text-[var(--muted)]">
              Productos próximos a vencer y con stock bajo.
            </p>
          </div>
          <button className="btn-muted" onClick={() => fetchAlerts()} disabled={alertsLoading}>
            {alertsLoading ? (
              <>
                <Spinner /> <span className="ml-2">Actualizando</span>
              </>
            ) : (
              'Actualizar'
            )}
          </button>
        </div>
      </section>

      {/* Expiring Items */}
      <section className="card space-y-3 p-4 md:p-6">
        <h3 className="text-md font-semibold text-[var(--text-strong)]">
          Próximos a vencer ({expiringItems.length})
        </h3>
        {expiringItems.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No hay productos próximos a vencer 🎉</p>
        ) : (
          <div className="space-y-2">
            {expiringItems.map((item) => {
              const days = daysUntil(item.expirationDate);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--card-border)] p-3"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {item.location?.name} • {item.quantity} {item.unit?.abbreviation || item.unit?.name || ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${getExpirationColor(days)}`}>
                      {formatDate(item.expirationDate)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {days !== null && (
                        days < 0 ? `Vencido` : days === 0 ? 'Vence hoy' : `En ${days} días`
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Low Stock Items */}
      <section className="card space-y-3 p-4 md:p-6">
        <h3 className="text-md font-semibold text-[var(--text-strong)]">
          Stock bajo ({lowStockItems.length})
        </h3>
        {lowStockItems.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Todo el stock está bien 🎉</p>
        ) : (
          <div className="space-y-2">
            {lowStockItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-[var(--card-border)] p-3"
              >
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.location?.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-orange-500">
                    {item.quantity} / {item.minQuantity} {item.unit?.abbreviation || item.unit?.name || ''}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Faltan {item.minQuantity - item.quantity} para stock mínimo
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
        <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
          <section className="card space-y-4 p-6">
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Login - Pantry</h2>
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
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
          <header className="card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Pantry</h1>
              <p className="text-sm text-[var(--muted)]">
                Gestión de despensa y cocina. Controlá vencimientos, stock y ubicaciones.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-muted" onClick={toggleTheme}>
                {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
              </button>
            </div>
          </header>

          <div className="flex gap-2 rounded-full bg-[var(--pill-bg)] p-1 text-sm font-medium text-[var(--muted)] overflow-x-auto">
            <button
              className={`flex-1 rounded-full px-4 py-2 whitespace-nowrap ${
                tab === 'capture' ? 'bg-[var(--pill-active)] text-[var(--text-strong)]' : ''
              }`}
              onClick={() => setTab('capture')}
            >
              Buscar / Agregar
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-2 whitespace-nowrap ${
                tab === 'extract' ? 'bg-[var(--pill-active)] text-[var(--text-strong)]' : ''
              }`}
              onClick={() => setTab('extract')}
            >
              Sacar
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-2 whitespace-nowrap ${
                tab === 'inventory' ? 'bg-[var(--pill-active)] text-[var(--text-strong)]' : ''
              }`}
              onClick={() => setTab('inventory')}
            >
              Inventario
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-2 whitespace-nowrap ${
                tab === 'alerts' ? 'bg-[var(--pill-active)] text-[var(--text-strong)]' : ''
              }`}
              onClick={() => setTab('alerts')}
            >
              Alertas
            </button>
          </div>

          {tab === 'capture'
            ? renderCaptureTab()
            : tab === 'extract'
              ? renderExtractTab()
              : tab === 'inventory'
                ? renderInventoryTab()
                : renderAlertsTab()}

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
