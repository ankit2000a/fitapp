export interface ComponentScoreBreakdown {
  score: number;
  max: number;
  reason: string;
}

export interface HealthScoreResult {
  totalScore: number;
  nutritionScore: number;
  activityScore: number;
  sleepScore: number;
  recoveryScore: number;
  breakdown: {
    calories: ComponentScoreBreakdown;
    protein: ComponentScoreBreakdown;
    mealDistribution: ComponentScoreBreakdown;
    steps: ComponentScoreBreakdown;
    workout: ComponentScoreBreakdown;
    activeMinutes: ComponentScoreBreakdown;
    sleepDuration: ComponentScoreBreakdown;
    sleepConsistency: ComponentScoreBreakdown; // Legacy compatibility (will be 0)
    water: ComponentScoreBreakdown;
    rest: ComponentScoreBreakdown; // Legacy compatibility (will be 0)
  };
}

export interface ScoringInputs {
  // Nutrition inputs
  caloriesToday: number;
  calorieGoal: number;
  proteinToday: number;
  proteinGoal: number;
  mealsToday: number;
  currentHour: number;
  currentMinute?: number;

  // Activity inputs
  stepsToday: number;
  stepsTracked: boolean;
  workoutMinutesToday: number;
  activeMinutesToday: number;
  activeMinutesTracked: boolean;

  // Sleep inputs
  sleepHoursLastNight: number;
  sleepTracked: boolean;
  sleepStartLastNight?: Date | null;
  sleepStartNightBefore?: Date | null;

  // Recovery & Hydration inputs
  waterToday?: number;
  waterGoal?: number;
  stepsGoal?: number;

  isPastDay?: boolean;
  goal?: string; // Goal target check
}

export function calculateHealthScore(inputs: ScoringInputs): HealthScoreResult {
  const stepsGoal = Math.max(1, inputs.stepsGoal ?? 10000);
  const waterToday = inputs.waterToday ?? 0;
  const waterGoal = Math.max(1, inputs.waterGoal ?? 2000);
  const userGoal = inputs.goal ?? 'maintain';

  // 1. NUTRITION SCORE (Max 35 pts)
  // Protein (Max 20 pts)
  let proteinScore = 0;
  let proteinReason = "No protein logged today.";
  if (inputs.proteinGoal > 0) {
    if (inputs.proteinToday > 0) {
      const ratio = inputs.proteinToday / inputs.proteinGoal;
      proteinScore = Math.min(20, Math.round(ratio * 20));
      proteinReason = `Logged ${inputs.proteinToday}g / ${inputs.proteinGoal}g protein (${Math.round(ratio * 100)}% of target).`;
    } else if (inputs.mealsToday > 0) {
      proteinScore = 3;
      proteinReason = "Meals logged but protein is extremely low.";
    }
  }

  // Calories (Max 10 pts)
  let calorieScore = 0;
  let calorieReason = "No calories logged today.";
  if (inputs.caloriesToday > 0 && inputs.calorieGoal > 0) {
    const cals = inputs.caloriesToday;
    const target = inputs.calorieGoal;
    
    if (userGoal === 'lose_fat') {
      if (cals >= target - 500 && cals <= target) {
        calorieScore = 10;
        calorieReason = `Perfect calorie deficit: ${cals} kcal (Target: ${target} kcal).`;
      } else if (cals > target && cals <= target * 1.1) {
        calorieScore = 7;
        calorieReason = `Slightly over deficit limit: ${cals} kcal (within 10%).`;
      } else if (cals > target && cals <= target * 1.2) {
        calorieScore = 4;
        calorieReason = `Over deficit limit: ${cals} kcal (within 20%).`;
      } else if (cals < target - 500) {
        calorieScore = 5;
        calorieReason = `High calorie deficit: ${cals} kcal (under target by >500).`;
      } else {
        calorieScore = 2;
        calorieReason = `Exceeded target limit heavily: ${cals} kcal.`;
      }
    } else if (userGoal === 'build_muscle') {
      if (cals >= target && cals <= target + 500) {
        calorieScore = 10;
        calorieReason = `Perfect calorie surplus: ${cals} kcal (Target: ${target} kcal).`;
      } else if (cals < target && cals >= target * 0.9) {
        calorieScore = 7;
        calorieReason = `Slightly below surplus target: ${cals} kcal (within 10%).`;
      } else if (cals < target && cals >= target * 0.8) {
        calorieScore = 4;
        calorieReason = `Below surplus target: ${cals} kcal (within 20%).`;
      } else if (cals > target + 500) {
        calorieScore = 5;
        calorieReason = `High calorie surplus: ${cals} kcal (exceeded target by >500).`;
      } else {
        calorieScore = 2;
        calorieReason = `Calories are heavily below target: ${cals} kcal.`;
      }
    } else {
      // Maintain
      const diff = Math.abs(cals - target);
      if (diff <= 200) {
        calorieScore = 10;
        calorieReason = `Perfect maintenance level: ${cals} kcal (Target: ${target} kcal).`;
      } else if (diff <= 400) {
        calorieScore = 7;
        calorieReason = `Within acceptable range: ${cals} kcal.`;
      } else if (diff <= 600) {
        calorieScore = 4;
        calorieReason = `Outside ideal range: ${cals} kcal.`;
      } else {
        calorieScore = 2;
        calorieReason = `Heavily off target: ${cals} kcal.`;
      }
    }
  }

  // Meal Logging Consistency (Max 5 pts)
  let mealLogScore = 0;
  let mealLogReason = "No meals logged today.";
  if (inputs.mealsToday >= 4) {
    mealLogScore = 5;
    mealLogReason = `Logged ${inputs.mealsToday} meals today. Consistent spacing!`;
  } else if (inputs.mealsToday === 3) {
    mealLogScore = 4;
    mealLogReason = "Logged 3 meals today. Aim for 4 meals for steady energy.";
  } else if (inputs.mealsToday === 2) {
    mealLogScore = 2;
    mealLogReason = "Logged 2 meals today. Try to space food intake.";
  } else if (inputs.mealsToday === 1) {
    mealLogScore = 1;
    mealLogReason = "Only 1 meal logged. Try to space food intake.";
  }

  const nutritionScore = proteinScore + calorieScore + mealLogScore;


  // 2. MOVEMENT SCORE (Max 30 pts)
  // Steps progress (Max 15 pts)
  let stepsScore = 0;
  let stepsReason = "No steps tracked today.";
  if (!inputs.stepsTracked) {
    stepsScore = 0;
    stepsReason = "Steps permission not connected. Connect Apple Health.";
  } else {
    const ratio = inputs.stepsToday / stepsGoal;
    stepsScore = Math.min(15, Math.round(ratio * 15));
    stepsReason = `Walked ${inputs.stepsToday.toLocaleString()} / ${stepsGoal.toLocaleString()} steps.`;
  }

  // Workouts & Active minutes (Max 15 pts)
  let activeScore = 0;
  let activeReason = "No exercise or workouts logged.";
  if (!inputs.activeMinutesTracked) {
    activeScore = 0;
    activeReason = "Activity permissions not connected. Connect Apple Health.";
  } else {
    const workoutRatio = inputs.workoutMinutesToday / 30;
    const activeRatio = inputs.activeMinutesToday / 45;
    const bestRatio = Math.max(workoutRatio, activeRatio);
    activeScore = Math.min(15, Math.round(bestRatio * 15));
    activeReason = inputs.workoutMinutesToday > 0 
      ? `Completed ${inputs.workoutMinutesToday}m workout / ${inputs.activeMinutesToday}m active.`
      : `Logged ${inputs.activeMinutesToday} active minutes today (Target: 45m).`;
  }

  const activityScore = stepsScore + activeScore;


  // 3. SLEEP SCORE (Max 25 pts)
  // Ideal: 7.5 - 8.0 Hours -> 25 points
  // Good: 7.0 - 7.5 Hours (or 8.0 - 9.0 Hours) -> 20 points
  // Acceptable: 6.5 - 7.0 Hours (or 9.0 - 9.5 Hours) -> 15 points
  // Poor: Below 6.5 Hours (or > 9.5 Hours) -> 5 points
  let sleepDurationScore = 0;
  let sleepDurationReason = "No sleep tracked last night.";
  const sleepAvailable = inputs.sleepTracked && inputs.sleepHoursLastNight > 0;

  if (!inputs.sleepTracked) {
    sleepDurationScore = 0;
    sleepDurationReason = "Apple Health sleep not connected. Normalized.";
  } else if (!sleepAvailable) {
    sleepDurationScore = 0;
    sleepDurationReason = "No sleep records found today. Normalized.";
  } else {
    const hrs = inputs.sleepHoursLastNight;
    if (hrs >= 7.5 && hrs <= 8.0) {
      sleepDurationScore = 25;
      sleepDurationReason = `Ideal sleep range met: ${hrs} hrs logged.`;
    } else if ((hrs >= 7.0 && hrs < 7.5) || (hrs > 8.0 && hrs <= 9.0)) {
      sleepDurationScore = 20;
      sleepDurationReason = `Good sleep session: ${hrs} hrs logged.`;
    } else if ((hrs >= 6.5 && hrs < 7.0) || (hrs > 9.0 && hrs <= 9.5)) {
      sleepDurationScore = 15;
      sleepDurationReason = `Acceptable sleep session: ${hrs} hrs logged.`;
    } else {
      sleepDurationScore = 5;
      sleepDurationReason = `Poor sleep session: ${hrs} hrs logged (Ideal is 7.5 - 8h).`;
    }
  }

  const sleepScore = sleepDurationScore; // sleepConsistency is 0 in new weights


  // 4. RECOVERY SCORE (Max 10 pts)
  // Hydration only currently
  const waterRatio = waterToday / waterGoal;
  const waterPoints = Math.min(10, Math.round(waterRatio * 10));
  const waterReason = waterToday > 0 
    ? `Hydrated with ${waterToday}ml / ${waterGoal}ml water.` 
    : `No water logged today (Target: ${waterGoal}ml).`;

  const recoveryScore = waterPoints; // rest is 0 in new weights


  const isInactiveDay = 
    (inputs.caloriesToday ?? 0) === 0 && 
    (inputs.mealsToday ?? 0) === 0 && 
    (inputs.proteinToday ?? 0) === 0 &&
    (inputs.stepsToday ?? 0) < 250 && 
    (inputs.workoutMinutesToday ?? 0) === 0 && 
    (inputs.activeMinutesToday ?? 0) === 0 &&
    waterToday === 0;

  const isDayClose = 
    inputs.isPastDay === true || 
    (inputs.currentHour === 23 && (inputs.currentMinute ?? new Date().getMinutes()) >= 59);

  let totalScore = 0;
  if (isInactiveDay) {
    totalScore = 0;
  } else if (isDayClose && !sleepAvailable) {
    const maxPossibleScore = 35 + 30 + 10; // max 75
    const rawTotal = Math.round(((nutritionScore + activityScore + sleepScore + recoveryScore) / maxPossibleScore) * 100);
    totalScore = Math.min(100, Math.max(0, rawTotal));
  } else {
    totalScore = Math.min(100, Math.max(0, nutritionScore + activityScore + sleepScore + recoveryScore));
  }

  return {
    totalScore,
    nutritionScore,
    activityScore,
    sleepScore,
    recoveryScore,
    breakdown: {
      calories: {
        score: calorieScore,
        max: 10,
        reason: calorieReason
      },
      protein: {
        score: proteinScore,
        max: 20,
        reason: proteinReason
      },
      mealDistribution: {
        score: mealLogScore,
        max: 5,
        reason: mealLogReason
      },
      steps: {
        score: inputs.stepsTracked ? stepsScore : 0,
        max: inputs.stepsTracked ? 15 : 0,
        reason: stepsReason
      },
      workout: {
        score: inputs.activeMinutesTracked ? activeScore : 0,
        max: inputs.activeMinutesTracked ? 15 : 0,
        reason: activeReason
      },
      activeMinutes: {
        score: inputs.activeMinutesTracked ? activeScore : 0,
        max: inputs.activeMinutesTracked ? 15 : 0,
        reason: activeReason
      },
      sleepDuration: {
        score: sleepAvailable ? sleepDurationScore : 0,
        max: sleepAvailable ? 25 : 0,
        reason: sleepDurationReason
      },
      sleepConsistency: {
        score: 0,
        max: 0,
        reason: "Merged into sleep duration scorecard."
      },
      water: {
        score: waterPoints,
        max: 10,
        reason: waterReason
      },
      rest: {
        score: 0,
        max: 0,
        reason: "Merged into hydration parameters."
      }
    }
  };
}
