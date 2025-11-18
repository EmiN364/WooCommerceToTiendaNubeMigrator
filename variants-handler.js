/**
 * Manejador especializado para productos variables y sus variantes
 * WooCommerce y TiendaNube manejan las variantes de forma diferente,
 * este módulo ayuda a transformar correctamente entre ambos sistemas.
 */

/**
 * Obtiene todas las variaciones de un producto variable de WooCommerce
 */
export async function getProductVariations(wcClient, productId) {
	try {
		const variations = await wcClient.getAllPages(
			`products/${productId}/variations`
		);
		return variations;
	} catch (error) {
		console.error(
			`Error obteniendo variaciones del producto ${productId}:`,
			error.message
		);
		return [];
	}
}

/**
 * Transforma las variaciones de WooCommerce al formato de TiendaNube
 */
export function transformVariations(wcVariations, wcProduct) {
	if (!wcVariations || wcVariations.length === 0) {
		// Producto simple - crear una única variante
		return [
			{
				price: wcProduct.price || wcProduct.regular_price || "0",
				promotional_price: wcProduct.sale_price || null,
				stock_management: wcProduct.manage_stock,
				stock: wcProduct.stock_quantity || 0,
				sku: wcProduct.sku || "",
				weight: wcProduct.weight || "0",
				width: wcProduct.dimensions?.width || null,
				height: wcProduct.dimensions?.height || null,
				depth: wcProduct.dimensions?.length || null,
			},
		];
	}

	// Producto variable - transformar cada variación
	return wcVariations.map((variation, index) => {
		const variant = {
			price: variation.price || variation.regular_price || "0",
			promotional_price: variation.sale_price || null,
			stock_management: variation.manage_stock,
			stock: variation.stock_quantity || 0,
			sku: variation.sku || `${wcProduct.sku}-var-${index + 1}`,
			weight: variation.weight || wcProduct.weight || "0",
			width: variation.dimensions?.width || wcProduct.dimensions?.width || null,
			height:
				variation.dimensions?.height || wcProduct.dimensions?.height || null,
			depth:
				variation.dimensions?.length || wcProduct.dimensions?.length || null,
			barcode:
				variation.meta_data?.find((m) => m.key === "_alg_ean")?.value || null,
		};

		// Agregar atributos de la variación
		if (variation.attributes && variation.attributes.length > 0) {
			variant.values = variation.attributes.map((attr) => ({
				es: attr.option,
			}));
		}

		// Agregar imagen específica de la variación si existe
		if (variation.image?.src) {
			variant.image = {
				src: variation.image.src,
				alt: variation.image.alt || "",
			};
		}

		return variant;
	});
}

/**
 * Extrae los atributos/opciones del producto para crear en TiendaNube
 */
export function extractProductAttributes(wcProduct, wcVariations) {
	const attributes = [];

	if (wcProduct.type !== "variable" || !wcProduct.attributes) {
		return attributes;
	}

	// WooCommerce tiene atributos en el producto principal
	wcProduct.attributes.forEach((attr) => {
		if (attr.variation) {
			// Solo atributos usados para variaciones
			attributes.push({
				es: attr.name,
			});
		}
	});

	return attributes;
}

/**
 * Crea un producto variable completo en TiendaNube
 * con todas sus variantes y atributos
 */
export async function createVariableProduct(
	tnClient,
	wcProduct,
	wcVariations,
	categoryMap,
	forcedCategoryId = null
) {
	// Preparar atributos
	const attributes = extractProductAttributes(wcProduct, wcVariations);

	// Preparar variantes
	const variants = transformVariations(wcVariations, wcProduct);

	// Preparar categorías
	const categories = wcProduct.categories
		.map((cat) => categoryMap[cat.id])
		.filter(Boolean);

	if (forcedCategoryId && !categories.includes(forcedCategoryId)) {
		categories.push(forcedCategoryId);
	}

	// Preparar imágenes del producto principal
	const images =
		wcProduct.images?.map((img) => ({
			src: img.src,
			alt: img.alt || "",
		})) || [];

	// Construir el producto completo
	const productData = {
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
		attributes: attributes.length > 0 ? attributes : undefined,
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

	// Crear en TiendaNube
	return await tnClient.createProduct(productData);
}

/**
 * Valida que una variación tenga los datos mínimos necesarios
 */
export function validateVariation(variation) {
	const errors = [];

	if (!variation.price || variation.price === "0") {
		errors.push("Precio no válido o cero");
	}

	if (variation.stock_management && !variation.stock && variation.stock !== 0) {
		errors.push("Gestión de stock activada pero sin cantidad definida");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * Genera un reporte de las variaciones de un producto
 */
export function generateVariationsReport(wcProduct, wcVariations) {
	const report = {
		productId: wcProduct.id,
		productName: wcProduct.name,
		productType: wcProduct.type,
		totalVariations: wcVariations?.length || 0,
		attributes: wcProduct.attributes?.filter((attr) => attr.variation) || [],
		variations: [],
	};

	if (wcVariations && wcVariations.length > 0) {
		wcVariations.forEach((variation) => {
			const validation = validateVariation(variation);

			report.variations.push({
				id: variation.id,
				sku: variation.sku,
				price: variation.price,
				stock: variation.stock_quantity,
				attributes: variation.attributes,
				valid: validation.valid,
				errors: validation.errors,
				image: variation.image?.src || null,
			});
		});
	}

	return report;
}

export default {
	getProductVariations,
	transformVariations,
	extractProductAttributes,
	createVariableProduct,
	validateVariation,
	generateVariationsReport,
};
