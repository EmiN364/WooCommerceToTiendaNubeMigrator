# ❓ Preguntas Frecuentes (FAQ)

## General

### ¿Puedo ejecutar la migración múltiples veces?

Sí, pero ten en cuenta que **creará productos duplicados** cada vez que lo ejecutes. No hay verificación de duplicados incorporada. Si necesitas agregar productos nuevos, considera filtrarlos primero en WooCommerce.

### ¿Cuánto tiempo toma la migración?

Depende del número de productos:

- Tienda pequeña (< 100 productos): 5-10 minutos
- Tienda mediana (100-500 productos): 30-60 minutos
- Tienda grande (> 500 productos): 1-3 horas

El tiempo puede variar según:

- Velocidad de internet
- Límites de rate limiting de las APIs
- Número de variantes por producto
- Número de imágenes

### ¿Puedo pausar y reanudar la migración?

No, actualmente el script no soporta pausar y reanudar. Si se interrumpe, tendrás que verificar qué productos se migraron y ajustar manualmente.

## WooCommerce

### ¿Dónde obtengo las credenciales de WooCommerce?

1. Inicia sesión en tu WordPress
2. Ve a **WooCommerce → Ajustes → Avanzado → REST API**
3. Haz clic en **Añadir clave**
4. Dale un nombre descriptivo
5. Selecciona el usuario (generalmente el administrador)
6. Selecciona permisos: **Lectura** (es suficiente)
7. Haz clic en **Generar clave API**
8. Copia el **Consumer key** y **Consumer secret**

⚠️ **Importante**: Guarda las credenciales inmediatamente, no podrás verlas de nuevo.

### ¿Necesito permisos de escritura en WooCommerce?

No, solo necesitas permisos de **Lectura**. El script solo obtiene datos, no modifica nada en WooCommerce.

### ¿La migración afecta mi tienda WooCommerce?

No, el script solo **lee** datos de WooCommerce. Tu tienda original permanecerá sin cambios.

### ¿Puedo migrar solo algunas categorías o productos?

El script migra todo por defecto. Para migrar selectivamente:

1. Exporta primero: `npm run export`
2. Modifica los archivos JSON en `exports/`
3. Necesitarías crear un script personalizado que lea estos archivos

## TiendaNube

### ¿Dónde obtengo las credenciales de TiendaNube?

1. Ve a https://www.tiendanube.com/apps/admin
2. Inicia sesión con tu cuenta de TiendaNube
3. Crea una nueva aplicación o usa una existente
4. Configura los permisos necesarios:
   - `read_products`
   - `write_products`
   - `read_categories`
   - `write_categories`
5. Instala la app en tu tienda
6. Copia el **Access Token** y **Store ID**

### ¿Qué permisos necesito en TiendaNube?

Necesitas los siguientes scopes:

- `write_products` - Para crear productos
- `write_categories` - Para crear categorías
- Opcionalmente `read_products` y `read_categories` para verificar

### ¿La migración elimina productos existentes en TiendaNube?

**No**. El script solo **crea** productos nuevos. Los productos existentes en TiendaNube permanecerán intactos.

### ¿Puedo migrar a una tienda TiendaNube que ya tiene productos?

Sí, pero ten cuidado con duplicados. El script no verifica si un producto ya existe antes de crearlo.

## Datos

### ¿Qué datos se migran exactamente?

**Categorías:**

- Nombre y descripción
- Slug (handle)
- Jerarquía padre/hijo

**Productos:**

- Nombre y descripción
- Precio regular y precio de oferta
- SKU
- Stock y gestión de inventario
- Peso y dimensiones
- Imágenes
- Categorías asociadas
- Variantes (para productos variables)
- SEO (título y meta descripción)
- Tags
- Estado (publicado/borrador)

### ¿Qué NO se migra?

- Reseñas/comentarios de productos
- Órdenes de compra
- Clientes
- Cupones de descuento
- Métodos de pago
- Métodos de envío personalizados
- Configuraciones de impuestos
- Atributos personalizados complejos
- Cross-sells / Up-sells
- Productos relacionados

### ¿Cómo se manejan las variantes?

El script:

1. Detecta productos variables en WooCommerce
2. Obtiene todas sus variaciones
3. Transforma los atributos al formato de TiendaNube
4. Crea el producto con todas sus variantes

**Limitación**: Algunos atributos muy complejos pueden necesitar ajustes manuales.

### ¿Se migran las imágenes?

Sí, pero por **referencia URL**, no se descargan. TiendaNube descargará las imágenes desde las URLs de WooCommerce. Asegúrate de que:

- Las imágenes sean accesibles públicamente
- Las URLs sean HTTPS (recomendado)
- Las imágenes estén optimizadas (peso razonable)

### ¿Qué pasa con los productos sin precio?

Se migrarán con precio `0`. Puedes identificarlos en el reporte generado por `npm run export`.

### ¿Y los productos sin stock?

Se migrarán, pero sin cantidad en stock. Si la gestión de stock está desactivada en WooCommerce, se respetará en TiendaNube.

## Errores comunes

### Error 401: Unauthorized

**Causas:**

- Credenciales incorrectas
- Consumer Key o Secret mal copiados
- Access Token expirado o inválido

**Solución:**

1. Ejecuta `npm test` para verificar conexiones
2. Revisa que las credenciales sean correctas en `.env`
3. Verifica que no haya espacios extra al copiar/pegar
4. Regenera las credenciales si es necesario

### Error 404: Not Found

**Causas (WooCommerce):**

- URL incorrecta
- API REST deshabilitada
- Permalinks no configurados correctamente

**Solución:**

1. Verifica la URL en `.env` (sin barra final)
2. Ve a WordPress → Ajustes → Enlaces permanentes y guarda
3. Asegúrate de que WooCommerce esté activo

**Causas (TiendaNube):**

- Store ID incorrecto

**Solución:**

1. Verifica el Store ID en tu panel de TiendaNube

### Error 429: Too Many Requests

**Causa:**

- Has excedido el límite de requests de la API

**Solución:**

1. Espera unos minutos antes de reintentar
2. El script ya incluye pausas automáticas
3. Si persiste, edita `index.js` y aumenta el `setTimeout`

### Error: ENOTFOUND / ECONNREFUSED

**Causa:**

- No hay conexión a internet
- Firewall bloqueando las conexiones
- URL incorrecta

**Solución:**

1. Verifica tu conexión a internet
2. Intenta acceder manualmente a las URLs de las APIs
3. Verifica configuración de firewall/proxy

### Los productos se crean pero sin imágenes

**Causa:**

- Las URLs de las imágenes no son accesibles
- Problema de CORS o permisos
- TiendaNube no pudo descargar las imágenes

**Solución:**

1. Verifica que las imágenes sean públicamente accesibles
2. Usa HTTPS para las URLs
3. Verifica que las imágenes no sean demasiado grandes

### Algunas variantes no se migran correctamente

**Causa:**

- Estructura de atributos muy compleja en WooCommerce
- Diferencias entre cómo ambas plataformas manejan variantes

**Solución:**

1. Revisa el reporte generado por `npm run export`
2. Puede que necesites ajustar manualmente algunas variantes
3. Verifica que todas las variantes tengan precio y SKU

## Rendimiento

### ¿Puedo acelerar la migración?

No se recomienda. El script ya está optimizado para respetar los límites de las APIs. Acelerar podría causar:

- Errores 429 (Too Many Requests)
- Bloqueo temporal de tu IP
- Datos incompletos

### ¿Por qué toma tanto tiempo?

Por seguridad y confiabilidad:

- Pausas entre requests para respetar rate limits
- Obtención de variaciones para cada producto variable
- Descarga de múltiples imágenes por TiendaNube
- Validación de datos

## Seguridad

### ¿Es seguro usar este script?

Sí, siempre que:

- Mantengas tu `.env` privado
- No compartas tus credenciales
- Revises el código fuente (es open source)
- Uses credenciales de solo lectura cuando sea posible

### ¿Dónde se almacenan mis credenciales?

Solo en tu archivo `.env` local. **Nunca** se envían a ningún servidor externo más allá de las APIs oficiales de WooCommerce y TiendaNube.

### ¿Puedo usar esto en producción?

Sí, pero se recomienda:

1. Hacer un backup completo primero
2. Probar en una tienda de prueba si es posible
3. Ejecutar en modo `DRY_RUN` primero
4. Exportar datos para análisis previo

## Solución de problemas

### ¿Cómo reporto un bug?

Si encuentras un error:

1. Anota el mensaje de error completo
2. Verifica los logs en consola
3. Revisa si está en esta FAQ
4. Si usas Git, abre un issue con:
   - Descripción del problema
   - Pasos para reproducirlo
   - Mensaje de error
   - Versión de Node.js

### ¿Puedo modificar el script?

¡Por supuesto! El código es open source. Puedes:

- Ajustarlo a tus necesidades
- Agregar funcionalidades
- Optimizarlo
- Compartir mejoras

### ¿Necesito conocimientos de programación?

Para uso básico: **No**. Solo necesitas:

- Saber editar un archivo `.env`
- Ejecutar comandos en terminal
- Entender conceptos básicos de APIs

Para personalización: **Sí**. Necesitarás conocimientos de:

- JavaScript/Node.js
- APIs REST
- Manejo de promesas/async-await

---

## ¿No encuentras tu pregunta?

Consulta:

- `README.md` - Documentación completa
- `QUICKSTART.md` - Guía de inicio rápido
- Ejecuta `npm test` para diagnosticar problemas de conexión
