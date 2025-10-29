import dotenv from "dotenv";
import fetch from "node-fetch";
import {
	createVariableProduct,
	getProductVariations,
} from "./variants-handler.js";

dotenv.config();

// ==========================================
// Configuración
// ==========================================

const config = {
	woocommerce: {
		url: process.env.WOOCOMMERCE_URL,
		consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
		consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
	},
	tiendanube: {
		storeId: process.env.TIENDANUBE_STORE_ID,
		accessToken: process.env.TIENDANUBE_ACCESS_TOKEN,
		userAgent: process.env.TIENDANUBE_USER_AGENT || "Migration Script",
	},
	options: {
		dryRun: process.env.DRY_RUN === "true",
		batchSize: parseInt(process.env.BATCH_SIZE || "10"),
		concurrency: parseInt(process.env.CONCURRENCY || "5"), // Requests paralelos
	},
};

// ==========================================
// Cliente WooCommerce
// ==========================================

class WooCommerceClient {
	constructor(url, consumerKey, consumerSecret) {
		this.baseUrl = url;
		this.auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
			"base64"
		);
	}

	async request(endpoint, page = 1, perPage = 100) {
		const url = `${this.baseUrl}/wp-json/wc/v3/${endpoint}?page=${page}&per_page=${perPage}`;

		console.log(`📥 Obteniendo de WooCommerce: ${endpoint} (página ${page})`);

		const response = await fetch(url, {
			headers: {
				Authorization: `Basic ${this.auth}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(
				`WooCommerce API error: ${response.status} ${response.statusText}`
			);
		}

		const data = await response.json();
		const totalPages = parseInt(response.headers.get("x-wp-totalpages") || "1");

		return { data, totalPages, currentPage: page };
	}

	async getAllPages(endpoint) {
		const allData = [];
		let page = 1;
		let totalPages = 1;

		do {
			const { data, totalPages: total } = await this.request(endpoint, page);
			allData.push(...data);
			totalPages = total;
			page++;
		} while (page <= totalPages);

		return allData;
	}

	async getCategories() {
		return this.getAllPages("products/categories");
	}

	async getProducts() {
		return this.getAllPages("products");
	}
}

// ==========================================
// Cliente TiendaNube
// ==========================================

class TiendaNubeClient {
	constructor(storeId, accessToken, userAgent) {
		this.storeId = storeId;
		this.accessToken = accessToken;
		this.userAgent = userAgent;
		this.baseUrl = `https://api.tiendanube.com/v1/${storeId}`;
	}

	async request(method, endpoint, data = null) {
		const url = `${this.baseUrl}${endpoint}`;

		const options = {
			method,
			headers: {
				Authentication: `bearer ${this.accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": this.userAgent,
			},
		};

		if (data && (method === "POST" || method === "PUT")) {
			options.body = JSON.stringify(data);
		}

		console.log(`📤 ${method} a TiendaNube: ${endpoint}`);

		const response = await fetch(url, options);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`TiendaNube API error: ${response.status} ${response.statusText} - ${errorText}`
			);
		}

		return response.json();
	}

	async createCategory(categoryData) {
		return this.request("POST", "/categories", categoryData);
	}

	async createProduct(productData) {
		return this.request("POST", "/products", productData);
	}

	async getCategories() {
		return this.request("GET", "/categories");
	}
}

// ==========================================
// Transformadores de datos
// ==========================================

function transformCategory(wcCategory) {
	return {
		name: {
			es: wcCategory.name,
		},
		description: {
			es: wcCategory.description || "",
		},
		handle: wcCategory.slug,
		parent: null, // Se actualizará después si tiene padre
		subcategories: [],
	};
}

function transformProduct(wcProduct, categoryMap) {
	// Mapear categorías de WooCommerce a TiendaNube
	const categories = wcProduct.categories
		.map((cat) => categoryMap[cat.id])
		.filter(Boolean);

	// Preparar variantes
	const variants = [];

	if (
		wcProduct.type === "variable" &&
		wcProduct.variations &&
		wcProduct.variations.length > 0
	) {
		// Producto con variantes - se manejarán por separado
		// TiendaNube requiere que las variantes se creen con el producto
		variants.push({
			price: wcProduct.price || "0",
			stock_management: wcProduct.manage_stock,
			stock: wcProduct.stock_quantity || 0,
			sku: wcProduct.sku || "",
			weight: wcProduct.weight || "0",
		});
	} else {
		// Producto simple
		variants.push({
			price: wcProduct.price || "0",
			stock_management: wcProduct.manage_stock,
			stock: wcProduct.stock_quantity || 0,
			sku: wcProduct.sku || "",
			weight: wcProduct.weight || "0",
		});
	}

	// Preparar imágenes
	const images =
		wcProduct.images?.map((img) => ({
			src: img.src,
			alt: img.alt || "",
		})) || [];

	return {
		name: {
			es: wcProduct.name,
		},
		description: {
			es: wcProduct.description || wcProduct.short_description || "",
		},
		handle: wcProduct.slug,
		categories: categories.length > 0 ? categories : undefined,
		published: wcProduct.status === "publish",
		free_shipping: wcProduct.shipping_class === "free-shipping",
		variants,
		images,
		seo_title: {
			es:
				wcProduct.meta_data?.find((m) => m.key === "_yoast_wpseo_title")
					?.value || wcProduct.name,
		},
		seo_description: {
			es:
				wcProduct.meta_data?.find((m) => m.key === "_yoast_wpseo_metadesc")
					?.value || "",
		},
	};
}

// ==========================================
// Utilidades de paralelización
// ==========================================

async function processBatch(items, batchSize, processor) {
	const results = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.allSettled(
			batch.map((item, batchIndex) => processor(item, i + batchIndex))
		);
		results.push(...batchResults);
	}
	return results;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================
// Migración
// ==========================================

async function migrateCategories(wcClient, tnClient) {
	console.log("\n🗂️  INICIANDO MIGRACIÓN DE CATEGORÍAS\n");

	const wcCategories = await wcClient.getCategories();
	console.log(`✓ Encontradas ${wcCategories.length} categorías en WooCommerce`);

	const categoryMap = {}; // Mapeo de ID de WC a ID de TN
	const categoriesByParent = {};

	// Agrupar categorías por padre
	wcCategories.forEach((cat) => {
		const parentId = cat.parent || 0;
		if (!categoriesByParent[parentId]) {
			categoriesByParent[parentId] = [];
		}
		categoriesByParent[parentId].push(cat);
	});

	// Migrar categorías de nivel superior primero (en lotes paralelos)
	const rootCategories = categoriesByParent[0] || [];

	const rootResults = await processBatch(
		rootCategories,
		config.options.concurrency,
		async (wcCat) => {
			const tnCategory = transformCategory(wcCat);

			if (config.options.dryRun) {
				console.log(`[DRY RUN] Crearía categoría: ${wcCat.name}`);
				categoryMap[wcCat.id] = `dry-run-${wcCat.id}`;
				return { success: true, cat: wcCat };
			} else {
				const created = await tnClient.createCategory(tnCategory);
				categoryMap[wcCat.id] = created.id;
				console.log(`✓ Categoría creada: ${wcCat.name} (ID: ${created.id})`);
				await sleep(100); // Pequeña pausa
				return { success: true, cat: wcCat };
			}
		}
	);

	// Contar errores en categorías raíz
	const rootErrors = rootResults.filter((r) => r.status === "rejected").length;
	if (rootErrors > 0) {
		console.log(`⚠ ${rootErrors} categorías raíz fallaron`);
	}

	// Migrar subcategorías (en lotes paralelos)
	const subCategories = wcCategories.filter(
		(cat) => cat.parent && cat.parent !== 0
	);

	if (subCategories.length > 0) {
		const subResults = await processBatch(
			subCategories,
			config.options.concurrency,
			async (wcCat) => {
				const tnCategory = transformCategory(wcCat);
				tnCategory.parent = categoryMap[wcCat.parent];

				if (config.options.dryRun) {
					console.log(
						`[DRY RUN] Crearía subcategoría: ${wcCat.name} (padre: ${wcCat.parent})`
					);
					categoryMap[wcCat.id] = `dry-run-${wcCat.id}`;
					return { success: true, cat: wcCat };
				} else if (tnCategory.parent) {
					const created = await tnClient.createCategory(tnCategory);
					categoryMap[wcCat.id] = created.id;
					console.log(
						`✓ Subcategoría creada: ${wcCat.name} (ID: ${created.id})`
					);
					await sleep(100);
					return { success: true, cat: wcCat };
				}
			}
		);

		const subErrors = subResults.filter((r) => r.status === "rejected").length;
		if (subErrors > 0) {
			console.log(`⚠ ${subErrors} subcategorías fallaron`);
		}
	}

	console.log(
		`\n✓ Migración de categorías completada: ${
			Object.keys(categoryMap).length
		} categorías\n`
	);

	return categoryMap;
}

async function migrateProducts(wcClient, tnClient, categoryMap) {
	console.log("\n📦 INICIANDO MIGRACIÓN DE PRODUCTOS\n");

	const wcProducts = await wcClient.getProducts();
	console.log(`✓ Encontrados ${wcProducts.length} productos en WooCommerce`);
	console.log(
		`⚡ Procesando en lotes de ${config.options.concurrency} productos simultáneos\n`
	);

	let successCount = 0;
	let errorCount = 0;
	let variableProductsCount = 0;
	let simpleProductsCount = 0;

	// Procesar productos en lotes paralelos
	const results = await processBatch(
		wcProducts,
		config.options.concurrency,
		async (wcProduct, index) => {
			const isVariable = wcProduct.type === "variable";

			if (isVariable) {
				const wcVariations = await getProductVariations(wcClient, wcProduct.id);

				if (config.options.dryRun) {
					console.log(
						`[${index + 1}/${wcProducts.length}] [DRY RUN] ${wcProduct.name} (${
							wcVariations.length
						} variaciones)`
					);
					return { success: true, type: "variable" };
				} else {
					const created = await createVariableProduct(
						tnClient,
						wcProduct,
						wcVariations,
						categoryMap
					);
					console.log(
						`✓ [${index + 1}/${wcProducts.length}] ${wcProduct.name} (${
							wcVariations.length
						} var) → ID: ${created.id}`
					);
					await sleep(200);
					return { success: true, type: "variable" };
				}
			} else {
				const tnProduct = transformProduct(wcProduct, categoryMap);

				if (config.options.dryRun) {
					console.log(
						`[${index + 1}/${wcProducts.length}] [DRY RUN] ${wcProduct.name}`
					);
					return { success: true, type: "simple" };
				} else {
					const created = await tnClient.createProduct(tnProduct);
					console.log(
						`✓ [${index + 1}/${wcProducts.length}] ${wcProduct.name} → ID: ${
							created.id
						}`
					);
					await sleep(200);
					return { success: true, type: "simple" };
				}
			}
		}
	);

	// Contar resultados
	results.forEach((result, index) => {
		if (result.status === "fulfilled") {
			successCount++;
			if (result.value.type === "variable") {
				variableProductsCount++;
			} else {
				simpleProductsCount++;
			}
		} else {
			errorCount++;
			console.error(
				`✗ Error en ${wcProducts[index]?.name}: ${
					result.reason?.message || "Desconocido"
				}`
			);
		}
	});

	console.log("\n✓ MIGRACIÓN DE PRODUCTOS COMPLETADA");
	console.log(`   Total: ${wcProducts.length}`);
	console.log(`   ✓ Exitosos: ${successCount} | ✗ Errores: ${errorCount}`);
	console.log(
		`   📦 Simples: ${simpleProductsCount} | 📋 Variables: ${variableProductsCount}\n`
	);

	return {
		total: wcProducts.length,
		success: successCount,
		errors: errorCount,
		simple: simpleProductsCount,
		variable: variableProductsCount,
	};
}

// ==========================================
// Función principal
// ==========================================

async function main() {
	console.log("\n========================================");
	console.log("🚀 MIGRACIÓN WOOCOMMERCE → TIENDANUBE");
	console.log("========================================\n");

	// Validar configuración
	if (!config.woocommerce.url || !config.woocommerce.consumerKey) {
		console.error("❌ Error: Falta configuración de WooCommerce");
		console.log(
			"Por favor configura las variables de entorno en el archivo .env"
		);
		process.exit(1);
	}

	if (!config.tiendanube.storeId || !config.tiendanube.accessToken) {
		console.error("❌ Error: Falta configuración de TiendaNube");
		console.log(
			"Por favor configura las variables de entorno en el archivo .env"
		);
		process.exit(1);
	}

	if (config.options.dryRun) {
		console.log("ℹ️  MODO DRY RUN ACTIVADO - No se crearán datos reales\n");
	}

	try {
		// Inicializar clientes
		const wcClient = new WooCommerceClient(
			config.woocommerce.url,
			config.woocommerce.consumerKey,
			config.woocommerce.consumerSecret
		);

		const tnClient = new TiendaNubeClient(
			config.tiendanube.storeId,
			config.tiendanube.accessToken,
			config.tiendanube.userAgent
		);

		// Migrar categorías
		const categoryMap = await migrateCategories(wcClient, tnClient);

		// Migrar productos
		const productStats = await migrateProducts(wcClient, tnClient, categoryMap);

		// Resumen final
		console.log("\n========================================");
		console.log("✅ MIGRACIÓN COMPLETADA");
		console.log("========================================");
		console.log(`📁 Categorías migradas: ${Object.keys(categoryMap).length}`);
		console.log(`📦 Productos procesados: ${productStats.total}`);
		console.log(`   ✓ Exitosos: ${productStats.success}`);
		console.log(`   ✗ Errores: ${productStats.errors}`);
		console.log(`   📦 Productos simples: ${productStats.simple}`);
		console.log(`   📋 Productos variables: ${productStats.variable}`);
		console.log("========================================\n");
	} catch (error) {
		console.error("\n❌ ERROR FATAL:", error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

// Ejecutar
main();
