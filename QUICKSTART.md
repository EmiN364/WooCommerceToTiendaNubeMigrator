# 🚀 Inicio Rápido - Migración WooCommerce → TiendaNube

## Pasos para ejecutar la migración

### 1️⃣ Instalar dependencias

```bash
npm install
```

### 2️⃣ Configurar credenciales

Copia el archivo de ejemplo y completa tus credenciales:

```bash
cp config.example.env .env
```

Edita el archivo `.env` y completa:

#### Para WooCommerce:

1. Ve a tu WordPress → WooCommerce → Ajustes → Avanzado → REST API
2. Crea una nueva clave con permisos de **Lectura**
3. Copia el `Consumer key` y `Consumer secret`

```env
WOOCOMMERCE_URL=https://tu-tienda.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxxxxxxxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxxxxxxxxxx
```

#### Para TiendaNube:

1. Ve a https://www.tiendanube.com/apps/admin
2. Crea una aplicación o usa una existente
3. Instala la app en tu tienda
4. Obtén el `Access Token` y `Store ID`

```env
TIENDANUBE_STORE_ID=123456
TIENDANUBE_ACCESS_TOKEN=xxxxxxxxxxxxx
TIENDANUBE_USER_AGENT=MiMigracion (tu@email.com)
```

### 3️⃣ Probar en modo DRY RUN (Recomendado)

Antes de migrar datos reales, prueba que todo funcione:

```bash
# Edita .env y asegúrate de tener:
DRY_RUN=true
```

Luego ejecuta:

```bash
npm start
```

Esto mostrará qué se migrará **sin crear nada real**.

### 4️⃣ Ejecutar migración real

Una vez verificado que todo está correcto:

```bash
# Edita .env y cambia a:
DRY_RUN=false
```

Ejecuta la migración:

```bash
npm start
```

## ⏱️ Tiempo estimado

- **Tienda pequeña** (< 100 productos): 5-10 minutos
- **Tienda mediana** (100-500 productos): 30-60 minutos
- **Tienda grande** (> 500 productos): 1-3 horas

## 📊 Lo que se migra

✅ Categorías (con jerarquía padre/hijo)
✅ Productos simples
✅ Productos variables (con todas sus variantes)
✅ SKUs
✅ Precios (normal y promocional)
✅ Stock
✅ Imágenes
✅ Descripciones
✅ Peso y dimensiones
✅ SEO (título y descripción)
✅ Tags

## ⚠️ Importante

- La migración **NO elimina** productos existentes en TiendaNube
- Si ejecutas dos veces, **creará duplicados**
- Los límites de la API de TiendaNube pueden hacer que tome tiempo
- El script automáticamente hace pausas para respetar límites

## 🐛 ¿Problemas?

### Error 401 (No autorizado)

- Verifica que las credenciales sean correctas
- Asegúrate de que la API esté habilitada en WooCommerce
- Verifica que el token de TiendaNube sea válido

### Error 429 (Demasiadas peticiones)

- El script ya tiene pausas automáticas
- Si persiste, edita `index.js` y aumenta el tiempo en `setTimeout`

### Productos no se migran correctamente

- Revisa los logs para ver errores específicos
- Algunos productos con configuraciones complejas pueden necesitar ajustes manuales

## 📞 Soporte

- **Documentación completa**: `README.md`
- **Preguntas frecuentes**: `FAQ.md`
- **Probar conexiones**: `npm test`
