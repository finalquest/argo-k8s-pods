# 📘 Prometheus + Argo CD: Plan de Implementación

Este documento describe cómo implementar **Prometheus** en un clúster Kubernetes (K3s), con foco en integrar métricas de **Argo CD** para observar el estado de tus aplicaciones.

---

## ✅ Objetivos

- Instalar Prometheus y configurar el scrapeo de Argo CD.
- Visualizar métricas como `argocd_app_health_status`.
- Configurar alertas para eventos como apps `Degraded`.
- Opcional: integrar con Grafana.

---

## 🧱 Requisitos

- Clúster Kubernetes funcionando (K3s).
- Argo CD instalado (namespace `argocd`).
- Helm v3+
- Acceso a `kubectl` con permisos de administrador.

---

## 📌 Tareas

### 🟩 Tarea 1 — Instalar Prometheus con Helm

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/prometheus \
  --namespace monitoring --create-namespace \
  --set alertmanager.persistentVolume.enabled=false \
  --set server.persistentVolume.enabled=false
```

---

### 🟩 Tarea 2 — Exponer métricas desde Argo CD

Asegurate de que Argo CD tenga habilitado el endpoint `/metrics`.

```bash
kubectl -n argocd get svc
```

Deberías ver un servicio como `argocd-metrics` o `argocd-application-controller`.

---

### 🟩 Tarea 3 — Configurar scrape de métricas de Argo CD

#### 🔁 Con Prometheus Operator:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: argocd-metrics
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: argocd-application-controller
  endpoints:
    - port: metrics
      interval: 30s
  namespaceSelector:
    matchNames:
      - argocd
```

#### 🔁 Sin Operator (Prometheus clásico):

Agregá al `prometheus.yml`:

```yaml
- job_name: 'argocd'
  metrics_path: /metrics
  static_configs:
    - targets: ['argocd-application-controller.argocd.svc.cluster.local:8082']
```

---

### 🟩 Tarea 4 — Validar scrape

```bash
kubectl -n monitoring port-forward svc/prometheus-server 9090
```

Abrí en el navegador:

```
http://localhost:9090
```

Buscá esta métrica:

```
argocd_app_health_status
```

---

### 🟩 Tarea 5 — Crear regla de alerta para apps degradadas

```yaml
groups:
  - name: argocd.rules
    rules:
      - alert: ArgoAppDegraded
        expr: argocd_app_health_status{health_status="Degraded"} == 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "App {{ $labels.app }} está Degraded"
          description: "La app {{ $labels.app }} en el proyecto {{ $labels.project }} está degradada."
```

---

### 🟩 Tarea 6 — (Opcional) Instalar Grafana y visualizar

```bash
helm install grafana grafana/grafana \
  --namespace monitoring \
  --set adminPassword='admin' \
  --set service.type=NodePort
```

Usá el siguiente dashboard:

> https://grafana.com/grafana/dashboards/14584

---

## 📦 Próximos pasos

- [ ] Habilitar `persistence` para Prometheus si vas a guardar histórico.
- [ ] Integrar `Alertmanager` con email, Discord, Slack o Webhooks.
- [ ] Crear dashboards específicos para tus emuladores Android.
- [ ] Scrape de tus propios apps (`/metrics` en apps propias).

---
