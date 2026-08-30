import { calculateHealthScore, ScoringInputs } from '../lib/scoring';

const now = new Date();
const currentHour = 20; // 8:00 PM (Evening)

// 1. Excellent Day
const excellentDay: ScoringInputs = {
  // Nutrition
  caloriesToday: 1950,
  calorieGoal: 2000, // ±2.5% (well within ±10%)
  proteinToday: 155,
  proteinGoal: 150,  // 103% (>= 100%)
  mealsToday: 3,
  currentHour,

  // Activity
  stepsToday: 11200, // >= 10k
  stepsTracked: true,
  workoutMinutesToday: 45, // >30m
  activeMinutesToday: 35, // >= 30m
  activeMinutesTracked: true,

  // Sleep
  sleepHoursLastNight: 7.8, // 7 to 8.5
  sleepTracked: true,
  sleepStartLastNight: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 0), // 11:00 PM
  sleepStartNightBefore: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 23, 15), // 11:15 PM (diff 15 mins)
};

// 2. Average Day
const averageDay: ScoringInputs = {
  // Nutrition
  caloriesToday: 1650,
  calorieGoal: 2000, // -17.5% (within ±20%)
  proteinToday: 120,
  proteinGoal: 150,  // 80% (>= 80%)
  mealsToday: 2,
  currentHour,

  // Activity
  stepsToday: 8200, // >= 7.5k
  stepsTracked: true,
  workoutMinutesToday: 25, // 20-30m
  activeMinutesToday: 22, // 15-30m
  activeMinutesTracked: true,

  // Sleep
  sleepHoursLastNight: 6.2, // 6 to 6.5
  sleepTracked: true,
  sleepStartLastNight: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 22, 30), // 10:30 PM
  sleepStartNightBefore: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 0, 15), // 12:15 AM (diff 1.75 hours)
};

// 3. Poor Day
const poorDay: ScoringInputs = {
  // Nutrition
  caloriesToday: 2700,
  calorieGoal: 2000, // +35% (far off)
  proteinToday: 45,
  proteinGoal: 150,  // 30% (< 40%)
  mealsToday: 1,
  currentHour,

  // Activity
  stepsToday: 1200, // Under 2.5k
  stepsTracked: true,
  workoutMinutesToday: 0, // No workout
  activeMinutesToday: 8, // Under 15m
  activeMinutesTracked: true,

  // Sleep
  sleepHoursLastNight: 5.0, // Under 5.5
  sleepTracked: true,
  sleepStartLastNight: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 2, 30), // 2:30 AM
  sleepStartNightBefore: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 23, 0), // 11:00 PM (diff 3.5 hours)
};

// 4. Missing HealthKit
const missingHealthKit: ScoringInputs = {
  // Nutrition
  caloriesToday: 1980,
  calorieGoal: 2000,
  proteinToday: 150,
  proteinGoal: 150,
  mealsToday: 3,
  currentHour,

  // Activity
  stepsToday: 0,
  stepsTracked: false, // Step tracking not connected
  workoutMinutesToday: 0,
  activeMinutesToday: 0,
  activeMinutesTracked: false, // Active mins not tracked

  // Sleep
  sleepHoursLastNight: 0,
  sleepTracked: false, // Sleep not tracked
};

// 5. Score Floor (Terrible Day)
const terribleDay: ScoringInputs = {
  // Nutrition
  caloriesToday: 0,
  calorieGoal: 2000,
  proteinToday: 0,
  proteinGoal: 150,
  mealsToday: 0,
  currentHour,

  // Activity
  stepsToday: 50,
  stepsTracked: true,
  workoutMinutesToday: 0,
  activeMinutesToday: 0,
  activeMinutesTracked: true,

  // Sleep
  sleepHoursLastNight: 2.0,
  sleepTracked: true,
  sleepStartLastNight: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 4, 0),
  sleepStartNightBefore: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 22, 0), // diff 6 hours
};

console.log("--- RUNNING HEALTH SCORING ENGINE TESTS ---\n");

function printResult(name: string, res: any) {
  console.log(`=== ${name} ===`);
  console.log(`Total Score: ${res.totalScore}/100 (Nutrition: ${res.nutritionScore}/35, Activity: ${res.activityScore}/35, Sleep: ${res.sleepScore}/30)`);
  console.log("Breakdown:");
  Object.entries(res.breakdown).forEach(([k, v]: [string, any]) => {
    console.log(`  - ${k}: ${v.score}/${v.max} pts (${v.reason})`);
  });
  console.log("\n");
}

printResult("EXCELLENT DAY", calculateHealthScore(excellentDay));
printResult("AVERAGE DAY", calculateHealthScore(averageDay));
printResult("POOR DAY", calculateHealthScore(poorDay));
printResult("MISSING HEALTHKIT DATA", calculateHealthScore(missingHealthKit));
printResult("TERRIBLE DAY (SCORE FLOOR TEST)", calculateHealthScore(terribleDay));
