# Problema Conocido: Bloqueo de Workers con Límite de Capacidad

Fecha: 2025-08-30

## 1. Descripción del Problema

Se ha detectado un escenario de bloqueo (deadlock) cuando el pool de workers, configurado con un límite (`maxWorkers`), está lleno y los trabajos restantes en la cola requieren un entorno (combinación de `branch` y `client`) diferente al de los workers que están actualmente inactivos.

**Ejemplo del escenario:**

1.  `maxWorkers` está configurado en `1`.
2.  Se encola un `Test A` para la `Branch A`.
3.  Se crea el `Worker 1` para la `Branch A` y empieza a ejecutar el `Test A`.
4.  Se encola un `Test B` para la `Branch B`.
5.  El `Test A` finaliza. El `Worker 1` queda inactivo (status: `ready`).
6.  El sistema intenta asignar el `Test B`, pero el `Worker 1` no es compatible (es de la `Branch A`).
7.  Como el pool de workers está lleno (1/1), no se puede crear un nuevo worker para la `Branch B`.

**Resultado:** El sistema se queda bloqueado. El `Test B` permanece en la cola indefinidamente y el `Worker 1` se queda inactivo sin poder ser utilizado.

## 2. Causa Raíz

La función de asignación de trabajos (`assignJobToWorker`) no contempla un mecanismo para reemplazar un worker inactivo pero incompatible cuando el pool está lleno. Solo busca un worker compatible o crea uno nuevo si hay espacio.

## 3. Solución Propuesta

La solución consiste en hacer que la lógica de asignación sea más inteligente:

1.  Modificar la función `assignJobToWorker` dentro de `src/modules/worker-management/job-queue-manager.js`.
2.  Añadir una nueva lógica que se active cuando el pool de workers (gestionado por `WorkerPoolManager`) esté lleno.
3.  Esta lógica deberá detectar si hay workers inactivos que no son compatibles con ninguno de los trabajos que quedan en la cola.
4.  Si se encuentra un worker "inútil" o "stale", el sistema deberá iniciar su ciclo de terminación (`GENERATE_UNIFIED_REPORT` y luego `TERMINATE`) para liberar un espacio en el pool.
5.  El trabajo que no pudo ser asignado se devolverá a la cola y será procesado correctamente en el siguiente ciclo, una vez que el espacio quede libre y se pueda crear un nuevo worker compatible.
