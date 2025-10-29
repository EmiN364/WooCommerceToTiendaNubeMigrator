/**
 * Script para probar las conexiones a WooCommerce y TiendaNube
 * antes de ejecutar la migración completa
 */

import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const colors = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
};

function log(color, symbol, message) {
	console.log(`${color}${symbol}${colors.reset} ${message}`);
}

function success(message) {
	log(colors.green, "✓", message);
}

function error(message) {
	log(colors.red, "✗", message);
}

function info(message) {
	log(colors.blue, "ℹ", message);
}

function warning(message) {
	log(colors.yellow, "⚠", message);
}

// Test WooCommerce
async function testWooCommerce() {
	console.log("\n" + "=".repeat(50));
	console.log("🛒 PROBANDO CONEXIÓN A WOOCOMMERCE");
	console.log("=".repeat(50) + "\n");

	const url = process.env.WOOCOMMERCE_URL;
	const key = process.env.WOOCOMMERCE_CONSUMER_KEY;
	const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

	// Validar configuración
	if (!url) {
		error("WOOCOMMERCE_URL no está configurado");
		return false;
	}
	if (!key) {
		error("WOOCOMMERCE_CONSUMER_KEY no está configurado");
		return false;
	}
	if (!secret) {
		error("WOOCOMMERCE_CONSUMER_SECRET no está configurado");
		return false;
	}

	success("Variables de entorno configuradas");
	info(`URL: ${url}`);
	info(`Consumer Key: ${key.substring(0, 10)}...`);

	try {
		// Intentar obtener información de la tienda
		const auth = Buffer.from(`${key}:${secret}`).toString("base64");
		const testUrl = `${url}/wp-json/wc/v3/system_status`;

		info("Probando endpoint de WooCommerce...");

		const response = await fetch(testUrl, {
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			error(`Error HTTP: ${response.status} ${response.statusText}`);

			if (response.status === 401) {
				error("Autenticación fallida. Verifica tus credenciales.");
			} else if (response.status === 404) {
				error("Endpoint no encontrado. ¿La API REST está habilitada?");
			}

			return false;
		}

		const data = await response.json();
		success("Conexión exitosa a WooCommerce!");

		// Obtener estadísticas básicas
		const categoriesUrl = `${url}/wp-json/wc/v3/products/categories?per_page=1`;
		const productsUrl = `${url}/wp-json/wc/v3/products?per_page=1`;

		const [catResponse, prodResponse] = await Promise.all([
			fetch(categoriesUrl, { headers: { Authorization: `Basic ${auth}` } }),
			fetch(productsUrl, { headers: { Authorization: `Basic ${auth}` } }),
		]);

		const totalCategories = catResponse.headers.get("x-wp-total");
		const totalProducts = prodResponse.headers.get("x-wp-total");

		console.log("\n📊 Estadísticas:");
		info(`Categorías totales: ${totalCategories || "N/A"}`);
		info(`Productos totales: ${totalProducts || "N/A"}`);

		if (data.environment) {
			info(`WordPress: ${data.environment.wp_version || "N/A"}`);
			info(`WooCommerce: ${data.environment.wc_version || "N/A"}`);
		}

		return true;
	} catch (err) {
		error(`Error de conexión: ${err.message}`);

		if (err.message.includes("ENOTFOUND")) {
			error("No se puede resolver el nombre de dominio. Verifica la URL.");
		} else if (err.message.includes("ECONNREFUSED")) {
			error("Conexión rechazada. Verifica que el servidor esté accesible.");
		}

		return false;
	}
}

// Test TiendaNube
async function testTiendaNube() {
	console.log("\n" + "=".repeat(50));
	console.log("🏪 PROBANDO CONEXIÓN A TIENDANUBE");
	console.log("=".repeat(50) + "\n");

	const storeId = process.env.TIENDANUBE_STORE_ID;
	const token = process.env.TIENDANUBE_ACCESS_TOKEN;
	const userAgent = process.env.TIENDANUBE_USER_AGENT;

	// Validar configuración
	if (!storeId) {
		error("TIENDANUBE_STORE_ID no está configurado");
		return false;
	}
	if (!token) {
		error("TIENDANUBE_ACCESS_TOKEN no está configurado");
		return false;
	}
	if (!userAgent) {
		warning("TIENDANUBE_USER_AGENT no está configurado (recomendado)");
	}

	success("Variables de entorno configuradas");
	info(`Store ID: ${storeId}`);
	info(`Access Token: ${token.substring(0, 10)}...`);
	info(`User Agent: ${userAgent || "Sin configurar"}`);

	try {
		const baseUrl = `https://api.tiendanube.com/v1/${storeId}`;

		info("Probando endpoint de TiendaNube...");

		// Probar obteniendo información de la tienda
		const response = await fetch(`${baseUrl}/store`, {
			headers: {
				Authentication: `bearer ${token}`,
				"Content-Type": "application/json",
				"User-Agent": userAgent || "Test Script",
			},
		});

		if (!response.ok) {
			error(`Error HTTP: ${response.status} ${response.statusText}`);

			if (response.status === 401) {
				error("Autenticación fallida. Verifica tu access token.");
			} else if (response.status === 403) {
				error("Permisos insuficientes. Verifica los scopes de tu app.");
			} else if (response.status === 404) {
				error("Tienda no encontrada. Verifica el Store ID.");
			}

			const errorText = await response.text();
			console.log("Detalles:", errorText);

			return false;
		}

		const store = await response.json();
		success("Conexión exitosa a TiendaNube!");

		console.log("\n📊 Información de la tienda:");
		info(`Nombre: ${store.name || "N/A"}`);
		info(`URL: ${store.url || "N/A"}`);
		info(`Email: ${store.email || "N/A"}`);
		info(`País: ${store.country || "N/A"}`);
		info(`Idioma: ${store.language || "N/A"}`);

		// Probar permisos obteniendo categorías
		const categoriesResponse = await fetch(`${baseUrl}/categories`, {
			headers: {
				Authentication: `bearer ${token}`,
				"Content-Type": "application/json",
				"User-Agent": userAgent || "Test Script",
			},
		});

		if (categoriesResponse.ok) {
			const categories = await categoriesResponse.json();
			info(`Categorías existentes: ${categories.length}`);
		}

		return true;
	} catch (err) {
		error(`Error de conexión: ${err.message}`);

		if (err.message.includes("ENOTFOUND")) {
			error("No se puede resolver api.tiendanube.com");
		} else if (err.message.includes("ECONNREFUSED")) {
			error("Conexión rechazada.");
		}

		return false;
	}
}

// Main
async function main() {
	console.log("\n" + "=".repeat(50));
	console.log("🧪 TEST DE CONEXIONES");
	console.log("=".repeat(50));

	const wcOk = await testWooCommerce();
	const tnOk = await testTiendaNube();

	console.log("\n" + "=".repeat(50));
	console.log("📋 RESUMEN");
	console.log("=".repeat(50) + "\n");

	if (wcOk) {
		success("WooCommerce: Conexión OK");
	} else {
		error("WooCommerce: Conexión FALLIDA");
	}

	if (tnOk) {
		success("TiendaNube: Conexión OK");
	} else {
		error("TiendaNube: Conexión FALLIDA");
	}

	console.log("\n");

	if (wcOk && tnOk) {
		success("¡Todas las conexiones están funcionando!");
		console.log("\n✨ Puedes proceder con la migración usando:");
		console.log("   npm start (modo dry-run)");
		console.log("   o npm run export (exportar datos primero)");
	} else {
		error("Hay problemas de conexión. Revisa la configuración.");
		console.log("\n💡 Verifica tu archivo .env y las credenciales de las APIs");
	}

	console.log("\n");

	process.exit(wcOk && tnOk ? 0 : 1);
}

main();
