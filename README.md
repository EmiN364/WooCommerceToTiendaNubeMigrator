# Migración WooCommerce → TiendaNube

Script para migrar categorías, productos y variantes desde WooCommerce a TiendaNube.

## 🚀 Características

- ✅ Migración de categorías (incluyendo subcategorías)
- ✅ Migración de productos simples y variables
- ✅ Migración de variantes
- ✅ Migración de imágenes
- ✅ Migración de SKUs, precios y stock
- ✅ Soporte para paginación automática
- ✅ Modo "dry run" para probar sin crear datos
- ✅ Manejo de errores y logging detallado
- ✅ Rate limiting automático

## 📋 Requisitos

- Node.js 18 o superior
- Credenciales de API de WooCommerce
- Credenciales de API de TiendaNube

## 🔧 Instalación

1. Instalar dependencias:

```bash
npm install
```

2. Copiar el archivo de configuración de ejemplo:

```bash
# En Windows:
copy config.example.env .env

# En Linux/Mac:
cp config.example.env .env
```

3. Editar `.env` con tus credenciales:

### Configuración de WooCommerce

Para obtener las credenciales de WooCommerce:

1. Ir a WooCommerce → Ajustes → Avanzado → REST API
2. Crear una nueva clave
3. Copiar el Consumer Key y Consumer Secret

```env
WOOCOMMERCE_URL=https://tu-tienda.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Configuración de TiendaNube

Para obtener las credenciales de TiendaNube:

1. Ir a https://www.tiendanube.com/apps/admin
2. Crear una nueva aplicación (o usar una existente)
3. Instalar la app en tu tienda
4. Copiar el Access Token y Store ID

```env
TIENDANUBE_STORE_ID=123456
TIENDANUBE_ACCESS_TOKEN=tu_access_token_aqui
TIENDANUBE_USER_AGENT=MiApp (contacto@ejemplo.com)
```

### Opciones de migración

```env
# true = no crea nada, solo muestra lo que haría
DRY_RUN=false

# Número de productos a procesar antes de mostrar progreso
BATCH_SIZE=10
```

## 🎯 Uso

### 1. Probar conexiones

Antes que nada, verifica que las credenciales funcionen:

```bash
npm test
```

Este comando probará las conexiones a ambas plataformas y mostrará estadísticas básicas.

### 2. Exportar datos (Opcional pero recomendado)

Exporta todos los datos de WooCommerce a archivos JSON para backup/análisis:

```bash
npm run export
```

Esto creará una carpeta `exports/` con:

- `categories.json` - Todas las categorías
- `products.json` - Todos los productos con variantes
- `report.json` - Reporte detallado con estadísticas

### 3. Modo de prueba (Dry Run)

Ejecuta la migración en modo prueba (no crea nada real):

```bash
npm run dry-run
```

O edita `.env` y pon `DRY_RUN=true`, luego:

```bash
npm start
```

### 4. Migración real

Una vez verificado que todo está correcto:

```bash
# Editar .env y poner DRY_RUN=false
npm start
```

O también puedes ejecutar:

```bash
npm run migrate
```

## 📊 Proceso de migración

El script realiza la migración en el siguiente orden:

1. **Categorías principales**: Migra primero las categorías de nivel superior
2. **Subcategorías**: Migra las categorías hijas
3. **Productos**: Migra todos los productos con sus variantes e imágenes

## ⚠️ Consideraciones importantes

### Limitaciones de la API

- **TiendaNube**: Tiene límites de rate limiting (generalmente 60 requests/minuto)
- El script incluye pausas automáticas para respetar estos límites
- Si tienes muchos productos, la migración puede tomar tiempo

### Productos variables

- WooCommerce y TiendaNube manejan las variantes de forma diferente
- El script intenta mapear las variantes lo mejor posible
- Puede que necesites ajustar manualmente algunas variantes complejas después

### Datos que se migran

**Categorías:**

- Nombre
- Descripción
- Slug (handle)
- Jerarquía (padre/hijo)

**Productos:**

- Nombre
- Descripción
- Slug (handle)
- Precio
- SKU
- Stock
- Peso
- Imágenes
- Categorías
- Estado (publicado/borrador)
- SEO (título y descripción, si existe en WooCommerce)

### Datos que NO se migran automáticamente

- Atributos personalizados de productos
- Comentarios/reseñas
- Órdenes de compra
- Clientes
- Cupones de descuento
- Métodos de envío personalizados

## 🐛 Solución de problemas

### Error de autenticación en WooCommerce

```
WooCommerce API error: 401 Unauthorized
```

**Solución**: Verifica que:

- Las credenciales sean correctas
- La URL no tenga barra al final
- La API REST esté habilitada en WooCommerce

### Error de autenticación en TiendaNube

```
TiendaNube API error: 401 Unauthorized
```

**Solución**: Verifica que:

- El Access Token sea válido
- El Store ID sea correcto
- La aplicación tenga los permisos necesarios

### Error de rate limiting

```
TiendaNube API error: 429 Too Many Requests
```

**Solución**:

- Aumenta el tiempo de espera entre requests en el código
- Reduce el BATCH_SIZE en .env

## 📝 Logs

El script proporciona logging detallado:

- ✓ Operaciones exitosas
- ✗ Errores
- 📊 Progreso cada X productos
- 📥 Requests a WooCommerce
- 📤 Requests a TiendaNube

## 🔄 Ejecutar migración incremental

Si necesitas agregar productos nuevos después de la migración inicial:

1. El script no verifica duplicados automáticamente
2. Considera agregar lógica para verificar productos existentes
3. O filtra los productos en WooCommerce antes de migrar

## 📚 Scripts disponibles

| Comando           | Descripción                                        |
| ----------------- | -------------------------------------------------- |
| `npm test`        | Prueba las conexiones a WooCommerce y TiendaNube   |
| `npm run export`  | Exporta todos los datos de WooCommerce a JSON      |
| `npm run dry-run` | Ejecuta migración en modo prueba (no crea nada)    |
| `npm start`       | Ejecuta la migración según configuración en `.env` |
| `npm run migrate` | Alias de `npm start`                               |

## 📁 Estructura de archivos

```
.
├── index.js                 # Script principal de migración
├── variants-handler.js      # Manejador especializado de variantes
├── export-data.js          # Script para exportar datos a JSON
├── test-connection.js      # Script para probar conexiones
├── package.json            # Dependencias y scripts
├── config.example.env      # Plantilla de configuración
├── .env                    # Tu configuración (crear desde el ejemplo)
├── .gitignore             # Archivos ignorados por git
├── README.md              # Esta documentación
├── QUICKSTART.md          # Guía de inicio rápido
└── exports/               # Carpeta generada por export-data.js
    ├── categories.json    # Backup de categorías
    ├── products.json      # Backup de productos
    └── report.json        # Reporte de análisis
```

## 🔍 Características avanzadas

### Manejo inteligente de variantes

El script incluye un manejador especializado (`variants-handler.js`) que:

- Detecta automáticamente productos variables
- Obtiene todas las variaciones de cada producto
- Mapea atributos entre WooCommerce y TiendaNube
- Valida que las variantes tengan datos completos
- Genera reportes detallados de cada producto variable

### Exportación y análisis

Antes de migrar, puedes usar `npm run export` para:

- Hacer un backup completo de tus datos
- Analizar la estructura de tus productos
- Identificar productos con datos incompletos
- Generar estadísticas detalladas

### Logging detallado

El script muestra información completa durante la migración:

- ✓ Operaciones exitosas en verde
- ✗ Errores en rojo
- ℹ Información general en azul
- ⚠ Advertencias en amarillo
- 📊 Progreso cada X productos

## 🚀 Flujo de trabajo recomendado

1. **Configurar credenciales** en `.env`
2. **Probar conexiones**: `npm test`
3. **Exportar datos**: `npm run export`
4. **Revisar el reporte** en `exports/report.json`
5. **Prueba en dry-run**: `npm run dry-run`
6. **Revisar logs** y verificar que todo esté correcto
7. **Migración real**: Editar `.env` → `DRY_RUN=false` → `npm start`
8. **Verificar** en TiendaNube que todo se migró correctamente

## 🔒 Seguridad

- Nunca compartas tu archivo `.env`
- El `.gitignore` ya está configurado para ignorar `.env`
- Usa credenciales de solo lectura en WooCommerce cuando sea posible
- Revisa los permisos de tu app en TiendaNube

## 🤝 Contribuciones

Si encuentras bugs o quieres mejorar el script, ¡las contribuciones son bienvenidas!

## 📚 Referencias

- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [TiendaNube API](https://tiendanube.github.io/api-documentation/intro)
- [Documentación de Nuvemshop](https://github.com/TiendaNube/api-docs) (mismo que TiendaNube)

## 📄 Licencia

ISC

---

**Creado con ❤️ para facilitar la migración entre plataformas de e-commerce**
