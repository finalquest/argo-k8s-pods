# Checklist Bot Telegram + Codex

## Preparación manual
- [ ] Bot de Telegram creado con BotFather y token almacenado en secreto local.
- [ ] Lista de `chat_id` o `user_id` autorizados identificada (via `getUpdates` u otro método).
- [ ] Credenciales Git preparadas (token o SSH) con permisos sobre `tokyo2026`.
- [ ] API key/credenciales de Codex listas para el CLI.
- [ ] Secrets creados en el cluster (`tokyo-bot-secrets` con token Telegram, user IDs, Codex key, Git token/SSH).

## Implementación
- [x] `namespace.yaml` creado (ej. `tokyo-bot`) y referenciado por kustomize/Argo.
- [x] ConfigMap con configuración base (`TOKYO_REPO_URL`, `GIT_USER_NAME`, etc.).
- [x] PVC creado para almacenar el repo `tokyo2026` y artefactos (`local-path`, tamaño >=5 Gi).
- [x] Dockerfile/imagen definida (o contenedor base + init) con CLI Codex y bot.
- [x] `deployment.yaml` monta PVC, carga env/Secrets, ejecuta el bot.
- [x] `service.yaml`/Ingress (si hiciera falta; por ahora no aplica) omitido o documentado como no necesario.
- [x] `kustomization.yaml` referencia todos los recursos.
- [x] `applications/tokyo-bot.yaml` con sync automatizado y `CreateNamespace=true`.

## Configuración adicional
- [x] Documentar cómo crear/actualizar los Secrets (`kubectl create secret ...`).
- [x] Variables de entorno confirmadas (telemetry, repo URL, codex token, etc.).

## Pruebas / Validación
- [ ] Deploy inicial sincronizado vía Argo CD sin errores.
- [ ] Logs del pod muestran conexión exitosa a Telegram y readiness del bot.
- [ ] Mensajes desde user autorizado llegan a Codex y la respuesta vuelve a Telegram.
- [ ] Sesión se mantiene hasta comando de cierre; `/close` finaliza correctamente.
- [ ] Bot ejecuta comandos de Codex que implican git clone/pull, scripts npm, y commit/push (usar repo de prueba para validar).
- [ ] PVC persiste el repo tras reinicios; al reiniciar el pod el repo sigue disponible y el bot reanuda.
- [ ] Manejo de errores: bot reporta cuando Codex cae o la sesión se resetea.
