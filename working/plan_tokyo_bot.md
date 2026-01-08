# Plan detallado: Bot Telegram + Codex para tokyo2026

## Objetivo
Levantar un pod en k3s que funcione como intermediario entre Telegram y Codex para trabajar remotamente sobre el repo `tokyo2026`: conversar con Codex, ejecutar scripts (render mapas, etc.) y finalmente hacer commit/push, todo desde un chat.

- **Pod único** desplegado vía Argo CD (directorio `tokyo-bot/` en este repo).
- Contenedor Node.js (bot implementado con `node-telegram-bot-api` + `pino`) que:
  - Mantiene una conexión long-polling con Telegram.
  - Ejecuta el CLI de Codex en un proceso hijo y mantiene una sesión por chat.
  - Usa Git para clonar/push el repo `tokyo2026` (almacenado en un PVC bajo `/data/repos`).
- Dockerfile basado en `node:20-bullseye` con Git/SSH; espera que el binario/CLI de Codex esté disponible en PATH (el usuario puede extender el build para instalarlo).
- El bot mantiene conversaciones por chat, cada una asociada a una sesión activa de Codex (hasta recibir comando de cierre).
- El bot sólo hace “pasamanos”: pasa mensajes de Telegram a Codex, recibe la respuesta textual de Codex y la envía al chat. Todas las acciones (scripts, commits, push) las ejecuta Codex dentro de la sesión.
- Bot restringido a una lista de user IDs autorizados.

## Preparación manual previa
1. **Crear bot en Telegram**:
   - Abrir chat con `@BotFather`, usar `/newbot`, asignar nombre y usuario.
   - Guardar el `TELEGRAM_BOT_TOKEN` que entregue BotFather (no se versiona).
2. **Identificar usuarios autorizados**:
   - Desde las cuentas que vayan a usar el bot, enviar un mensaje al bot recién creado.
   - Ejecutar `curl "https://api.telegram.org/bot<token>/getUpdates"` desde el pod/local para obtener los `chat_id` o `user_id`.
   - Registrar esos IDs (CSV) para usar como `ALLOWED_USER_IDS`.
3. **Credenciales Git**:
   - Generar token personal o clave SSH con permisos de lectura/escritura sobre `tokyo2026`.
   - Guardar token/clave en un Secret (`tokyo-bot-secrets`).
4. **Codex**:
   - Identificar el método de autenticación (API key, config file). Preparar `CODEX_API_KEY` o montar las credenciales necesarias.
5. **Repo URL**:
   - Confirmar `TOKYO_REPO_URL` (por defecto `https://github.com/finalquest/tokyo2026`). Se guardará en un ConfigMap o env var.

Tras esos pasos, crear los Secrets en el cluster:
```bash
kubectl create secret generic tokyo-bot-secrets \\
  --namespace tokyo-bot \\
  --from-literal=TELEGRAM_BOT_TOKEN=xxx \\
  --from-literal=ALLOWED_USER_IDS=\"123456789,987654321\" \\
  --from-literal=CODEX_API_KEY=yyy \\
  --from-literal=GIT_AUTH_TOKEN=zzz \\
  --from-literal=GOOGLE_MAPS_API_KEY=ggg
```
Si se usa SSH, montar la clave como archivo (`--from-file=id_rsa=...`) y ajustar el contenedor para usarla.

## Recursos Kubernetes
1. **Namespace / integración**
   - Decidir si coexiste en `monitoring-lite` o crear `tokyo-bot` (sugerido namespace propio). Para claridad, usaremos `tokyo-bot` y agregaremos `CreateNamespace=true` en la Application de Argo CD.

2. **Deployment**
   - Imagen personalizada definida en `tokyo-bot/Dockerfile` (se publicará en `harbor.finalq.xyz/...` usando `docker buildx` para generar una imagen linux/amd64 desde la Mac ARM).
   - `nodeSelector: role=worker`.
   - Mount de volumen (PVC) para almacenar clones del repo `tokyo2026` y mantenerlo entre reinicios.
   - Env vars/Secrets:
     - `TELEGRAM_BOT_TOKEN`
     - Lista de `ALLOWED_USER_IDS` (CSV) para filtrar chats.
     - `CODEX_API_KEY` o credenciales necesarias para el CLI (dependiendo cómo se autentique).
     - `TOKYO_REPO_URL` (default `https://github.com/finalquest/tokyo2026` pero configurable) y `TOKYO_REPO_DEPTH` (por defecto `1` para shallow clone).
     - `GIT_USER_NAME`, `GIT_USER_EMAIL`.
     - `GIT_AUTH_TOKEN` y opcionalmente `GIT_AUTH_USERNAME` (user para la URL HTTPS) o clave SSH montada.
   - ConfigMap para scripts de arranque (por ejemplo, `entrypoint.sh` que inicia el bot, sincroniza repo, y lanza Codex según sea necesario).
   - Recursos aproximados: requests 500m CPU / 512Mi, limits 1-2 CPU / 2Gi (ajustable según peso de Codex + npm scripts).

3. **Service / Ingress**
   - No hace falta exponer HTTP; únicamente necesitamos que el pod pueda salir a Internet (Telegram API, GitHub). No se crea Service externo.

4. **PersistentVolumeClaim**
   - `tokyo-bot-data` (10 Gi, `local-path`, ReadWriteOnce) almacena el repo y resultados para que sobrevivan reinicios.

5. **Secrets**
- `tokyo-bot-secrets`:
  - `TELEGRAM_BOT_TOKEN`
  - `ALLOWED_USER_IDS`
  - `CODEX_API_KEY`
  - `GIT_AUTH_TOKEN` (o `SSH_PRIVATE_KEY`).
  - `GOOGLE_MAPS_API_KEY` (para los scripts `npm run fetch:*` / `routes:*` que consulta la API de Google Maps).
   - `tokyo-bot-config` (ConfigMap): `TOKYO_REPO_URL`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, otros parámetros.

6. **Argo CD Application**
   - `applications/tokyo-bot.yaml` apunta a `tokyo-bot/`, con sync automatizado y `CreateNamespace=true`.

## Flujo del bot
1. Arranque del pod: clona (si no existe) o hace pull del repo `tokyo2026` usando el token/SSH. Instala dependencias (`npm install`) si es necesario.
2. Bot conecta al Telegram Bot API usando `TELEGRAM_BOT_TOKEN`.
3. Cuando recibe un mensaje de un usuario autorizado:
   - Si no hay sesión Codex activa para ese chat, arranca el CLI (con `codex`/`cli` command) y guarda el handle.
   - Envía el mensaje a Codex, recibe la respuesta y la reenvía al chat.
   - Mantiene la sesión abierta hasta recibir un comando tipo `/close` o `/end`, momento en el cual termina el CLI y limpia estado.
4. Comandos adicionales:
   - `/status` para saber si hay sesión abierta.
   - `/sync` (opcional) para forzar pull/push.
   - `/reset` para matar la sesión en caso de error.
5. Manejo de errores: si el CLI cae o se pierde conexión, el bot lo reporta y permite reiniciar.

## Pipeline de CI/CD
- Repositorio actual (Argo) contiene manifiestos + Dockerfile/helm (si fuera necesario) del bot.
- El propio `tokyo2026` sigue separado; el pod clona/pushea allí usando credenciales.
- Considerar GitHub Action en `tokyo2026` para regenerar GitHub Pages tras cada push (ya existente).

## Seguridad
- Usuarios limitados vía `ALLOWED_USER_IDS`.
- Secrets montados como env vars (no versionados).
- Pod sin Service público.
- Codex CLI corre con los permisos del contenedor, sin prompt de aprobación (el pod ya tiene credenciales/SSH).

## Pruebas previstas
1. Desplegar el pod en un namespace de staging (`tokyo-bot`) y verificar logs (`kubectl logs`) para asegurar que el bot inicia y se conecta a Telegram.
2. Enviar mensaje desde usuario autorizado: validar handshake, conversación con Codex, y que las respuestas llegan correctas.
3. Ejecutar comando que implique `git clone` y `npm run` dentro del repo: verificar que el PVC persiste los cambios hasta commit/push.
4. Comando de commit/push: Codex debería poder ejecutarlo y el bot notificar el resultado.
5. Comando `/close` o `/reset`: session finaliza sin dejar procesos huérfanos.
6. Failover: reiniciar el pod y confirmar que el repo persiste y el bot se reconecta.

## Next steps
- Construir la imagen multi-arch (linux/amd64) usando `docker buildx build --platform linux/amd64 -t harbor.finalq.xyz/<project>/tokyo-bot:TAG tokyo-bot/` y publicarla en `harbor.finalq.xyz` (docker ya autenticado). Actualizar `deployment.yaml` con el tag publicado.
- Cargar/actualizar Secrets en el cluster (token Telegram, user IDs, token Git, Codex key).
- Deploy via Argo CD (`applications/tokyo-bot.yaml`) y verificar funcionamiento según el checklist.
