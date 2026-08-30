export async function lookupBarcode(barcode: string): Promise<{
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  found: boolean;
}> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      return { foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, found: false };
    }

    const p = data.product;
    const nutriments = p.nutriments || {};

    return {
      foodName: p.product_name || p.generic_name || 'Unknown Product',
      calories: Math.round(nutriments['energy-kcal_serving'] || nutriments['energy-kcal_100g'] || 0),
      protein: Math.round((nutriments['proteins_serving'] || nutriments['proteins_100g'] || 0) * 10) / 10,
      carbs: Math.round((nutriments['carbohydrates_serving'] || nutriments['carbohydrates_100g'] || 0) * 10) / 10,
      fat: Math.round((nutriments['fat_serving'] || nutriments['fat_100g'] || 0) * 10) / 10,
      found: true
    };
  } catch (e) {
    return { foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, found: false };
  }
}
