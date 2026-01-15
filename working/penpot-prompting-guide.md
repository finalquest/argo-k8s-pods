# Guía de Prompts para Penpot MCP

## ⚠️ REGLAS OBLIGATORIAS

### 1. Usar Flex o Grid Layout con zIndex

**⚠️ PROHIBIDO usar `detach()`** - Rompe las referencias de componentes.

**SIEMPRE** usar Flex o Grid layout en los boards y `layoutChild.zIndex` para controlar z-order.

**Proceso obligatorio**:
1. Crear board y agregar flex layout con `addFlexLayout()`
2. Configurar propiedades del flex layout
3. Agregar elementos hijos usando `flex.appendChild()` o `appendChild()`
4. **CRÍTICO**: Configurar `layoutChild.horizontalSizing` y `layoutChild.verticalSizing` en cada hijo:
   - `horizontalSizing: "fill"` para elementos que deben ocupar todo el ancho disponible (ej: input fields en un row)
   - `horizontalSizing: "auto"` para elementos que solo ocupan el espacio necesario (ej: botones)
   - `horizontalSizing: "fix"` para elementos con ancho fijo
   - `verticalSizing: "fix"` para elementos con altura fija
   - `verticalSizing: "auto"` para elementos que se ajustan al contenido
5. Configurar `layoutChild.zIndex` en cada hijo para controlar el orden (si es necesario)

```javascript
// Crear board con flex layout
const board = penpot.createBoard();
board.addFlexLayout(); // ⚠️ OBLIGATORIO: usar addFlexLayout() primero

// Configurar propiedades del flex layout
const flex = board.flex; // Obtener el objeto FlexLayout
flex.dir = "row";  // o "column" para vertical
flex.wrap = "nowrap";
flex.alignItems = "start";
flex.justifyContent = "space-between"; // Distribuye elementos: "start", "end", "center", "space-between", "space-around"
flex.rowGap = 0;
flex.columnGap = 0;
flex.horizontalPadding = 10; // Padding horizontal general
flex.verticalPadding = 10;   // Padding vertical general
// O usar padding específicos:
flex.topPadding = 10;
flex.rightPadding = 10;
flex.bottomPadding = 10;
flex.leftPadding = 10;
flex.horizontalSizing = "fill";  // Responsive: se ajusta al ancho
flex.verticalSizing = "auto";     // Responsive: se ajusta al contenido

// Configurar fondo del board directamente
board.fills = [{ fillColor: '#1e1e1e', fillOpacity: 1 }];

// Agregar elementos usando flex.appendChild() o appendChild()
const inputField = penpot.createBoard();
inputField.fills = [{ fillColor: '#1e1e1e', fillOpacity: 1 }];
board.flex.appendChild(inputField);

// ⚠️ CRÍTICO: Configurar layoutChild para que el input ocupe todo el ancho disponible
inputField.layoutChild = { 
  horizontalSizing: "fill",  // Ocupa todo el ancho disponible
  verticalSizing: "fix"        // Altura fija
};

const button = penpot.createBoard();
button.fills = [{ fillColor: '#6c5ce7', fillOpacity: 1 }];
board.flex.appendChild(button);

// El botón solo ocupa el espacio necesario
button.layoutChild = { 
  horizontalSizing: "auto",  // Solo el espacio necesario
  verticalSizing: "fix"       // Altura fija
};
```

**Configuraciones comunes de `justifyContent`**:
- `"start"`: Alinea elementos al inicio
- `"end"`: Alinea elementos al final
- `"center"`: Centra elementos
- `"space-between"`: Distribuye elementos con espacio entre ellos (útil para headers con elementos a izquierda y derecha)
- `"space-around"`: Distribuye elementos con espacio alrededor

**Layouts siempre responsive**: Usar `horizontalSizing: "fill"` y `verticalSizing: "auto"` para que se ajusten al contenido.

### 3. Backgrounds en Boards

**⚠️ PROHIBIDO usar Rectangles como background** - El fondo debe ir como `fill` directamente en el board.

**SIEMPRE** hacer `board.fills = []` a menos que necesites fondo específico. Si necesitas fondo, ponerlo directamente en el board.

```javascript
const board = penpot.createBoard();
board.fills = []; // ⚠️ OBLIGATORIO si no hay fondo

// Si necesitas fondo, ponerlo directamente en el board
const board = penpot.createBoard();
board.fills = [{ fillColor: '#1e1e1e', fillOpacity: 1 }]; // ✅ Correcto

// ❌ PROHIBIDO: NO crear Rectangle hijo para background
// const bg = penpot.createRectangle();
// bg.fills = [{ fillColor: '#1e1e1e', fillOpacity: 1 }];
// board.appendChild(bg);
```

### 2. Crear Components Correctamente

**⚠️ CRÍTICO**: NO crear boards intermedios para componentes. Crear los shapes directamente en un board "Components" dedicado.

**Proceso correcto**:
1. Crear/obtener board "Components" (una sola vez, reutilizar)
2. Crear los shapes del componente directamente en ese board
3. Posicionar shapes separados (no superponer)
4. Configurar `layoutChild.zIndex` para z-order (sin detach)
5. Crear componente con `penpot.library.local.createComponent(shapes)`
6. Posicionar el main instance del componente en el board Components

```javascript
// 1. Crear/obtener board Components (una sola vez)
let componentsBoard = penpotUtils.findShape(shape => shape.name === "Components" && shape.type === "board");
if (!componentsBoard) {
  componentsBoard = penpot.createBoard();
  componentsBoard.name = "Components";
  componentsBoard.resize(2000, 2000);
  componentsBoard.fills = [];
  penpot.root.appendChild(componentsBoard);
}

// 2. Crear shapes directamente (NO crear board intermedio)
// ⚠️ CRÍTICO: Crear shapes en la MISMA posición absoluta donde estará el main instance
// Esto asegura que las posiciones relativas (parentX, parentY) queden en (0, 0)
const mainInstanceX = 0;  // Posición donde estará el main instance
const mainInstanceY = 0;  // Posición donde estará el main instance

const buttonBg = penpot.createRectangle();
buttonBg.name = "ButtonBg";
buttonBg.resize(120, 48);
buttonBg.x = mainInstanceX;  // ⚠️ MISMA posición que el main instance
buttonBg.y = mainInstanceY;  // ⚠️ MISMA posición que el main instance
buttonBg.borderRadius = 8;
buttonBg.fills = [{ fillColorGradient: {...} }];
componentsBoard.appendChild(buttonBg);

const buttonText = penpot.createText("Button");
buttonText.name = "ButtonText";
buttonText.resize(120, 48);
buttonText.x = mainInstanceX;  // ⚠️ MISMA posición que el main instance
buttonText.y = mainInstanceY;  // ⚠️ MISMA posición que el main instance
buttonText.constraintsHorizontal = "leftright";
buttonText.constraintsVertical = "topbottom";
buttonText.align = "center";
buttonText.verticalAlign = "center";
componentsBoard.appendChild(buttonText);

// 3. Configurar zIndex (sin detach)
buttonBg.layoutChild = { zIndex: 0 };
buttonText.layoutChild = { zIndex: 1 };

// 4. Crear componente (solo los shapes, NO el board)
const componentShapes = [buttonBg, buttonText];
const component = penpot.library.local.createComponent(componentShapes);
component.name = "PrimaryButton";

// 5. Calcular posición del main instance (debajo del componente más bajo + espacio)
const localLibrary = penpot.library.local;
const existingComponents = localLibrary.components.filter(c => c.name !== component.name);
let nextY = 0;
if (existingComponents.length > 0) {
  const maxBottom = Math.max(...existingComponents.map(c => {
    const inst = c.mainInstance();
    return inst.y + inst.height;
  }));
  nextY = maxBottom + 20; // 20px de espacio entre componentes
}

// 6. Posicionar main instance en Components (separado de otros componentes)
const mainInstance = component.mainInstance();
mainInstance.x = mainInstanceX;
mainInstance.y = nextY; // Usar posición calculada, no mainInstanceY
// Ahora los hijos tienen parentX=0, parentY=0 correctamente
```

**Reglas importantes**:
- ✅ Crear shapes directamente, NO boards intermedios
- ✅ Usar board "Components" como contenedor para todos los componentes
- ✅ **CRÍTICO**: Crear shapes en la MISMA posición absoluta donde estará el main instance. Esto asegura que `parentX` y `parentY` queden en (0, 0)
- ✅ **CRÍTICO**: Calcular automáticamente la posición Y del main instance basándose en los componentes existentes (debajo del más bajo + espacio)
- ✅ Todos los hijos del componente deben tener la misma posición absoluta (misma x, misma y) al crearlos
- ✅ Usar `layoutChild.zIndex` para z-order (NO usar detach - PROHIBIDO)
- ✅ Usar constraints para que elementos se ajusten al redimensionar
- ✅ **CRÍTICO**: Los componentes NO pueden tener otros componentes como hijos. Si necesitas un contenedor con componentes dentro, usa un Board normal (no un componente)

### 4. Flex vs Grid Layout

**Flex Layout**: Usar para layouts en una dirección (row o column)
- Ideal para: headers, navegación, listas horizontales/verticales
- **Proceso**: Usar `board.addFlexLayout()` primero, luego configurar propiedades del objeto `flex`
- Configurar: `dir` (row/column), `justifyContent`, `alignItems`, padding, gaps
- **`justifyContent` común**: `"space-between"` para distribuir elementos (ej: botón izquierda, título derecha)
- ⚠️ **CRÍTICO - ORDEN INVERSO**: El orden en el array `children` es **SIEMPRE INVERSO** al orden visual, tanto en vertical (column) como en horizontal (row).
  - **Vertical (column)**: Si agregas [A, B], visualmente aparece [B, A]. Para que A aparezca arriba, debe estar SEGUNDO en children. Para que B aparezca abajo, debe estar PRIMERO en children.
  - **Horizontal (row)**: Si agregas [A, B], visualmente aparece [B, A]. Para que A aparezca a la izquierda, debe estar SEGUNDO en children. Para que B aparezca a la derecha, debe estar PRIMERO en children.
  - **Ejemplo**: Para tener InputField (izquierda) y Button (derecha), agregar: `flex.appendChild(button)` primero, luego `flex.appendChild(inputField)` segundo.
  - **NUNCA saltar esta regla** - Es fundamental para el posicionamiento correcto.
- **Padding**: Usar `horizontalPadding`/`verticalPadding` o los específicos (`topPadding`, `rightPadding`, `bottomPadding`, `leftPadding`)

**Grid Layout**: Usar para layouts en dos dimensiones
- Ideal para: grids complejos, tablas, layouts de múltiples columnas
- Configurar: `rows`, `columns`, usar `appendChild(child, row, column)`

**Siempre responsive**: 
- `horizontalSizing: "fill"` para que se ajuste al ancho disponible
- `verticalSizing: "auto"` para que se ajuste al contenido
- Usar padding y gaps relativos

### 5. Convenciones de Nombres

**Inputs**: Usar `InputField`, `InputBarcode`, `BarcodeInputField` (contener "Input" o "Field")
**Botones**: Usar `ButtonPrimary`, `ButtonCamera`, `SubmitButton` (contener "Button" o "Btn")

**Comentarios y Notas**: Para agregar comentarios sobre funcionalidad, usar el `name` del elemento con formato descriptivo:
- `"InputFieldBoard - Validar solo números"`
- `"TabSelector - Cambiar tab al hacer click"`
- `"BuscarButton - Validar código antes de buscar"`

Esto permite documentar la funcionalidad esperada directamente en el nombre del elemento.

### 5.1. Textos y Tipografía

**FontWeight por defecto**: Usar `fontWeight: 400` (normal) por defecto. Solo aumentar a 500, 600, 700 si el diseño lo requiere específicamente.

**Constraints para textos centrados**: Siempre usar `constraintsHorizontal: "center"` y `constraintsVertical: "center"` para textos que deben centrarse dentro de su contenedor. Esto asegura que se mantengan centrados al redimensionar.

```javascript
const text = penpot.createText("Centered Text");
text.constraintsHorizontal = "center";
text.constraintsVertical = "center";
text.align = "center";
text.verticalAlign = "center";
```

### 6. Posiciones Relativas al Parent

**⚠️ CRÍTICO**: Cuando agregas un elemento a un parent, las posiciones `x, y` son **absolutas** (respecto al page), NO relativas al parent.

**Problema**: Si creas un elemento con `x=0, y=0` y lo agregas a un parent que está en `x=571, y=0`, el elemento quedará en posición absoluta `(0, 0)` pero relativa al parent será `parentX=-571, parentY=0` (incorrecto).

**Solución**: Después de agregar un elemento a un parent, ajustar su posición para que quede relativo al parent:

```javascript
const parentBoard = penpot.createBoard();
parentBoard.x = 571;
parentBoard.y = 0;
mainBoard.appendChild(parentBoard);

// Crear hijo
const child = penpot.createRectangle();
child.x = 0;  // ❌ Esto es posición absoluta, NO relativa
child.y = 0;
parentBoard.appendChild(child);

// ⚠️ OBLIGATORIO: Ajustar posición para que sea relativa al parent
child.x = parentBoard.x;  // Ahora child está en (571, 0) absoluto
child.y = parentBoard.y; // Pero parentX=0, parentY=0 relativo al parent ✅
```

**Regla**: Para que un elemento quede en `(0, 0)` relativo al parent, debe estar en `x = parent.x, y = parent.y` en posición absoluta.

### 7. Estructura Jerárquica

**⚠️ IMPORTANTE**: Los componentes NO pueden tener otros componentes como hijos. Usa Boards normales como contenedores.

**Estructura típica de una pantalla**:
```
Page (root)
  └── Board (pantalla principal) ← Con fill de color de fondo
      └── Board (header) ← Board con flex layout, fills = []
          └── Board (subheader) ← Board con flex layout, fill de color
              ├── Component (SecondaryButton) ← Componente
              └── Text (título) ← Shape normal
```

**Ejemplo real (InventarioScreen)**:
- **InventarioScreen**: Board principal con `fills = [{ fillColor: "#191923" }]`
- **Header**: Board con `addFlexLayout()`, `fills = []` (transparente), `justifyContent: "start"`
- **SubHeader**: Board con `addFlexLayout()`, `fills = [{ fillColor: "#2D2E3B" }]`, `justifyContent: "space-between"`, `horizontalPadding: 10`, `verticalPadding: 10`
  - Contiene: SecondaryButton (componente) y Title (texto)
  - El orden en `children` es ["SecondaryButton", "Title"] pero visualmente aparece Title primero, luego Button (orden inverso)

**Reglas**:
- Board principal (pantalla): Tiene fill de color de fondo
- Boards intermedios (header, subheader): `fills = []` a menos que necesiten fondo específico
- Si un board necesita fondo, ponerlo como `fill` directamente en el board (NO usar Rectangle hijo)
- Usar flex layout en todos los boards contenedores
- Usar `justifyContent: "space-between"` para distribuir elementos horizontalmente

## Errores Comunes

1. ❌ Crear boards intermedios para componentes (crear shapes directamente)
2. ❌ **PROHIBIDO usar `detach()`** - Rompe referencias de componentes. Usar flex/grid con zIndex
3. ❌ Usar Rectangle hijo para background - El fondo debe ir como `fill` del board directamente
4. ❌ **Crear elementos innecesarios** - Solo crear lo que realmente se necesita. No crear Rectangles de fondo si no son necesarios
5. ❌ NO usar flex/grid layout - Los layouts siempre deben ser responsive con flex o grid
6. ❌ Superponer componentes en el board Components (posicionar separados)
7. ❌ **Crear shapes en posiciones diferentes al main instance** - Los hijos deben crearse en la misma posición absoluta donde estará el main instance, o tendrán `parentX/parentY` incorrectos
8. ❌ **No calcular automáticamente la posición del siguiente componente** - Debe calcularse basándose en los componentes existentes (maxBottom + espacio)
9. ❌ **No ajustar posiciones después de appendChild()** - Las posiciones x, y son absolutas, NO relativas. Después de agregar a un parent, ajustar `child.x = parent.x` para que quede en (0, 0) relativo
10. ❌ **No usar `addFlexLayout()`** - Siempre usar `board.addFlexLayout()` antes de configurar propiedades del flex
11. ❌ **No usar flex/grid layout** - Los layouts siempre deben ser responsive usando flex o grid
12. ❌ **No configurar constraints correctamente** - Para textos que deben centrarse, usar `constraintsHorizontal: "center"` y `constraintsVertical: "center"` desde el inicio
13. ❌ **Usar fontWeight innecesariamente alto** - Usar `fontWeight: 400` (normal) por defecto, solo aumentar si es necesario
14. ❌ **OLVIDAR EL ORDEN INVERSO** - ⚠️ CRÍTICO: El orden en `children` es SIEMPRE inverso al visual (vertical Y horizontal). NUNCA saltar esta regla. Si quieres A a la izquierda y B a la derecha, agregar B primero, luego A.
15. ❌ **No configurar `layoutChild.horizontalSizing`** - ⚠️ CRÍTICO: Siempre configurar `layoutChild.horizontalSizing: "fill"` en elementos que deben ocupar todo el ancho disponible (inputs, contenedores). Usar `"auto"` para botones y elementos con tamaño fijo.
16. ❌ **No configurar zIndex** - Usar `layoutChild.zIndex` para controlar z-order sin detach (aunque con flex el orden de appendChild suele ser suficiente)
16. ❌ **Intentar poner componentes dentro de otros componentes** - Los componentes NO pueden tener otros componentes como hijos. Usar Boards normales como contenedores
17. ❌ No verificar que elementos dentro de componentes estén correctamente posicionados
18. ❌ No usar constraints para elementos que deben ajustarse al redimensionar

## Checklist

- [ ] ¿Uso `addFlexLayout()` o `addGridLayout()` para crear layouts?
- [ ] ¿Configuro `justifyContent` apropiadamente (ej: "space-between" para distribuir elementos)?
- [ ] ⚠️ **¿Recuerdo que el orden en children es SIEMPRE INVERSO al visual (vertical Y horizontal)?** - Para A izquierda y B derecha, agregar B primero, luego A.
- [ ] ⚠️ **¿Configuro `layoutChild.horizontalSizing: "fill"` en elementos que deben ocupar todo el ancho?** - Inputs y contenedores deben tener `"fill"`, botones `"auto"`.
- [ ] ¿Uso flex o grid layout en los boards (siempre responsive)?
- [ ] ¿Solo creo los elementos necesarios (no elementos innecesarios como Rectangles de fondo si no se usan)?
- [ ] ¿Configuro `layoutChild.zIndex` para controlar z-order (PROHIBIDO usar detach)?
- [ ] ¿Pongo el fondo como `fill` del board (NO usar Rectangle hijo para background)?
- [ ] ¿Creo componentes con shapes directamente (sin boards intermedios)?
- [ ] ¿Creo shapes en la misma posición absoluta donde estará el main instance?
- [ ] ¿Calculo automáticamente la posición Y del main instance (debajo del componente más bajo + espacio)?
- [ ] ¿Ajusto posiciones después de appendChild() para que sean relativas al parent (`child.x = parent.x`)?
- [ ] ¿Uso board "Components" para organizar componentes?
- [ ] ¿Verifico que `parentX` y `parentY` de los hijos sean (0, 0)?
- [ ] ¿Uso constraints correctamente (ej: "center" para textos centrados)?
- [ ] ¿Uso `fontWeight: 400` por defecto (solo aumentar si es necesario)?
- [ ] ¿Uso nombres descriptivos con "Input", "Button", etc.?
- [ ] ¿Uso Boards normales (no componentes) como contenedores cuando necesito múltiples componentes juntos?
