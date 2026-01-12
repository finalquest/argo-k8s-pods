# Guía de Testing Local de la Imagen Docker

## 1. Build Local (sin push a Harbor)

```bash
cd ha-dash
./build.sh test --local
```

O con tag automático:

```bash
./build.sh --local
```

Esto buildea la imagen localmente usando `buildx` y la carga en tu Docker local con el nombre `ha-dash:test`.

## 2. Probar la Imagen Localmente

### Opción A: Con variables de entorno (recomendado)

```bash
docker run --rm -it \
  -e GIT_REPO_URL='https://github.com/finalquest/ha_dash.git' \
  -e GIT_BRANCH='main' \
  -e HA_BASE_URL='http://homeassistant.local:8123' \
  -e HA_TOKEN='tu-token-de-home-assistant' \
  -e DATABASE_URL='sqlite:///data/app.db' \
  -v /tmp/ha-dash-test:/data \
  -p 4000:4000 \
  ha-dash:test
```

### Opción B: Con archivo .env (más cómodo)

Crea un archivo `.env.test`:

```bash
cat > .env.test << EOF
GIT_REPO_URL=https://github.com/finalquest/ha_dash.git
GIT_BRANCH=main
HA_BASE_URL=http://homeassistant.local:8123
HA_TOKEN=tu-token-aqui
DATABASE_URL=sqlite:///data/app.db
EOF
```

Luego ejecuta:

```bash
docker run --rm -it \
  --env-file .env.test \
  -v /tmp/ha-dash-test:/data \
  -p 4000:4000 \
  ha-dash:test
```

## 3. Verificar que Funciona

Una vez que el contenedor arranque, deberías ver logs como:

```
Clonando/pull del repositorio...
Instalando dependencias del servidor...
Construyendo el servidor...
Instalando dependencias del frontend...
Construyendo el frontend...
Ejecutando migraciones de base de datos...
✅ Migraciones ejecutadas correctamente
Iniciando servidor...
Server listening on port 4000
```

Luego puedes acceder a:
- **Frontend**: http://localhost:4000
- **API Health**: http://localhost:4000/api/health

## 4. Probar el Health Endpoint

En otra terminal:

```bash
curl http://localhost:4000/api/health
```

Debería retornar algo como:
```json
{"ok":true,"ha":{...}}
```

## 5. Detener el Contenedor

Presiona `Ctrl+C` o en otra terminal:

```bash
docker ps  # Ver el ID del contenedor
docker stop <container-id>
```

## 6. Limpiar Después de Probar

```bash
# Eliminar la imagen de test
docker rmi ha-dash:test

# Eliminar el volumen de test (opcional)
rm -rf /tmp/ha-dash-test
```

## Troubleshooting

### Error: "GIT_REPO_URL no está configurado"
- Asegúrate de pasar la variable `-e GIT_REPO_URL=...`

### Error: "Error ejecutando migraciones"
- Verifica que el volumen `/data` esté montado correctamente
- Revisa los logs del contenedor para más detalles

### El contenedor se detiene inmediatamente
- Revisa los logs: `docker logs <container-id>`
- Verifica que todas las variables de entorno estén configuradas

### No puedo acceder a http://localhost:4000
- Verifica que el puerto esté mapeado: `-p 4000:4000`
- Revisa si hay otro proceso usando el puerto 4000
