# Guía de Contribución

¡Gracias por tu interés en contribuir al proyecto Appium Orchestrator Web! Esta guía te ayudará a configurar tu entorno de desarrollo y entender cómo contribuir efectivamente.

## 📋 Tabla de Contenidos

- [Prerrequisitos](#prerrequisitos)
- [Configuración del Entorno](#configuración-del-entorno)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Flujo de Trabajo](#flujo-de-trabajo)
- [Estándares de Código](#estándares-de-código)
- [Testing](#testing)
- [Documentación](#documentación)
- [Reporte de Issues](#reporte-de-issues)
- [Pull Requests](#pull-requests)

## 🛠️ Prerrequisitos

### Requisitos del Sistema

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Android SDK**: Con ADB instalado
- **Git**: Para control de versiones
- **Docker** (opcional): Para desarrollo y despliegue

### Herramientas de Desarrollo

- Editor de código (VSCode recomendado)
- Extensión ESLint para tu editor
- Git para control de versiones

## 🏗️ Configuración del Entorno

### 1. Clonar el Repositorio

```bash
git clone https://github.com/tu-usuario/appium-orchestrator-web.git
cd appium-orchestrator-web
```

### 2. Instalar Dependencias

```bash
# Instalar dependencias de Node.js
npm install

# Instalar dependencias de desarrollo (si es necesario)
npm install --dev
```

### 3. Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar el archivo con tus configuraciones
nano .env
```

Variables de entorno requeridas:

```bash
# Configuración básica
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000

# Autenticación Google OAuth
GOOGLE_CLIENT_ID=tu-client-id-google
GOOGLE_CLIENT_SECRET=tu-client-secret-google
SESSION_SECRET=tu-session-secret-seguro

# Integración Git
GIT_REPO_URL=https://github.com/tu-usuario/tu-repo.git
GIT_USER=tu-usuario-git
GIT_PAT=tu-personal-access-token

# Configuración de dispositivos
DEVICE_SOURCE=local
LOCAL_APK_DIRECTORY=/app/apks
```

### 4. Verificar Configuración

```bash
# Iniciar el servidor en modo desarrollo
npm run dev

# O iniciar en modo normal
npm start
```

Accede a `http://localhost:3000` para verificar que todo funciona correctamente.

## 📁 Estructura del Proyecto

```
appium-orchestrator-web/
├── docs/                           # Documentación
│   ├── 01-arquitectura-general.md
│   ├── 02-backend/
│   ├── 03-frontend/
│   └── 04-features/
├── public/                         # Archivos estáticos
│   ├── css/                        # Estilos CSS
│   ├── js/                         # Módulos JavaScript
│   │   ├── main.js                # Punto de entrada
│   │   ├── api.js                 # Integración con API
│   │   ├── ui.js                  # Gestión de UI
│   │   ├── socket.js              # Eventos Socket.IO
│   │   └── wiremock.js            # Integración WireMock
│   └── index.html                 # Página principal
├── scripts/                        # Scripts shell
│   ├── setup-workspace.sh
│   ├── feature-runner.sh
│   ├── install-apk.sh
│   └── ...
├── test/                          # Tests del proyecto
├── server.js                       # Servidor principal
├── worker.js                       # Worker de ejecución
├── package.json                    # Dependencias y scripts
├── .env.example                    # Variables de entorno ejemplo
├── .eslintrc.json                 # Configuración ESLint
└── README.md                       # Documentación principal
```

## 🔄 Flujo de Trabajo

### 1. Crear una Rama

```bash
# Crear una nueva rama para tu feature
git checkout -b feature/nueva-feature

# O para un bugfix
git checkout -b fix/corregir-error
```

### 2. Realizar Cambios

```bash
# Realizar tus cambios
# ...

# Añadir archivos modificados
git add .

# Realizar commit
git commit -m "feat: añadir nueva funcionalidad"

# O para correcciones
git commit -m "fix: corregir error en la aplicación"
```

### 3. Mantener tu Rama Actualizada

```bash
# Actualizar tu rama con los últimos cambios de main
git fetch origin
git rebase origin/main
```

### 4. Push y Pull Request

```bash
# Enviar tus cambios
git push origin feature/nueva-feature

# Crear Pull Request desde GitHub
```

## 📝 Estándares de Código

### Convenciones de Commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/) para los mensajes de commit:

```
feat: añadir nueva funcionalidad
fix: corregir error en la aplicación
docs: actualizar documentación
style: cambiar formato de código
refactor: reestructurar código
test: añadir tests
chore: tareas de mantenimiento
```

### Estilo de Código JavaScript

- Usar ES6+ features
- Indentación: 2 espacios
- Comillas: simples
- Punto y coma: requeridos
- Nombres de variables: camelCase
- Nombres de constantes: UPPER_SNAKE_CASE

### Ejemplo de Código

```javascript
// Buen ejemplo
const UserService = {
  async getUserById(id) {
    try {
      const user = await UserModel.findById(id);
      return user;
    } catch (error) {
      logger.error('Error fetching user:', error);
      throw new Error('Failed to fetch user');
    }
  },
};

// Mal ejemplo
function getuser(id) {
  var user = UserModel.findbyid(id);
  return user;
}
```

## 🧪 Testing

### Ejecutar Tests

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests con coverage
npm run test:coverage

# Ejecutar tests en modo watch
npm run test:watch
```

### Estructura de Tests

```
test/
├── unit/           # Tests unitarios
├── integration/    # Tests de integración
├── e2e/           # Tests end-to-end
└── fixtures/      # Datos de prueba
```

### Escribir Tests

```javascript
// Ejemplo de test unitario
describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, name: 'John Doe' };
      UserModel.findById.mockResolvedValue(mockUser);

      const result = await UserService.getUserById(1);

      expect(result).toEqual(mockUser);
    });
  });
});
```

## 📚 Documentación

### Actualizar Documentación

- Actualizar los archivos Markdown en la carpeta `docs/`
- Incluir ejemplos de código cuando sea relevante
- Mantener la documentación actualizada con los cambios

### Agregar JSDoc

```javascript
/**
 * Obtiene un usuario por su ID
 * @param {number} id - ID del usuario
 * @returns {Promise<Object>} Promise que resuelve con el usuario
 * @throws {Error} Si no se encuentra el usuario
 */
async function getUserById(id) {
  // implementación
}
```

## 🐛 Reporte de Issues

### Cómo Reportar un Bug

1. Verificar si el bug ya fue reportado
2. Crear un nuevo issue con la plantilla de bug
3. Incluir la siguiente información:
   - Título descriptivo
   - Pasos para reproducir
   - Comportamiento esperado vs actual
   - Entorno (SO, versión de Node.js, etc.)
   - Capturas de pantalla si es relevante

### Sugerir una Feature

1. Verificar si la feature ya fue solicitada
2. Crear un nuevo issue con la plantilla de feature
3. Describir la funcionalidad deseada
4. Explicar el caso de uso
5. Proponer posibles soluciones

## 🔄 Pull Requests

### Plantilla de Pull Request

```markdown
## Descripción

Breve descripción de los cambios realizados.

## Tipo de Cambio

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Checklist

- [ ] Mi código sigue los estándares de estilo del proyecto
- [ ] He realizado testing manual de mis cambios
- [ ] He añadido tests automatizados para mis cambios
- [ ] He actualizado la documentación si es necesario
- [ ] Mi rama está actualizada con la rama main
```

### Proceso de Revisión

1. **Automated Checks**: Los tests y linting deben pasar
2. **Code Review**: Al menos un desarrollador debe revisar los cambios
3. **Approval**: El PR debe ser aprobado antes de hacer merge
4. **Merge**: El merge se realiza a través de squash merge

## 🎖️ Reconocimientos

Todos los contribuyentes serán reconocidos en el archivo `CONTRIBUTORS.md` y en las notas de la versión.

## 📞 Contacto

Si tienes preguntas durante el proceso de contribución, no dudes en contactar al equipo de desarrollo a través de:

- Issues en GitHub
- Email: dev-team@empresa.com
- Slack: #appium-orchestrator

---

¡Gracias por contribuir a hacer de Appium Orchestrator Web un mejor proyecto! 🚀
