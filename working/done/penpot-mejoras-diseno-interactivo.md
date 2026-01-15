# Mejoras para Diseños Interactivos en Penpot

## Problema Identificado
Cuando se genera HTML desde un diseño de Penpot, no es claro qué elementos son interactivos (inputs, botones, etc.) versus elementos estáticos (texto, imágenes).

## Recomendaciones para Mejorar el Diseño en Penpot

### 1. Convención de Nombres

Usa nombres descriptivos que indiquen el tipo de elemento:

#### Inputs de Texto
- ✅ `InputBarcode` o `BarcodeInput`
- ✅ `InputSearch` o `SearchInput`
- ✅ `InputEmail` o `EmailInput`
- ❌ `BarcodePlaceholder` (sugiere solo texto estático)
- ❌ `BarcodeText`

#### Botones
- ✅ `ButtonCamera` o `CameraButton`
- ✅ `ButtonSubmit` o `SubmitButton`
- ✅ `ButtonPrimary` o `PrimaryButton`
- ❌ `CameraIcon` (sugiere solo un ícono)
- ❌ `Camera`

#### Áreas Interactivas
- ✅ `ButtonArea` para áreas clickeables
- ✅ `InputContainer` para contenedores de inputs
- ✅ `ClickableCard` para cards interactivos

### 2. Estructura de Componentes

Organiza los elementos en grupos lógicos:

```
BarcodeInput (Board/Frame)
├── InputBg (Rectangle - fondo del input)
├── InputField (Text - placeholder, pero debería ser input)
└── ButtonCamera (Board/Frame)
    ├── ButtonBg (Rectangle)
    └── CameraIcon (Text/Image)
```

### 3. Uso de Componentes de Biblioteca

Si tienes una biblioteca de componentes en Penpot:
- Crea componentes reutilizables: `Input`, `Button`, `Card`
- Usa variantes para estados: `Input:default`, `Input:focused`, `Input:error`
- Documenta qué componentes son interactivos

### 4. Anotaciones y Comentarios

Agrega información en los nombres o como comentarios:
- `InputBarcode [INPUT]` - el `[INPUT]` indica que es interactivo
- `ButtonCamera [BUTTON]` - el `[BUTTON]` indica que es clickeable
- Usa la descripción del elemento en Penpot para notas

### 5. Estilos Visuales Distintivos

Aunque el diseño visual puede ser el mismo, considera:
- Bordes sutiles en inputs (aunque sean del mismo color)
- Estados hover en botones (aunque no se vean en el diseño estático)
- Espaciado interno consistente en inputs

### 6. Estructura de Capas

Organiza las capas de manera lógica:
- Fondo del input (Rectangle)
- Input real (debería ser un elemento separado, pero en Penpot será Text)
- Botones como elementos hermanos, no hijos del input

### 7. Metadatos en el Diseño

Cuando generes código desde Penpot:
1. Busca nombres que contengan: `input`, `button`, `btn`, `clickable`, `interactive`
2. Convierte esos elementos a elementos HTML apropiados:
   - `*Input*` → `<input>` o `<textarea>`
   - `*Button*` → `<button>`
   - `*Link*` → `<a>`

## Ejemplo de Mejora

### Antes (Confuso)
```
Barcode Input (Board)
├── InputBg (Rectangle)
├── BarcodePlaceholder (Text) ← No queda claro que es un input
└── CameraButton (Board)
```

### Después (Claro)
```
BarcodeInput (Board) ← Nombre indica que es un input
├── InputBg (Rectangle)
├── InputField (Text) ← Nombre indica que es el campo de input
└── ButtonCamera (Board) ← Nombre indica que es un botón
    ├── ButtonBg (Rectangle)
    └── CameraIcon (Text)
```

## Implementación en el Código Generado

Cuando generes HTML desde Penpot, el código debería:

1. **Detectar elementos interactivos por nombre:**
```javascript
const isInput = (shape) => {
  const name = shape.name.toLowerCase();
  return name.includes('input') && !name.includes('bg');
};

const isButton = (shape) => {
  const name = shape.name.toLowerCase();
  return name.includes('button') || name.includes('btn');
};
```

2. **Generar HTML apropiado:**
```html
<!-- Si es un input -->
<input type="text" class="barcode-input-field" placeholder="Barcode" />

<!-- Si es un botón -->
<button type="button" class="camera-button">
  <span class="camera-icon">📷</span>
</button>
```

## Checklist para Diseñar Pantallas Interactivas

- [ ] Todos los inputs tienen nombres que incluyen "Input" o "Field"
- [ ] Todos los botones tienen nombres que incluyen "Button" o "Btn"
- [ ] Los elementos interactivos están organizados en Boards/Frames lógicos
- [ ] Los fondos de inputs están separados de los campos de texto
- [ ] Los botones tienen fondos y contenido claramente separados
- [ ] Se usan componentes de biblioteca cuando es posible
- [ ] Los nombres son descriptivos y consistentes
