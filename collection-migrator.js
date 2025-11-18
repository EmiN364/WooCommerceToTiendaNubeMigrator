import dotenv from "dotenv";
import fetch from "node-fetch";
import {
	createVariableProduct,
	getProductVariations,
} from "./variants-handler.js";

dotenv.config();

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
	targetCategory: {
		id: process.env.TIENDANUBE_TARGET_CATEGORY_ID
			? parseInt(process.env.TIENDANUBE_TARGET_CATEGORY_ID, 10)
			: null,
		handle: process.env.TIENDANUBE_TARGET_CATEGORY_HANDLE || null,
	},
	options: {
		dryRun: process.env.DRY_RUN === "true",
		concurrency: parseInt(process.env.CONCURRENCY || "5", 10),
		stockConcurrency: parseInt(process.env.STOCK_CONCURRENCY || "10", 10),
		defaultStockForUnmanaged: parseInt(
			process.env.DEFAULT_STOCK_FOR_UNMANAGED || "0",
			10
		),
	},
};

class WooCommerceClient {
	constructor(url, consumerKey, consumerSecret) {
		this.baseUrl = url;
		this.auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
			"base64"
		);
	}

	async request(endpoint, params = {}, page = 1, perPage = 100) {
		const url = new URL(`${this.baseUrl}/wp-json/wc/v3/${endpoint}`);
		url.searchParams.set("page", page.toString());
		url.searchParams.set("per_page", perPage.toString());

		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				url.searchParams.append(key, value);
			}
		});

		console.log(
			`📥 WooCommerce → ${endpoint} (página ${page}/${perPage}) ${Object.keys(
				params
			).length
				? `params: ${JSON.stringify(params)}`
				: ""
			}`.trim()
		);

		const response = await fetch(url.toString(), {
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

		return { data, totalPages };
	}

	async getAllPages(endpoint, params = {}) {
		const results = [];
		let page = 1;
		let totalPages = 1;

		do {
			const { data, totalPages: total } = await this.request(
				endpoint,
				params,
				page
			);
			results.push(...data);
			totalPages = total;
			page++;
		} while (page <= totalPages);

		return results;
	}

	async getCategories() {
		return this.getAllPages("products/categories");
	}

	async getProducts() {
		return this.getAllPages("products");
	}

	async getProductsByCategory(categoryId) {
		return this.getAllPages("products", { category: categoryId });
	}
}

class TiendaNubeClient {
	constructor(storeId, accessToken, userAgent) {
		this.storeId = storeId;
		this.accessToken = accessToken;
		this.userAgent = userAgent;
		this.baseUrl = `https://api.tiendanube.com/v1/${storeId}`;
	}

	async request(method, endpoint, { data = null, params = null } = {}) {
		const url = new URL(`${this.baseUrl}${endpoint}`);

		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					url.searchParams.append(key, value);
				}
			});
		}

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

		console.log(`📤 TiendaNube ${method} ${endpoint}`);

		const response = await fetch(url.toString(), options);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`TiendaNube API error: ${response.status} ${response.statusText} - ${errorText}`
			);
		}

		if (response.status === 204) {
			return null;
		}

		const text = await response.text();
		if (!text) {
			return null;
		}

		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}

	async createCategory(categoryData) {
		return this.request("POST", "/categories", { data: categoryData });
	}

	async createProduct(productData) {
		return this.request("POST", "/products", { data: productData });
	}

	async updateProduct(productId, productData) {
		return this.request("PUT", `/products/${productId}`, { data: productData });
	}

	async getCategories() {
		return this.request("GET", "/categories");
	}

	async getProductsPage(page = 1, perPage = 50) {
		return this.request("GET", "/products", {
			params: { page, per_page: perPage },
		});
	}

	async getAllProducts(perPage = 50) {
		const all = [];
		let page = 1;
		while (true) {
			const data = await this.getProductsPage(page, perPage);
			if (!Array.isArray(data) || data.length === 0) {
				break;
			}
			all.push(...data);
			if (data.length < perPage) {
				break;
			}
			page++;
			await sleep(100);
		}
		return all;
	}

	async updateVariantStock(productId, variantId, payload) {
		return this.request("PUT", `/products/${productId}/variants/${variantId}`, {
			data: payload,
		});
	}
}

function transformCategory(wcCategory, parentId = null) {
	return {
		name: {
			es: wcCategory.name,
		},
		description: {
			es: wcCategory.description || "",
		},
		handle: wcCategory.slug,
		parent: parentId,
	};
}

function normalizeName(value) {
	return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function transformProduct(wcProduct, categoryMap, forcedCategoryId = null) {
	const categories = wcProduct.categories
		.map((cat) => categoryMap[cat.id])
		.filter(Boolean);

	if (forcedCategoryId && !categories.includes(forcedCategoryId)) {
		categories.push(forcedCategoryId);
	}

	const variants = [
		{
			price: wcProduct.price || wcProduct.regular_price || "0",
			promotional_price: wcProduct.sale_price || null,
			stock_management: wcProduct.manage_stock,
			stock: wcProduct.stock_quantity || 0,
			sku: wcProduct.sku || "",
			weight: wcProduct.weight || "0",
		},
	];

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

function buildProductUpdatePayload(
	wcProduct,
	categoryIds,
	forcedCategoryId = null
) {
	const categorySet = new Set(categoryIds);
	if (forcedCategoryId) {
		categorySet.add(forcedCategoryId);
	}

	const payload = {
		name: {
			es: wcProduct.name,
		},
		description: {
			es: wcProduct.description || wcProduct.short_description || "",
		},
		published: wcProduct.status === "publish",
		free_shipping: wcProduct.shipping_class === "free-shipping",
		images:
			wcProduct.images?.map((img) => ({
				src: img.src,
				alt: img.alt || "",
			})) || [],
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
		tags: wcProduct.tags?.map((tag) => tag.name).join(", ") || "",
	};

	if (categorySet.size > 0) {
		payload.categories = Array.from(categorySet);
	}

	return payload;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processBatch(items, batchSize, processor) {
	const results = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.allSettled(
			batch.map((item, index) => processor(item, i + index))
		);
		results.push(...batchResults);
	}
	return results;
}

async function ensureCategory(
	wcCategoryId,
	wcCategoriesMap,
	categoryMap,
	tnClient,
	tnCategoryByHandle
) {
	if (categoryMap[wcCategoryId]) {
		return categoryMap[wcCategoryId];
	}

	const wcCategory = wcCategoriesMap.get(wcCategoryId);
	if (!wcCategory) {
		return null;
	}

	let parentId = null;
	if (wcCategory.parent && wcCategory.parent !== 0) {
		parentId = await ensureCategory(
			wcCategory.parent,
			wcCategoriesMap,
			categoryMap,
			tnClient,
			tnCategoryByHandle
		);
	}

	if (tnCategoryByHandle.has(wcCategory.slug)) {
		const existingId = tnCategoryByHandle.get(wcCategory.slug);
		categoryMap[wcCategory.id] = existingId;
		return existingId;
	}

	if (config.options.dryRun) {
		const fakeId = `dry-${wcCategory.id}`;
		categoryMap[wcCategory.id] = fakeId;
		console.log(`[DRY RUN] Crearía categoría: ${wcCategory.name}`);
		return fakeId;
	}

	const created = await tnClient.createCategory(
		transformCategory(wcCategory, parentId)
	);
	categoryMap[wcCategory.id] = created.id;
	tnCategoryByHandle.set(created.handle || wcCategory.slug, created.id);
	console.log(`✓ Categoría creada en TiendaNube: ${wcCategory.name}`);
	await sleep(100);
	return created.id;
}

function registerTiendaNubeProduct(product, caches) {
	if (!product || !product.id) {
		return;
	}

	if (product.handle) {
		caches.productByHandle.set(product.handle, product);
	}

	const productName =
		product.name?.es || product.name?.pt || product.name?.en || product.name;
	const normalizedName = normalizeName(productName);
	if (normalizedName) {
		caches.productByName.set(normalizedName, product);
	}

	if (Array.isArray(product.variants)) {
		product.variants.forEach((variant) => {
			if (variant.sku) {
				caches.variantBySku.set(variant.sku, {
					productId: product.id,
					variantId: variant.id,
					currentStock: variant.stock,
				});
			}
		});
	}
}

async function syncNewProducts({
	wcClient,
	tnClient,
	wcProducts,
	wcCategoriesMap,
	categoryMap,
	tnCaches,
	forcedCategoryId,
}) {
	console.log(
		`\n🆕 Buscando productos nuevos para TiendaNube (total WC: ${wcProducts.length})`
	);

	let created = 0;
	let updated = 0;
	let skipped = 0;
	let errors = 0;
	let variables = 0;
	let simples = 0;

	const results = await processBatch(
		wcProducts,
		config.options.concurrency,
		async (wcProduct, index) => {
			const position = index + 1;
			const normalizedProductName = normalizeName(wcProduct.name);

			if (normalizedProductName?.includes("bikini")) {
				console.log(
					`🚫 [${position}/${wcProducts.length}] ${wcProduct.name} omitido (contiene "bikini")`
				);
				return { type: "skipped" };
			}

			const existingProduct =
				tnCaches.productByHandle.get(wcProduct.slug) ||
				(normalizedProductName &&
					tnCaches.productByName.get(normalizedProductName));

			const hasCategories = (wcProduct.categories || []).length > 0;
			if (!hasCategories && !forcedCategoryId) {
				console.log(
					`⚠️  [${position}/${wcProducts.length}] ${wcProduct.name} sin categorías en WooCommerce y sin categoría fija configurada`
				);
				return { type: "skipped" };
			}

			for (const cat of wcProduct.categories || []) {
				await ensureCategory(
					cat.id,
					wcCategoriesMap,
					categoryMap,
					tnClient,
					tnCaches.categoryByHandle
				);
			}

			const resolvedCategories = (wcProduct.categories || [])
				.map((cat) => categoryMap[cat.id])
				.filter(Boolean);

			if (existingProduct) {
				const updatePayload = buildProductUpdatePayload(
					wcProduct,
					resolvedCategories,
					forcedCategoryId
				);

				if (config.options.dryRun) {
					console.log(
						`[${position}/${wcProducts.length}] [DRY RUN] Actualizaría producto existente: ${wcProduct.name}`
					);
					return { type: "updated" };
				}

				const updatedProduct = await tnClient.updateProduct(
					existingProduct.id,
					updatePayload
				);
				registerTiendaNubeProduct(updatedProduct || existingProduct, tnCaches);
				console.log(
					`↻ [${position}/${wcProducts.length}] ${wcProduct.name} actualizado`
				);
				await sleep(150);
				return { type: "updated" };
			}

			if (wcProduct.type === "variable") {
				variables++;
				const wcVariations = await getProductVariations(
					wcClient,
					wcProduct.id
				);

				if (config.options.dryRun) {
					console.log(
						`[DRY RUN] [${position}/${wcProducts.length}] ${wcProduct.name} (${wcVariations.length} variaciones)`
					);
					return { type: "variable" };
				}

				const created = await createVariableProduct(
					tnClient,
					{
						...wcProduct,
						categories: wcProduct.categories,
					},
					wcVariations,
					categoryMap,
					forcedCategoryId
				);
				registerTiendaNubeProduct(created, tnCaches);
				console.log(
					`✓ [${position}/${wcProducts.length}] ${wcProduct.name} (${wcVariations.length} variaciones)`
				);
				await sleep(200);
				return { type: "variable" };
			}

			simples++;
			const tnProductPayload = transformProduct(
				{ ...wcProduct, categories: wcProduct.categories },
				categoryMap,
				forcedCategoryId
			);

			if (config.options.dryRun) {
				console.log(
					`[DRY RUN] [${position}/${wcProducts.length}] ${wcProduct.name}`
				);
				return { type: "simple" };
			}

			const created = await tnClient.createProduct(tnProductPayload);
			registerTiendaNubeProduct(created, tnCaches);
			console.log(
				`✓ [${position}/${wcProducts.length}] ${wcProduct.name} creado`
			);
			await sleep(200);
			return { type: "simple" };
		}
	);

	results.forEach((result) => {
		if (result.status === "fulfilled") {
			if (result.value.type === "variable" || result.value.type === "simple") {
				created++;
			} else if (result.value.type === "updated") {
				updated++;
			} else {
				skipped++;
			}
		} else {
			errors++;
			console.error("✗ Error migrando producto:", result.reason?.message);
		}
	});

	return {
		created,
		updated,
		skipped,
		errors,
		variables,
		simples,
		total: wcProducts.length,
	};
}

async function buildWooCommerceStockMap(wcClient, cachedProducts = null) {
	console.log("\n📊 Construyendo mapa de stock desde WooCommerce...");
	const stockMap = new Map();
	const wcProducts = cachedProducts || (await wcClient.getProducts());

	for (const wcProduct of wcProducts) {
		if (wcProduct.type === "variable") {
			const variations = await getProductVariations(wcClient, wcProduct.id);
			variations.forEach((variation) => {
				if (!variation.sku) {
					return;
				}
				stockMap.set(variation.sku, {
					stock: variation.stock_quantity ?? 0,
					manageStock: variation.manage_stock ?? false,
				});
			});
		} else if (wcProduct.sku) {
			stockMap.set(wcProduct.sku, {
				stock:
					wcProduct.manage_stock && typeof wcProduct.stock_quantity === "number"
						? wcProduct.stock_quantity
						: config.options.defaultStockForUnmanaged,
				manageStock: wcProduct.manage_stock ?? false,
			});
		}
	}

	console.log(`✓ Mapa de stock generado (${stockMap.size} SKUs)\n`);
	return stockMap;
}

async function updateStockForExistingProducts({
	tnClient,
	tnCaches,
	wooStockMap,
}) {
	console.log("🔄 Actualizando stock en TiendaNube...");
	const variantEntries = Array.from(tnCaches.variantBySku.entries());

	let updated = 0;
	let missing = 0;
	let unchanged = 0;

	const results = await processBatch(
		variantEntries,
		config.options.stockConcurrency,
		async ([sku, variantInfo]) => {
			const wooStock = wooStockMap.get(sku);
			if (!wooStock) {
				return { type: "missing" };
			}

			const payload = {
				stock: wooStock.stock,
				stock_management: wooStock.manageStock,
			};

			if (variantInfo.currentStock === wooStock.stock) {
				return { type: "unchanged" };
			}

			if (config.options.dryRun) {
				console.log(
					`[DRY RUN] Actualizaría SKU ${sku} → stock ${wooStock.stock}`
				);
				return { type: "updated" };
			}

			await tnClient.updateVariantStock(
				variantInfo.productId,
				variantInfo.variantId,
				payload
			);
			await sleep(100);
			return { type: "updated" };
		}
	);

	results.forEach((result) => {
		if (result.status !== "fulfilled") {
			missing++;
			console.error("✗ Error actualizando stock:", result.reason?.message);
			return;
		}

		switch (result.value.type) {
			case "missing":
				missing++;
				break;
			case "unchanged":
				unchanged++;
				break;
			case "updated":
				updated++;
				break;
			default:
				break;
		}
	});

	return { updated, missing, unchanged, total: variantEntries.length };
}

async function main() {
	console.log("\n========================================");
	console.log("🆕 NUEVOS PRODUCTOS + SINCRONIZACIÓN DE STOCK");
	console.log("========================================\n");

	if (!config.woocommerce.url || !config.woocommerce.consumerKey) {
		throw new Error("Falta configuración de WooCommerce");
	}

	if (!config.tiendanube.storeId || !config.tiendanube.accessToken) {
		throw new Error("Falta configuración de TiendaNube");
	}

	if (!config.targetCategory.id && !config.targetCategory.handle) {
		throw new Error(
			"Debes definir TIENDANUBE_TARGET_CATEGORY_ID o TIENDANUBE_TARGET_CATEGORY_HANDLE en tu .env"
		);
	}

	if (config.options.dryRun) {
		console.log("ℹ️  MODO DRY RUN ACTIVADO - No se crearán datos reales\n");
	}

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

	const tnCategories = await tnClient.getCategories();
	const tnCategoryByHandle = new Map(
		(tnCategories || []).map((cat) => [cat.handle, cat.id])
	);

	const forcedCategoryId =
		config.targetCategory.id ||
		(config.targetCategory.handle &&
			tnCategoryByHandle.get(config.targetCategory.handle));

	if (!forcedCategoryId) {
		throw new Error(
			"No se encontró la categoría de TiendaNube configurada. Verifica el ID/handle."
		);
	}
	console.log(
		`📂 Categoría fija en TiendaNube: ${forcedCategoryId}${
			config.targetCategory.handle
				? ` (handle: ${config.targetCategory.handle})`
				: ""
		}`
	);

	const wcCategories = await wcClient.getCategories();
	const wcCategoriesMap = new Map(wcCategories.map((cat) => [cat.id, cat]));

	const tnProducts = await tnClient.getAllProducts();
	const tnCaches = {
		productByHandle: new Map(),
		productByName: new Map(),
		variantBySku: new Map(),
		categoryByHandle: tnCategoryByHandle,
	};
	tnProducts.forEach((product) => registerTiendaNubeProduct(product, tnCaches));

	const categoryMap = {};
	const wcProducts = await wcClient.getProducts();

	const migrationStats = await syncNewProducts({
		wcClient,
		tnClient,
		wcProducts,
		wcCategoriesMap,
		categoryMap,
		tnCaches,
		forcedCategoryId,
	});

	const wooStockMap = await buildWooCommerceStockMap(wcClient, wcProducts);
	const stockStats = await updateStockForExistingProducts({
		tnClient,
		tnCaches,
		wooStockMap,
	});

	console.log("\n========================================");
	console.log("✅ PROCESO COMPLETADO");
	console.log("========================================");
	console.log(
		`📦 Nuevos productos → Total: ${migrationStats.total}, Creados: ${migrationStats.created}, Actualizados: ${migrationStats.updated}, Saltados: ${migrationStats.skipped}, Errores: ${migrationStats.errors}`
	);
	console.log(
		`   • Simples: ${migrationStats.simples} | Variables: ${migrationStats.variables}`
	);
	console.log(
		`📊 Stock → Total SKUs: ${stockStats.total}, Actualizados: ${stockStats.updated}, Sin cambios: ${stockStats.unchanged}, Sin SKU en WooCommerce: ${stockStats.missing}`
	);
	console.log("========================================\n");
}

main().catch((error) => {
	console.error("\n❌ ERROR FATAL:", error.message);
	console.error(error.stack);
	process.exit(1);
});

