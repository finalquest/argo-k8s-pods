## Overview

Kubernetes manifests and Helm charts to run Android emulators on a cluster, with optional Intel iGPU acceleration via a dedicated Xorg pod, plus a Maestro-based test orchestrator. Argo CD Applications bootstrap monitoring with Prometheus.

## Repository structure

```
.
├─ android-emulators/
│  ├─ Chart.yaml                     # Helm chart for emulator pods
│  ├─ values.yaml                    # Defaults (GPU_MODE, resources, image, nodeSelector)
│  ├─ values-android13.yaml          # Profile overrides (Android 13)
│  ├─ values-android14.yaml          # Profile overrides (Android 14)
│  ├─ templates/
│  │  ├─ statefulset.yaml            # Emulator pod: mounts /dev/kvm, /dev/dri, X11 socket
│  │  ├─ service.yaml                # Headless service (ADB 5555, console 5554, VNC 5900, noVNC 6080)
│  │  └─ configmap.yaml              # Injects runner script
│  ├─ scripts/
│  │  └─ emulator.sh                 # Starts Xvfb (SW) or uses external Xorg (HW); ADB/socat bridge
│  ├─ dockerfiles/
│  │  ├─ android-13-base/ Dockerfile
│  │  ├─ android-13-hb/ Dockerfile, Dockerfile_gpu
│  │  ├─ android-14-base/ Dockerfile
│  │  └─ android-14-hb/ Dockerfile, Dockerfile_gpu
│  └─ redis/
│     ├─ deployment.yaml             # Redis (coordination/queue)
│     └─ service.yaml
│
├─ xorg/
│  ├─ statefulset.yaml               # Pod that runs Xorg on iGPU nodes; exports /var/lib/xorg/.X11-unix
│  └─ Dockerfile                     # Image for the Xorg helper
│
├─ maestro-orchestrator-chart/
│  ├─ Chart.yaml
│  ├─ values.yaml                    # Orchestrator configuration + secrets placeholders
│  └─ templates/
│     ├─ statefulset.yaml            # Templated env from values; mounts scripts
│     ├─ configmap.yaml              # runner.sh, runner_appium.sh, logger.sh
│     └─ secret.yaml                 # gitPat, gitAppiumPat (b64 from values)
│
├─ maestro-orchestrator/
│  └─ statefulset.yaml               # Legacy manifest (non-Helm)
│
├─ applications/
│  ├─ prometheus-stack.yaml          # Argo CD Application for kube-prometheus-stack
│  ├─ argocd-metrics.yaml            # Argo CD Application for Argo CD ServiceMonitor
│  └─ xorg.yaml                      # Argo CD Application for Xorg pod
│
├─ prometheus/
│  ├─ servicemonitor/servicemonitor.yaml  # Scrapes Argo CD server metrics
│  └─ prometheus-argocd-setup.md
│
├─ root-application.yaml             # Argo CD root app pointing to ./applications
├─ argo-k8s-pods.code-workspace
└─ docs & notes
   ├─ android-emulators/snapshot_generation.md
   └─ plan.md
```

## Components and flow

- **Xorg GPU pod** (`xorg/statefulset.yaml`)
  - Runs privileged on nodes labeled `gpu: intel`, binds `/dev/dri`, and publishes Xorg display on `/var/lib/xorg/.X11-unix`.
  - Detects Intel iGPU and configures modesetting + DRI3; fixed 1280x800 display.

- **Android emulator pods** (`android-emulators` chart)
  - StatefulSet mounts host `/dev/kvm` and `/dev/dri`, plus the Xorg UNIX socket path.
  - Two render modes via `env.GPU_MODE`:
    - `sw`: starts Xvfb inside the pod; software rendering (`swangle_indirect`).
    - `host`: uses external Xorg socket; hardware acceleration with Intel iGPU; runs emulator with `-gpu host`.
  - Exposes ADB (5555), console (5554), VNC (5900), noVNC (6080) via headless `Service`.
  - ADB is bridged from localhost to pod IP using `socat`.

- **Maestro orchestrator** (`maestro-orchestrator-chart`)
  - Helm chart that runs a test orchestrator container and injects runner scripts.
  - Config via `values.yaml` (Git URLs/branches, parallelism, Redis host/port, APK registry path).
  - PATs supplied through the chart’s `Secret` (values are base64-encoded by the template).

- **Argo CD Applications & Monitoring**
  - `root-application.yaml` bootstraps the `applications/` folder.
  - `applications/prometheus-stack.yaml` installs kube-prometheus-stack from the Prometheus Community Helm repo.
  - `applications/argocd-metrics.yaml` deploys a `ServiceMonitor` for the Argo CD server.
  - `applications/xorg.yaml` deploys the Xorg pod from this repository (`path: xorg`).

## Prerequisites

- Kubernetes nodes with:
  - KVM support (`/dev/kvm`) on workers that will run emulators.
  - Intel iGPU exposed as `/dev/dri/*` on nodes running Xorg.
- Node labels:
  - Emulators: `role: worker` by default (override via `values.yaml`).
  - Xorg: `gpu: intel`.
- Argo CD (optional but recommended for GitOps).
- Container registry hosting the emulator and orchestrator images.

## Quickstart

- Deploy Redis (same namespace as emulators):
```bash
kubectl apply -f android-emulators/redis/deployment.yaml
kubectl apply -f android-emulators/redis/service.yaml
```

- Deploy an emulator via Helm (Android 13 HW-accelerated example):
```bash
helm install emulator-13 ./android-emulators \
  -f android-emulators/values-android13.yaml \
  --set env.GPU_MODE=host \
  --set namespace=android-emulators
```

- Deploy Maestro orchestrator via Helm (provide secrets):
```bash
helm install orchestrator ./maestro-orchestrator-chart \
  --set secrets.gitPat="<base64 or plain, template encodes>" \
  --set secrets.gitAppiumPat="<base64 or plain, template encodes>"
```

- Bootstrap apps via Argo CD (includes Xorg and monitoring):
```bash
kubectl apply -f root-application.yaml
```

## Configuration highlights

- Emulator chart (`android-emulators/values.yaml`):
  - `env.GPU_MODE`: `sw` (default) or `host`.
  - `resources`: tune CPU/memory; defaults request ~2 vCPU and 3–5 GiB.
  - `nodeSelector`: schedule to desired workers.
- Xorg pod:
  - Exports `/var/lib/xorg/.X11-unix`; emulator mounts it at `/tmp/.X11-unix`.
  - Uses Mesa `iris` driver and Vulkan ICD if present.
- Orchestrator chart:
  - `config.*`: Git repo locations, branches, parallelism, Redis host/port, APK registry/path.
  - `secrets.gitPat`, `secrets.gitAppiumPat`: required.

## Security notes

- Xorg and emulator pods run `privileged` and mount host devices (`/dev/kvm`, `/dev/dri`). Scope these to a dedicated namespace and apply Pod Security Admission exceptions appropriately.

## Troubleshooting

- Hardware mode (`host`) black screen:
  - Ensure Xorg pod is running on an Intel iGPU node and `/var/lib/xorg/.X11-unix/X0` exists.
  - Inside emulator pod, `DISPLAY=:0 glxinfo -B` should show Intel renderer (not llvmpipe).
- ADB not reachable:
  - Confirm `socat` processes are running and the headless service has a pod endpoint.
- Scheduling:
  - Verify node labels and `nodeSelector` values match your cluster.

## Notes

- A legacy non-Helm orchestrator manifest exists at `maestro-orchestrator/statefulset.yaml`.
- The Prometheus stack source repo URL is configured in `applications/prometheus-stack.yaml`.
