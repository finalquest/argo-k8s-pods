# Plan de Futuro: Almacenamiento a Largo Plazo de Reportes

## 1. Objetivo

Evolucionar la arquitectura para desacoplar el almacenamiento de los artefactos de test (reportes de Allure, logs) del sistema de archivos local del servidor orquestador. El objetivo es persistir estos artefactos en una solución de almacenamiento en la nube (Object Storage), asegurando su durabilidad, escalabilidad y alta disponibilidad.

**Nota:** Este es un plan para una fase avanzada de desarrollo, a ser considerada una vez que las funcionalidades de reportes y el historial de ejecuciones estén maduras.

---

## 2. Racional y Beneficios

El almacenamiento local en `public/reports` es una excelente solución para empezar, pero presenta limitaciones a futuro:

- **Escalabilidad:** El disco del servidor se convierte en un cuello de botella. No podemos almacenar un historial infinito de reportes.
- **Durabilidad:** Si el servidor falla o el disco se corrompe, se pierden todos los artefactos históricos.
- **Arquitecturas Efímeras:** Impide ejecutar el orquestador en contenedores (Docker, Kubernetes) donde el sistema de archivos local es efímero y se destruye con el contenedor.

Migrar a un almacenamiento en la nube resuelve estos problemas, permitiendo que el orquestador sea un servicio "sin estado" (stateless) en lo que respecta a los artefactos.

---

## 3. Arquitectura Propuesta

### a. Tecnología

- **Cloud Object Storage:** La solución estándar para este caso de uso. Las opciones principales son:
    - **Amazon S3 (AWS)**
    - **Google Cloud Storage (GCS)**
    - **Azure Blob Storage**
- La implementación se haría a través del SDK oficial del proveedor elegido para Node.js (ej. `aws-sdk`, `@google-cloud/storage`).

### b. Flujo de Trabajo de Almacenamiento

El proceso de guardado de un reporte se extendería con un paso final de "publicación".

```mermaid
sequenceDiagram
    participant Orchestrator as Orchestrator (`server.js`)
    participant LocalFS as Sistema de Archivos Local
    participant Cloud as Cloud Object Storage (ej. S3)
    participant Database as DB (Historial)

    Orchestrator->>LocalFS: Genera reporte de Allure en un dir. temporal
    Note over Orchestrator,LocalFS: (Como en los planes de Fase 1 y 2)

    Orchestrator->>Cloud: Sube el contenido del dir. del reporte al bucket
    Note right of Cloud: El reporte ahora reside en una ruta como
`s3://bucket-name/reports/branch/feature/timestamp/`

    Cloud-->>Orchestrator: Devuelve la URL pública del `index.html` en la nube
    
    Orchestrator->>Database: Guarda la URL de la nube en la columna `reportUrl` del historial
    
    Orchestrator->>LocalFS: Elimina el reporte del directorio temporal local

```

---

## 4. Plan de Acción Detallado

### a. Modificaciones en el Backend (`server.js`)

1.  **Configuración Centralizada:**
    *   Añadir nuevas variables de entorno en `.env` para gestionar la conexión al proveedor de la nube:
        - `STORAGE_PROVIDER` (e.g., `S3`, `GCS`)
        - `STORAGE_BUCKET_NAME`
        - `STORAGE_REGION` (para AWS)
        - Credenciales (e.g., `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)

2.  **Crear un "Servicio de Publicación":**
    *   Desarrollar un nuevo módulo (ej. `uploader.js`) que abstraiga la lógica de subida.
    *   Este módulo tendría una función principal, ej. `uploadReport(localPath, destinationPath)`, que se encargaría de:
        1.  Listar todos los archivos en `localPath`.
        2.  Subirlos de forma recursiva a `destinationPath` dentro del bucket, manteniendo la estructura de directorios.
        3.  Establecer los permisos correctos para que los archivos sean públicamente legibles.
        4.  Devolver la URL pública del `index.html` principal.

3.  **Integración en el Flujo del Job:**
    *   En el punto donde actualmente se genera un reporte (ya sea individual o agregado), se llamará a esta nueva función de subida después de que el reporte se haya creado localmente.
    *   La `reportUrl` que se guarda en la base de datos del historial será la URL devuelta por el servicio de publicación.
    *   Una vez subido con éxito, el directorio local del reporte se eliminará para no ocupar espacio en el disco del servidor.

### b. Impacto en la Interfaz (UI)

- **Ninguno.** Este cambio es completamente transparente para el usuario final. El botón "Ver Reporte" en el historial simplemente apuntará a una URL de S3/GCS en lugar de a una ruta local del servidor orquestador.
