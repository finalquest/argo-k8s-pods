# Features - Histórico y Reportes

## 📋 Visión General

El sistema de histórico y reportes permite almacenar, organizar y consultar los resultados de ejecuciones de pruebas anteriores. Utiliza Allure Reports para generar reportes detallados y mantiene un histórico organizado por branch, feature y timestamp, permitiendo el análisis de tendencias y la comparación de ejecuciones a lo largo del tiempo.

## 🏗️ Arquitectura del Sistema

### 1. Estructura de Almacenamiento

```bash
# Estructura de directorios de reportes
public/reports/
├── branch-1/
│   ├── feature-a/
│   │   ├── 2025-01-09T10-30-00Z/
│   │   │   ├── index.html
│   │   │   ├── data/
│   │   │   └── export/
│   │   ├── 2025-01-09T11-45-00Z/
│   │   │   └── ...
│   ├── feature-b/
│   │   └── ...
├── branch-2/
│   └── ...
└── archive/  # Reportes antiguos comprimidos
```

### 2. Componentes del Sistema

```javascript
// Arquitectura de histórico y reportes
const HistorySystem = {
  Storage: {
    FileSystem: 'Estructura jerárquica',
    Archive: 'Compresión y almacenamiento',
    Cleanup: 'Rotación automática',
  },
  Reports: {
    Allure: 'Generación de reportes',
    Index: 'Índice de ejecuciones',
    Summary: 'Resúmenes y métricas',
  },
  API: {
    Endpoints: 'Servicios REST',
    Filtering: 'Filtros por branch/feature',
    Download: 'Exportación de datos',
  },
};
```

## 🔧 Backend - Manejo de Reportes

### 1. Generación y Almacenamiento

```javascript
// server.js - Manejo de reportes Allure
function handleReport(job, reportPath) {
  try {
    const branch = sanitize(job.branch);
    const feature = sanitize(job.feature);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destDir = path.join(
      __dirname,
      'public',
      'reports',
      branch,
      feature,
      timestamp,
    );

    // Crear directorio y copiar reporte
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(reportPath, destDir, { recursive: true });

    console.log(`Reporte copiado a ${destDir}`);

    // Limpiar reportes antiguos
    const featureReportDir = path.join(
      __dirname,
      'public',
      'reports',
      branch,
      feature,
    );
    cleanupOldReports(featureReportDir);

    return `/reports/${branch}/${feature}/${timestamp}/`;
  } catch (error) {
    console.error('Error al manejar el reporte de Allure:', error);
    return null;
  }
}
```

### 2. Limpieza Automática

```javascript
// server.js - Rotación de reportes
function cleanupOldReports(featureReportDir) {
  const maxReports = parseInt(process.env.MAX_REPORTS_PER_FEATURE, 10) || 5;
  if (!fs.existsSync(featureReportDir)) return;

  const reports = fs
    .readdirSync(featureReportDir)
    .map((name) => ({ name, path: path.join(featureReportDir, name) }))
    .filter((item) => fs.statSync(item.path).isDirectory())
    .map((item) => ({ ...item, time: fs.statSync(item.path).mtime.getTime() }))
    .sort((a, b) => a.time - b.time); // Ordenar del más antiguo al más reciente

  if (reports.length > maxReports) {
    const reportsToDelete = reports.slice(0, reports.length - maxReports);
    reportsToDelete.forEach((report) => {
      fs.rm(report.path, { recursive: true, force: true }, (err) => {
        if (err) {
          console.error(
            `Error eliminando reporte antiguo ${report.path}:`,
            err,
          );
        } else {
          console.log(`Reporte antiguo eliminado: ${report.name}`);
        }
      });
    });
  }
}
```

### 3. API Endpoints

```javascript
// server.js - Endpoints de histórico
app.get('/api/history/branches', (req, res) => {
  const reportsDir = path.join(__dirname, 'public', 'reports');
  if (!fs.existsSync(reportsDir)) {
    return res.json([]);
  }

  try {
    const branches = fs
      .readdirSync(reportsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
    res.json(branches);
  } catch (error) {
    console.error('Error al leer las branches del historial:', error);
    res
      .status(500)
      .json({ error: 'Error interno al leer las branches del historial.' });
  }
});

app.get('/api/history', (req, res) => {
  const { branch: branchFilter } = req.query;
  const reportsDir = path.join(__dirname, 'public', 'reports');
  if (!fs.existsSync(reportsDir)) {
    return res.json([]);
  }

  try {
    const history = [];
    const branches = fs
      .readdirSync(reportsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const branch of branches) {
      if (branchFilter && branch !== branchFilter) {
        continue;
      }

      const branchPath = path.join(reportsDir, branch);
      const features = fs
        .readdirSync(branchPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const feature of features) {
        const featurePath = path.join(branchPath, feature);
        const timestamps = fs
          .readdirSync(featurePath, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        for (const timestamp of timestamps) {
          history.push({
            branch: branch,
            feature: feature,
            timestamp: timestamp,
            reportUrl: `/reports/${branch}/${feature}/${timestamp}/`,
          });
        }
      }
    }

    // Ordenar por timestamp (más reciente primero)
    history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json(history);
  } catch (error) {
    console.error('Error al leer el historial de reportes:', error);
    res.status(500).json({ error: 'Error interno al leer el historial.' });
  }
});
```

## 🎨 Frontend - Interfaz de Histórico

### 1. Carga de Histórico

```javascript
// public/js/api.js - Carga de datos
export async function loadHistoryBranches() {
  const historyBranchFilter = document.getElementById('history-branch-filter');
  try {
    const response = await fetch('/api/history/branches');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const branches = await response.json();

    // Limpiar opciones existentes excepto la primera ("Todas")
    while (historyBranchFilter.options.length > 1) {
      historyBranchFilter.remove(1);
    }

    branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = branch;
      option.textContent = branch;
      historyBranchFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar las branches del historial:', error);
  }
}

export async function loadHistory(branch = '') {
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '<li>Cargando historial...</li>';

  try {
    const url = branch ? `/api/history?branch=${branch}` : '/api/history';
    const response = await fetch(url);
    const history = await response.json();

    historyList.innerHTML = '';
    if (history.length === 0) {
      historyList.innerHTML =
        '<li>No hay historial de reportes para esta selección.</li>';
    }

    history.forEach((item) => {
      const li = renderHistoryItem(item);
      historyList.appendChild(li);
    });
  } catch (error) {
    console.error('Error al cargar el historial:', error);
    historyList.innerHTML = '<li>Error al cargar el historial.</li>';
  }
}
```

### 2. Renderizado de Items

```javascript
// public/js/ui.js - Componente de histórico
export function renderHistoryItem(item) {
  const li = document.createElement('li');

  const infoDiv = document.createElement('div');
  infoDiv.style.display = 'flex';
  infoDiv.style.alignItems = 'center';
  infoDiv.style.gap = '1em';

  const textSpan = document.createElement('span');
  textSpan.textContent = `${item.feature} (${item.branch}) - ${item.timestamp}`;

  infoDiv.appendChild(textSpan);
  li.appendChild(infoDiv);

  if (item.reportUrl) {
    const reportButton = document.createElement('button');
    reportButton.className = 'report-btn';
    reportButton.textContent = 'Ver Reporte';
    reportButton.onclick = () => {
      window.open(
        item.reportUrl,
        'reportPopup',
        'width=1200,height=800,scrollbars=yes,resizable=yes',
      );
    };
    li.appendChild(reportButton);
  }

  return li;
}
```

### 3. Integración con la UI Principal

```javascript
// public/js/main.js - Inicialización
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar componentes de histórico
  initializeHistoryComponents();

  // Cargar datos iniciales
  loadHistoryBranches();
  loadHistory();
});

function initializeHistoryComponents() {
  const historyBranchFilter = document.getElementById('history-branch-filter');
  const refreshHistoryBtn = document.getElementById('refresh-history-btn');

  // Evento de cambio de filtro
  historyBranchFilter.addEventListener('change', () => {
    const selectedBranch = historyBranchFilter.value;
    loadHistory(selectedBranch);
  });

  // Evento de refresco
  refreshHistoryBtn.addEventListener('click', () => {
    const selectedBranch = historyBranchFilter.value;
    loadHistoryBranches();
    loadHistory(selectedBranch);
  });
}
```

## 📊 Visualización de Reportes

### 1. Visor de Reportes Allure

```javascript
// public/js/report-viewer.js - Visor de reportes
class ReportViewer {
  constructor() {
    this.currentReport = null;
    this.viewerWindow = null;
  }

  openReport(reportUrl) {
    // Cerrar ventana existente si está abierta
    if (this.viewerWindow && !this.viewerWindow.closed) {
      this.viewerWindow.close();
    }

    // Abrir nueva ventana para el reporte
    this.viewerWindow = window.open(
      reportUrl,
      'reportViewer',
      'width=1200,height=800,scrollbars=yes,resizable=yes',
    );

    // Monitorear cierre de ventana
    this.viewerWindow.onbeforeunload = () => {
      this.viewerWindow = null;
    };
  }

  closeReport() {
    if (this.viewerWindow && !this.viewerWindow.closed) {
      this.viewerWindow.close();
    }
    this.viewerWindow = null;
  }
}

// Instancia global
const reportViewer = new ReportViewer();
window.reportViewer = reportViewer;
```

### 2. Estilos para Histórico

```css
/* public/css/styles.css - Estilos de histórico */
.history-container {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 20px 0;
}

.history-controls {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  align-items: center;
}

.history-branch-filter {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  font-size: 14px;
}

.refresh-history-btn {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.refresh-history-btn:hover {
  background: #0056b3;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  margin: 10px 0;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  transition: all 0.3s;
}

.history-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.history-info {
  flex: 1;
}

.history-feature {
  font-weight: bold;
  color: #333;
}

.history-branch {
  color: #666;
  font-size: 14px;
}

.history-timestamp {
  color: #999;
  font-size: 12px;
}

.report-btn {
  padding: 8px 16px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.report-btn:hover {
  background: #218838;
}

/* Estados de carga */
.history-loading {
  text-align: center;
  padding: 40px;
  color: #666;
}

.history-empty {
  text-align: center;
  padding: 40px;
  color: #999;
  font-style: italic;
}
```

## 📈 Análisis y Métricas

### 1. Extracción de Métricas

```javascript
// public/js/analytics.js - Análisis de histórico
class HistoryAnalytics {
  constructor() {
    this.historyData = [];
  }

  async loadHistory(branch = '') {
    try {
      const url = branch ? `/api/history?branch=${branch}` : '/api/history';
      const response = await fetch(url);
      this.historyData = await response.json();
      return this.historyData;
    } catch (error) {
      console.error('Error cargando histórico para análisis:', error);
      return [];
    }
  }

  getExecutionTrends(featureName, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.historyData
      .filter((item) => {
        const itemDate = new Date(item.timestamp.replace(/-/g, ':'));
        return item.feature === featureName && itemDate > cutoff;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  getSuccessRate(branch = '') {
    const filteredData = branch
      ? this.historyData.filter((item) => item.branch === branch)
      : this.historyData;

    // Aquí se podría integrar con datos de resultados de tests
    // Por ahora, devuelve estadísticas básicas
    return {
      total: filteredData.length,
      byBranch: this.groupByBranch(filteredData),
      byFeature: this.groupByFeature(filteredData),
    };
  }

  groupByBranch(data) {
    return data.reduce((acc, item) => {
      acc[item.branch] = (acc[item.branch] || 0) + 1;
      return acc;
    }, {});
  }

  groupByFeature(data) {
    return data.reduce((acc, item) => {
      acc[item.feature] = (acc[item.feature] || 0) + 1;
      return acc;
    }, {});
  }
}

// Instancia global
const historyAnalytics = new HistoryAnalytics();
window.historyAnalytics = historyAnalytics;
```

### 2. Visualización de Tendencias

```javascript
// public/js/charts.js - Gráficos de histórico
function renderExecutionChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Preparar datos para el gráfico
  const chartData = prepareChartData(data);

  // Renderizar gráfico simple (puede reemplazarse con Chart.js o similar)
  renderSimpleChart(ctx, chartData);
}

function prepareChartData(data) {
  // Agrupar ejecuciones por día
  const dailyExecutions = {};

  data.forEach((item) => {
    const date = item.timestamp.split('T')[0];
    dailyExecutions[date] = (dailyExecutions[date] || 0) + 1;
  });

  return {
    labels: Object.keys(dailyExecutions).sort(),
    values: Object.keys(dailyExecutions)
      .sort()
      .map((date) => dailyExecutions[date]),
  };
}

function renderSimpleChart(ctx, data) {
  const padding = 40;
  const width = ctx.canvas.width - 2 * padding;
  const height = ctx.canvas.height - 2 * padding;

  // Limpiar canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (data.values.length === 0) return;

  // Encontrar valor máximo
  const maxValue = Math.max(...data.values);
  const barWidth = width / data.values.length;

  // Dibujar barras
  data.values.forEach((value, index) => {
    const barHeight = (value / maxValue) * height;
    const x = padding + index * barWidth;
    const y = padding + height - barHeight;

    // Dibujar barra
    ctx.fillStyle = '#007bff';
    ctx.fillRect(x, y, barWidth - 2, barHeight);

    // Dibujar valor
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(value.toString(), x + barWidth / 2, y - 5);
  });

  // Dibujar etiquetas
  ctx.fillStyle = '#666';
  ctx.font = '10px Arial';
  data.labels.forEach((label, index) => {
    const x = padding + index * barWidth + barWidth / 2;
    const y = padding + height + 15;
    ctx.fillText(label, x, y);
  });
}
```

## 🗄️ Archivo y Exportación

### 1. Sistema de Archivo

```javascript
// server.js - Archivo de reportes antiguos
function archiveOldReports() {
  const reportsDir = path.join(__dirname, 'public', 'reports');
  const archiveDir = path.join(reportsDir, 'archive');
  const archiveThreshold = 30; // Días

  if (!fs.existsSync(reportsDir)) return;

  const now = new Date();

  // Recorrer branches
  const branches = fs
    .readdirSync(reportsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  branches.forEach((branch) => {
    const branchPath = path.join(reportsDir, branch);

    // Recorrer features
    const features = fs
      .readdirSync(branchPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    features.forEach((feature) => {
      const featurePath = path.join(branchPath, feature);

      // Encontrar reportes antiguos
      const reports = fs
        .readdirSync(featurePath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => ({
          name: dirent.name,
          path: path.join(featurePath, dirent.name),
          stat: fs.statSync(path.join(featurePath, dirent.name)),
        }))
        .filter((report) => {
          const reportAge = (now - report.stat.mtime) / (1000 * 60 * 60 * 24);
          return reportAge > archiveThreshold;
        });

      if (reports.length > 0) {
        archiveReports(branch, feature, reports);
      }
    });
  });
}

function archiveReports(branch, feature, reports) {
  const archiveDir = path.join(__dirname, 'public', 'reports', 'archive');
  const archivePath = path.join(
    archiveDir,
    `${branch}-${feature}-${Date.now()}.zip`,
  );

  fs.mkdirSync(archiveDir, { recursive: true });

  const output = fs.createWriteStream(archivePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  reports.forEach((report) => {
    archive.directory(report.path, `${branch}/${feature}/${report.name}`);
  });

  archive.finalize();

  output.on('close', () => {
    // Eliminar reportes originales
    reports.forEach((report) => {
      fs.rmSync(report.path, { recursive: true, force: true });
    });
    console.log(`Reportes archivados: ${archivePath}`);
  });
}
```

### 2. Exportación de Datos

```javascript
// server.js - Exportación de histórico
app.get('/api/history/export', (req, res) => {
  const { branch, format = 'json' } = req.query;

  try {
    const history = getHistoryData(branch);

    switch (format) {
      case 'csv':
        exportAsCSV(res, history);
        break;
      case 'json':
      default:
        exportAsJSON(res, history);
        break;
    }
  } catch (error) {
    console.error('Error exportando histórico:', error);
    res.status(500).json({ error: 'Error al exportar histórico' });
  }
});

function exportAsJSON(res, history) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="history-${Date.now()}.json"`,
  );
  res.json(history);
}

function exportAsCSV(res, history) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="history-${Date.now()}.csv"`,
  );

  const header = 'Branch,Feature,Timestamp,Report URL\n';
  const rows = history
    .map(
      (item) =>
        `${item.branch},${item.feature},${item.timestamp},${item.reportUrl}`,
    )
    .join('\n');

  res.send(header + rows);
}
```

## 🔍 Búsqueda y Filtrado

### 1. Búsqueda Avanzada

```javascript
// public/js/history-search.js - Búsqueda en histórico
class HistorySearch {
  constructor() {
    this.searchInput = document.getElementById('history-search');
    this.filterDate = document.getElementById('history-date-filter');
    this.filterStatus = document.getElementById('history-status-filter');
  }

  initialize() {
    this.searchInput.addEventListener('input', () => this.performSearch());
    this.filterDate.addEventListener('change', () => this.performSearch());
    this.filterStatus.addEventListener('change', () => this.performSearch());
  }

  async performSearch() {
    const searchTerm = this.searchInput.value.toLowerCase();
    const dateFilter = this.filterDate.value;
    const statusFilter = this.filterStatus.value;

    try {
      const response = await fetch('/api/history');
      let history = await response.json();

      // Aplicar filtros
      if (searchTerm) {
        history = history.filter(
          (item) =>
            item.feature.toLowerCase().includes(searchTerm) ||
            item.branch.toLowerCase().includes(searchTerm),
        );
      }

      if (dateFilter) {
        const filterDate = new Date(dateFilter);
        history = history.filter((item) => {
          const itemDate = new Date(item.timestamp.replace(/-/g, ':'));
          return itemDate.toDateString() === filterDate.toDateString();
        });
      }

      // Actualizar UI con resultados filtrados
      this.displaySearchResults(history);
    } catch (error) {
      console.error('Error en búsqueda de histórico:', error);
    }
  }

  displaySearchResults(results) {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (results.length === 0) {
      historyList.innerHTML = '<li>No se encontraron resultados.</li>';
      return;
    }

    results.forEach((item) => {
      const li = renderHistoryItem(item);
      historyList.appendChild(li);
    });
  }
}

// Inicializar búsqueda
const historySearch = new HistorySearch();
historySearch.initialize();
```

## 📖 Documentos Relacionados

- [01-arquitectura-general.md](../01-arquitectura-general.md) - Arquitectura general
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
- [03-frontend/01-module-overview.md](../03-frontend/01-module-overview.md) - Módulos del frontend
- [04-features/01-test-execution.md](./01-test-execution.md) - Ejecución de tests
- [04-features/02-workspace-management.md](./02-workspace-management.md) - Gestión de workspaces
- [04-features/07-real-time-progress-indicators.md](./07-real-time-progress-indicators.md) - Indicadores de progreso
