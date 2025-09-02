# Plan de Implementación: Orquestador Web

## 1. Objetivo

Crear un servicio web persistente que actúe como una interfaz de usuario y un orquestador para lanzar tests de Appium. No ejecuta tests directamente, sino que delega esta tarea a `Jobs` de Kubernetes efímeros.

## 2. Tecnología

*   **Backend:** Node.js con Express.js
*   **Comunicación en Tiempo Real:** Socket.IO
*   **Integración con Kubernetes:** Librería oficial `@kubernetes/client-node`
*   **Interacción con Git:** Librería `simple-git` o similar para operaciones de solo lectura.

## 3. Responsabilidades

### a. Servir la Interfaz de Usuario (UI)
*   Exponer una página `index.html` simple que será el frontend de la aplicación.

### b. Poblar la UI con Datos de Git
*   **Listar Branches:** Exponer un endpoint de API (`GET /api/branches`).
*   **Listar Features:** Exponer un endpoint (`GET /api/features?branch=...&client=...`).

### c. Orquestar Jobs (con Cola de Ejecución)
*   Al recibir una solicitud de ejecución, el job **se añade a una cola interna**.
*   El orquestador gestiona un **límite de ejecuciones en paralelo** (configurable vía variables de entorno, ej. `MAX_PARALLEL_TESTS`).
*   Si hay un slot de ejecución libre, se toma el siguiente job de la cola y se procesa.
*   Para la **Fase 1 (Local)**, procesar significa ejecutar el script `feature-runner.sh` localmente.
*   Para la **Fase 2 (Kubernetes)**, procesar significa crear un `Job` de K8s y hacer streaming de sus logs.
*   Cuando un job termina, se libera un slot y se intenta procesar el siguiente item de la cola.

### d. Retransmitir Logs al Cliente
*   Utilizar Socket.IO para retransmitir cada línea de log al frontend conectado.

## 4. Manifiestos de Kubernetes Asociados

(Sin cambios)

---

## 5. Pasos de Implementación (Enfoque Local-Primero)

### Fase 1: Desarrollo y Pruebas Locales

**Paso 1.4: Implementación del Runner Local (con Cola)**
1.  En `server.js`, configurar una cola (un array) para los tests pendientes y un contador para los tests activos.
2.  Leer el límite de paralelismo desde una variable de entorno (`MAX_PARALLEL_TESTS`).
3.  Al recibir el evento `run_test`, en lugar de ejecutarlo directamente, añadir el test a la cola y llamar a una función `processQueue()`.
4.  La función `processQueue()` comprueba si hay tests en la cola y si hay slots de ejecución libres. Si es así, saca un test de la cola, lo ejecuta con `child_process`, e incrementa el contador de activos.
5.  Cuando un `child_process` termina, se decrementa el contador de activos y se vuelve a llamar a `processQueue()` para ver si puede empezar el siguiente.

(El resto de los pasos se mantienen igual, pero la implementación del runner se vuelve más sofisticada).

### Fase 2: Contenerización y Despliegue en Kubernetes

(Sin cambios en la estrategia general, solo que la función `runTestInKubernetes` también será llamada por el gestor de la cola `processQueue`).