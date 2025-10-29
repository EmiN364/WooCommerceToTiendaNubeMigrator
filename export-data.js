/**
 * Script para exportar datos de WooCommerce a archivos JSON
 * Útil para hacer un backup o análisis antes de migrar
 */

import dotenv from "dotenv";
import fs from "fs/promises";
import fetch from "node-fetch";
import path from "path";

dotenv.config();

// Cliente WooCommerce (reutilizado del script principal)
class WooCommerceClient {
	constructor(url, consumerKey, consumerSecret) {
		this.baseUrl = url;
		this.auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
			"base64"
		);
	}

	async request(endpoint, page = 1, perPage = 100) {
		const url = `${this.baseUrl}/wp-json/wc/v3/${endpoint}?page=${page}&per_page=${perPage}`;

		console.log(`📥 Obteniendo: ${endpoint} (página ${page})`);

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

	async getProductVariations(productId) {
		return this.getAllPages(`products/${productId}/variations`);
	}
}

// Crear directorio para exports
async function ensureExportDir() {
	const exportDir = path.join(process.cwd(), "exports");
	try {
		await fs.mkdir(exportDir, { recursive: true });
		return exportDir;
	} catch (error) {
		console.error("Error creando directorio de exports:", error);
		throw error;
	}
}

// Exportar categorías
async function exportCategories(client, exportDir) {
	console.log("\n📁 Exportando categorías...");

	const categories = await client.getCategories();
	const filePath = path.join(exportDir, "categories.json");

	await fs.writeFile(filePath, JSON.stringify(categories, null, 2));

	console.log(`✓ ${categories.length} categorías exportadas a: ${filePath}`);

	return categories;
}

// Procesar en lotes
async function processBatch(items, batchSize, processor) {
	const results = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.all(batch.map(processor));
		results.push(...batchResults);
	}
	return results;
}

// Exportar productos con sus variaciones (paralelizado)
async function exportProducts(client, exportDir) {
	console.log("\n📦 Exportando productos...");

	const products = await client.getProducts();
	console.log(`⚡ Procesando en lotes de 5 productos simultáneos\n`);

	let variableCount = 0;
	let simpleCount = 0;

	const productsWithVariations = await processBatch(
		products,
		5,
		async (product, index) => {
			console.log(
				`[${products.indexOf(product) + 1}/${products.length}] ${
					product.name
				} (${product.type})`
			);

			const productData = {
				...product,
				variations: null,
			};

			if (product.type === "variable") {
				variableCount++;
				const variations = await client.getProductVariations(product.id);
				productData.variations = variations;
				console.log(`  └─ ${variations.length} variaciones`);
			} else {
				simpleCount++;
			}

			return productData;
		}
	);

	const filePath = path.join(exportDir, "products.json");
	await fs.writeFile(filePath, JSON.stringify(productsWithVariations, null, 2));

	console.log(`✓ ${products.length} productos exportados a: ${filePath}`);
	console.log(`  📦 Simples: ${simpleCount} | 📋 Variables: ${variableCount}`);

	return productsWithVariations;
}

// Generar reporte de análisis
async function generateReport(categories, products, exportDir) {
	console.log("\n📊 Generando reporte de análisis...");

	const report = {
		timestamp: new Date().toISOString(),
		summary: {
			totalCategories: categories.length,
			totalProducts: products.length,
			simpleProducts: products.filter((p) => p.type === "simple").length,
			variableProducts: products.filter((p) => p.type === "variable").length,
			totalVariations: 0,
			productsWithImages: products.filter(
				(p) => p.images && p.images.length > 0
			).length,
			productsWithSKU: products.filter((p) => p.sku).length,
			productsInStock: products.filter((p) => p.stock_status === "instock")
				.length,
			publishedProducts: products.filter((p) => p.status === "publish").length,
		},
		categories: {
			topLevel: categories.filter((c) => c.parent === 0).length,
			subcategories: categories.filter((c) => c.parent !== 0).length,
			byName: categories.map((c) => ({
				id: c.id,
				name: c.name,
				slug: c.slug,
				parent: c.parent,
				productCount: c.count,
			})),
		},
		products: {
			priceRange: {
				min: Math.min(...products.map((p) => parseFloat(p.price) || 0)),
				max: Math.max(...products.map((p) => parseFloat(p.price) || 0)),
				average:
					products.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0) /
					products.length,
			},
			withoutPrice: products.filter((p) => !p.price || p.price === "0").length,
			withoutStock: products.filter(
				(p) => !p.manage_stock && p.stock_status !== "instock"
			).length,
		},
		variations: {
			total: 0,
			byProduct: [],
		},
	};

	// Análisis de variaciones
	products
		.filter((p) => p.type === "variable")
		.forEach((product) => {
			const variationCount = product.variations?.length || 0;
			report.summary.totalVariations += variationCount;

			if (variationCount > 0) {
				report.variations.byProduct.push({
					id: product.id,
					name: product.name,
					variationCount,
					attributes: product.attributes?.map((a) => a.name) || [],
				});
			}
		});

	const filePath = path.join(exportDir, "report.json");
	await fs.writeFile(filePath, JSON.stringify(report, null, 2));

	console.log(`✓ Reporte generado: ${filePath}`);

	// Mostrar resumen en consola
	console.log("\n========================================");
	console.log("📊 RESUMEN DE DATOS");
	console.log("========================================");
	console.log(`📁 Categorías: ${report.summary.totalCategories}`);
	console.log(`   └─ Principales: ${report.categories.topLevel}`);
	console.log(`   └─ Subcategorías: ${report.categories.subcategories}`);
	console.log(`\n📦 Productos: ${report.summary.totalProducts}`);
	console.log(`   └─ Simples: ${report.summary.simpleProducts}`);
	console.log(`   └─ Variables: ${report.summary.variableProducts}`);
	console.log(`   └─ Total variaciones: ${report.summary.totalVariations}`);
	console.log(`   └─ Publicados: ${report.summary.publishedProducts}`);
	console.log(`   └─ Con imágenes: ${report.summary.productsWithImages}`);
	console.log(`   └─ Con SKU: ${report.summary.productsWithSKU}`);
	console.log(`\n💰 Precios:`);
	console.log(`   └─ Mínimo: $${report.products.priceRange.min.toFixed(2)}`);
	console.log(`   └─ Máximo: $${report.products.priceRange.max.toFixed(2)}`);
	console.log(
		`   └─ Promedio: $${report.products.priceRange.average.toFixed(2)}`
	);
	console.log(`   └─ Sin precio: ${report.products.withoutPrice}`);
	console.log("========================================\n");

	return report;
}

// Función principal
async function main() {
	console.log("\n========================================");
	console.log("📤 EXPORTACIÓN DE DATOS DE WOOCOMMERCE");
	console.log("========================================\n");

	// Validar configuración
	const url = process.env.WOOCOMMERCE_URL;
	const key = process.env.WOOCOMMERCE_CONSUMER_KEY;
	const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

	if (!url || !key || !secret) {
		console.error("❌ Error: Falta configuración de WooCommerce en .env");
		process.exit(1);
	}

	try {
		// Crear directorio de exports
		const exportDir = await ensureExportDir();
		console.log(`📁 Directorio de exportación: ${exportDir}\n`);

		// Inicializar cliente
		const client = new WooCommerceClient(url, key, secret);

		// Exportar datos
		const categories = await exportCategories(client, exportDir);
		const products = await exportProducts(client, exportDir);

		// Generar reporte
		await generateReport(categories, products, exportDir);

		console.log("✅ Exportación completada exitosamente!\n");
	} catch (error) {
		console.error("\n❌ ERROR:", error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

main();
