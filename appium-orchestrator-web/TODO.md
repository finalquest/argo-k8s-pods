# TODO - Mejoras UI/UX Pendientes

## 📋 Tareas Pendientes

### 1. Header Azul para Archivos Nuevos en Features
- **Descripción**: Implementar un header similar al commit/push pero en azul/azul claro
- **Comportamiento**: Debe aparecer solo cuando hay archivos nuevos en el path de features
- **Color**: Azul o azul claro para diferenciarlo del header amarillo de commits
- **Contenido**: Mostrar conteo de archivos nuevos no trackeados en features/

### 2. Botón de Nuevo Test en el IDE ✅ COMPLETADO
- **Descripción**: Implementar un botón azul para crear nuevos tests
- **Comportamiento**: Aparece solo en repositorios locales, muestra popup para ingresar nombre
- **Ubicación**: Panel IDE del editor, junto a los botones existentes
- **Funcionalidad**: Crea archivo .feature con template básico en la ubicación actual del árbol

### 3. Recuperar Botón de Commit en el IDE
- **Problema**: Se perdió el botón de commit individual en el IDE
- **Impacto**: No hay forma de hacer commit de archivos individuales
- **Solución**: Restaurar la funcionalidad de commit por archivo desde el IDE

### 3. Ocultar Elementos de Auth en Modo Desarrollo
- **Problema**: Imagen de usuario y botón de logout se muestran incluso en modo desarrollo sin auth
- **Condición**: Si estamos en modo desarrollo sin autenticación, ocultar estos elementos
- **Elementos a ocultar**:
  - Imagen/perfil de usuario
  - Botón de logout

### 4. Corregir Errores de Dark Mode en Tree de Features
- **Problema**: Cuando una feature tiene cambios, la fila se pone amarilla y el texto blanco no se lee
- **Elemento afectado**: Tree/listado de features
- **Solución**: Ajustar colores para mejor contraste en dark mode cuando hay cambios

### 5. Corregir Textos de "Opciones de Ejecución" en Dark Mode
- **Problema**: Los textos son grises y no se leen con el background oscuro
- **Elemento afectado**: Sección "Opciones de ejecución"
- **Solución**: Ajustar color de texto para mejor visibilidad en dark mode

## 🔍 Notas de Implementación

### Prioridades
1. **Alta**: Header azul para archivos nuevos (funcionalidad importante)
2. **Alta**: Botón de commit en IDE (funcionalidad crítica)
3. **Media**: Elementos de auth en modo desarrollo (UX)
4. **Media**: Errores de dark mode en features (accessibilidad)
5. **Media**: Textos de opciones de ejecución (accessibilidad)

### Completado Recientemente
- ✅ **Botón de Nuevo Test en el IDE**: Implementado con estilo azul, popup para nombre, y creación de archivos en ubicación actual

### Consideraciones Técnicas
- Revisar el estado actual del código para entender cómo se implementaban estas características antes
- Asegurar compatibilidad con el sistema de detección de cambios existente
- Mantener consistencia con el estilo actual de la aplicación
- Probar en ambos modos (light/dark) para asegurar visibilidad

## 📁 Archivos Relevantes
- `public/js/main.js` - Lógica principal de UI
- `public/css/styles.css` - Estilos y temas
- `src/modules/core/branch-manager.js` - Detección de cambios
- `server.js` - Configuración de modo desarrollo