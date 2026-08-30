import { UserContext, contextToPromptString } from './userContext';
import { supabase } from './supabase';

export async function recognizeAndRoast(
  base64Image: string,
  ctx: UserContext,
  foodHint?: string,
  mode: 'food' | 'label' = 'food'
): Promise<{
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  roast: string;
  nutritionScore: number;
  healthImpact: number;
  suggestions: string;
  foodQuality: 'Excellent' | 'Good' | 'Processed' | 'Poor';
  servingSize?: string;
  sugar?: number;
  fiber?: number;
  ingredients?: string;
  foodIdentificationConfidence?: number;
  portionEstimationConfidence?: number;
  nutritionEstimationConfidence?: number;
  detectedItems?: string[] | null;
  alternatives?: string[];
  isDrink?: boolean;
  drinkType?: string | null;
  drinkConfidence?: number | null;
  isFood?: boolean;
}> {
  console.log(`recognizeAndRoast: Starting unified photo recognition with UserContext in mode: ${mode}...`);
  const { data, error: invokeError } = await supabase.functions.invoke('gemini-proxy', {
    body: {
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
          {
            text: mode === 'label'
              ? `You are an expert nutrition label analyzer. Extract the nutrition information and ingredients list from this image of a nutrition facts label or ingredients label.
${foodHint ? `\nUser's hint/help about what's in the photo: "${foodHint}"\n` : ''}

${contextToPromptString(ctx)}

Return ONLY raw JSON no markdown:
{
  "food_name": "specific food/brand name",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "roast": "2-3 sentence brutal funny roast. Reference the ingredients if they are junk. Use bro or bestie. Not mean, just real.",
  "nutrition_score": number,
  "health_impact": number,
  "suggestions": "1-2 sentence suggestions or warnings based on the ingredients/nutrition profile.",
  "food_quality": "Excellent | Good | Processed | Poor",
  "serving_size": "e.g. 1 package (45g) or 100g",
  "sugar_g": number,
  "fiber_g": number,
  "ingredients": "comma separated ingredients list if visible",
  "food_identification_confidence": number,
  "portion_estimation_confidence": number,
  "nutrition_estimation_confidence": number,
  "detected_items": ["item1"] or null,
  "alternatives": ["alt1", "alt2"],
  "is_drink": boolean,
  "drink_type": "Protein Shake" | "Cold Coffee" | "Chocolate Shake" | "Iced Latte" | "Mocha" | "Milk Tea" | "Tea" | "Smoothie" | "Juice" | "Milkshake" | "Soda" | "Other" | null,
  "drink_confidence": number or null,
  "is_food": boolean
}

Rules:
- Respect user goals, diet types, and diabetes flags strictly.
- nutrition_score should be a value from 1 to 10 (representing nutrition density/quality)
- health_impact should be a signed integer (e.g. +6 or -4) indicating estimated impact on their daily goals.
- Set "is_food" to true if this is a nutrition label or ingredient list of a food item, and false otherwise.
- If not a nutrition label or ingredient list, return: {"error": "not_label"}`
              : `You are a brutally honest funny nutritionist AI. Analyze this food image.
${foodHint ? `\nUser's hint/help about what's in the photo: "${foodHint}"\n` : ''}

${contextToPromptString(ctx)}

Return ONLY raw JSON no markdown:
{
  "food_name": "clean food title",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "roast": "2-3 sentence brutal funny roast. Reference their ACTUAL numbers — calories remaining, protein deficit, streak, most eaten food this week. Use bro or bestie. Not mean, just real.",
  "nutrition_score": number,
  "health_impact": number,
  "suggestions": "1-2 sentence suggestions to improve user food choices.",
  "food_quality": "Excellent | Good | Processed | Poor",
  "serving_size": "e.g. 1 cup or 1 bowl",
  "sugar_g": number,
  "fiber_g": number,
  "ingredients": "comma separated ingredients list",
  "food_identification_confidence": number,
  "portion_estimation_confidence": number,
  "nutrition_estimation_confidence": number,
  "detected_items": ["item 1", "item 2"] or null,
  "alternatives": ["similar food 1", "similar food 2", "similar food 3"],
  "is_drink": boolean,
  "drink_type": "Protein Shake" | "Cold Coffee" | "Chocolate Shake" | "Iced Latte" | "Mocha" | "Milk Tea" | "Tea" | "Smoothie" | "Juice" | "Milkshake" | "Soda" | "Other" | null,
  "drink_confidence": number or null,
  "is_food": boolean
}

Rules:
- Estimate the portion nutrition values for a "Regular" baseline portion (so adjustments to Small or Large can be calculated dynamically).
- Use plate size, bowl size, cup size, food volume, cutlery, relative object sizes, visible hands if available, packaging dimensions, and context clues to estimate the portion and macros. Do NOT rely only on hand size.
- If multiple distinct foods are detected in the plate/meal (e.g. thali, buffet, mixed plate, Indian Dal/Rice/Roti combo), do NOT create long food_names like "Dal + Rice + Roti + Paneer". Instead, use a clean generic title for "food_name" such as "Lunch Meal", "Dinner Meal", "Indian Lunch", "Indian Dinner", or "Meal Detected". Also, return the individual component food items in the "detected_items" array.
- If a single clear food item is detected, use its specific name (e.g. "Chicken Biryani", "Masala Dosa", "Greek Yogurt", etc.) for "food_name" and leave "detected_items" as null or empty.
- Always generate 3-4 likely alternative food name suggestions for the "alternatives" array (e.g. if the food is Paneer Butter Masala, similar options might be Butter Chicken, Shahi Paneer, Kadai Paneer, or Tofu Curry) so the user can easily select one if AI identification is uncertain.
- If they eat this food often this week, call it out specifically
- If diabetic, flag high sugar content in roast
- Respect diet type strictly
- nutrition_score should be a value from 1 to 10 (representing nutrition density/quality)
- health_impact should be a signed integer (e.g. +6 or -4) indicating estimated impact on their daily goals
- food_quality must be exactly one of: "Excellent", "Good", "Processed", "Poor"
- First determine: is this item a drink/beverage? Set "is_drink" to true or false. If it is a drink, set "drink_type" to the most probable category (e.g. "Protein Shake", "Cold Coffee", "Chocolate Shake", "Iced Latte", "Mocha", "Milk Tea", "Tea", "Smoothie", "Juice", "Milkshake", "Soda", "Other") and "drink_confidence" to a percentage score between 0 and 100 representing your visual identification certainty. If it is not a drink, set "drink_type" and "drink_confidence" to null.
- Set "is_food" to true if this photo contains any type of food, meal, beverage, edible item, or ingredients. Set "is_food" to false if the image displays a computer screen, code terminal, keyboard, person, dog, document, general clutter, or any other non-food objects.
- If not food return: {"error": "not_food"}`
          }
        ]
      }]
    }
  });

  if (invokeError) {
    console.error("recognizeAndRoast: Supabase Edge Function error:", invokeError);
    throw new Error(invokeError.message || JSON.stringify(invokeError));
  }

  if (data.error) {
    if (data.error.code === 429 || data.error.status === "RESOURCE_EXHAUSTED") {
      console.warn("recognizeAndRoast: Gemini API rate limit / quota exceeded.");
      throw new Error("Gemini API quota exceeded. Please check your plan/billing details in Google AI Studio.");
    }
    console.error("recognizeAndRoast: Gemini API error:", data.error);
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  let raw = data.candidates[0].content.parts[0].text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(json)?\n/, "").replace(/\n```$/, "");
  }
  const parsed = JSON.parse(raw);
  if (parsed.error) throw new Error(parsed.error);
  return {
    foodName: parsed.food_name,
    calories: parsed.calories,
    protein: parsed.protein_g,
    carbs: parsed.carbs_g,
    fat: parsed.fat_g,
    roast: parsed.roast,
    nutritionScore: parsed.nutrition_score || 5,
    healthImpact: parsed.health_impact || 0,
    suggestions: parsed.suggestions || '',
    foodQuality: parsed.food_quality || 'Good',
    servingSize: parsed.serving_size,
    sugar: parsed.sugar_g,
    fiber: parsed.fiber_g,
    ingredients: parsed.ingredients,
    foodIdentificationConfidence: parsed.food_identification_confidence || 85,
    portionEstimationConfidence: parsed.portion_estimation_confidence || 80,
    nutritionEstimationConfidence: parsed.nutrition_estimation_confidence || 80,
    detectedItems: parsed.detected_items || null,
    alternatives: parsed.alternatives || [],
    isDrink: parsed.is_drink || false,
    drinkType: parsed.drink_type || null,
    drinkConfidence: parsed.drink_confidence !== undefined ? parsed.drink_confidence : null,
    isFood: parsed.is_food
  };
}

export async function analyzeFoodByName(
  foodName: string,
  ctx: UserContext
): Promise<{
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  roast: string;
  nutritionScore: number;
  healthImpact: number;
  suggestions: string;
  foodQuality: 'Excellent' | 'Good' | 'Processed' | 'Poor';
  servingSize?: string;
  sugar?: number;
  fiber?: number;
  ingredients?: string;
  foodIdentificationConfidence?: number;
  portionEstimationConfidence?: number;
  nutritionEstimationConfidence?: number;
  detectedItems?: string[] | null;
  alternatives?: string[];
  isDrink?: boolean;
  drinkType?: string | null;
  drinkConfidence?: number | null;
}> {
  console.log(`analyzeFoodByName: Fetching nutrition details for food name: ${foodName}...`);
  const prompt = `You are a professional nutritionist. Analyze the following food item by name: "${foodName}".
  
${contextToPromptString(ctx)}

Return ONLY raw JSON no markdown:
{
  "food_name": "corrected specific food name",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "roast": "2-3 sentence brutal funny roast. Use bro or bestie. Not mean, just real.",
  "nutrition_score": number,
  "health_impact": number,
  "suggestions": "1-2 sentence suggestions to improve user food choices.",
  "food_quality": "Excellent | Good | Processed | Poor",
  "serving_size": "standard serving size e.g. 1 cup or 100g",
  "sugar_g": number,
  "fiber_g": number,
  "ingredients": "comma separated ingredients list",
  "food_identification_confidence": number,
  "portion_estimation_confidence": number,
  "nutrition_estimation_confidence": number,
  "detected_items": ["item 1"] or null,
  "alternatives": ["similar food 1", "similar food 2", "similar food 3"],
  "is_drink": boolean,
  "drink_type": "Protein Shake" | "Cold Coffee" | "Chocolate Shake" | "Iced Latte" | "Mocha" | "Milk Tea" | "Tea" | "Smoothie" | "Juice" | "Milkshake" | "Soda" | "Other" | null,
  "drink_confidence": number or null
}

Rules:
- Respect user goals, diet types, and diabetes flags strictly.
- Estimate the portion nutrition values for a "Regular" baseline portion (so adjustments to Small or Large can be calculated dynamically).
- If multiple distinct foods are detected in the name, return generic grouped food_name and components list in detected_items.
- nutrition_score should be a value from 1 to 10 (representing nutrition density/quality)
- health_impact should be a signed integer (e.g. +6 or -4) indicating estimated impact on their daily goals.
- food_quality must be exactly one of: "Excellent", "Good", "Processed", "Poor"
- First determine: is this item a drink/beverage? Set "is_drink" to true or false. If it is a drink, set "drink_type" to the most probable category (e.g. "Protein Shake", "Cold Coffee", "Chocolate Shake", "Iced Latte", "Mocha", "Milk Tea", "Tea", "Smoothie", "Juice", "Milkshake", "Soda", "Other") and "drink_confidence" to a percentage score between 0 and 100 representing your identification certainty. If it is not a drink, set "drink_type" and "drink_confidence" to null.
- Always generate 3-4 alternative food options for the "alternatives" list.`;

  const { data, error: invokeError } = await supabase.functions.invoke('gemini-proxy', {
    body: {
      contents: [{
        parts: [{ text: prompt }]
      }]
    }
  });

  if (invokeError) {
    console.error("analyzeFoodByName: Supabase Edge Function error:", invokeError);
    throw new Error(invokeError.message || JSON.stringify(invokeError));
  }
  
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  
  let raw = data.candidates[0].content.parts[0].text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(json)?\n/, "").replace(/\n```$/, "");
  }
  const parsed = JSON.parse(raw);
  return {
    foodName: parsed.food_name || foodName,
    calories: parsed.calories,
    protein: parsed.protein_g,
    carbs: parsed.carbs_g,
    fat: parsed.fat_g,
    roast: parsed.roast,
    nutritionScore: parsed.nutrition_score || 5,
    healthImpact: parsed.health_impact || 0,
    suggestions: parsed.suggestions || '',
    foodQuality: parsed.food_quality || 'Good',
    servingSize: parsed.serving_size,
    sugar: parsed.sugar_g,
    fiber: parsed.fiber_g,
    ingredients: parsed.ingredients,
    foodIdentificationConfidence: parsed.food_identification_confidence || 95,
    portionEstimationConfidence: parsed.portion_estimation_confidence || 90,
    nutritionEstimationConfidence: parsed.nutrition_estimation_confidence || 90,
    detectedItems: parsed.detected_items || null,
    alternatives: parsed.alternatives || [],
    isDrink: parsed.is_drink || false,
    drinkType: parsed.drink_type || null,
    drinkConfidence: parsed.drink_confidence !== undefined ? parsed.drink_confidence : null
  };
}
