import * as AppleHealthKitModule from 'react-native-health';
import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

const AppleHealthKit = (AppleHealthKitModule as any).default || AppleHealthKitModule;

export const isHealthKitAvailable = Platform.OS === 'ios';

const getNativeHealthKit = () => {
  if (!isHealthKitAvailable) return null;
  const nativeModule = NativeModules.AppleHealthKit;
  if (!nativeModule) return null;
  
  // Workaround for React Native New Architecture lazy loading issue.
  // We use a Proxy to delegate calls to NativeModules.AppleHealthKit if AppleHealthKit wrapper methods are undefined.
  return new Proxy(AppleHealthKit, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function') {
        return val.bind(target);
      }
      const nativeVal = nativeModule[prop];
      if (typeof nativeVal === 'function') {
        return nativeVal.bind(nativeModule);
      }
      return val;
    }
  });
};

// Custom date formatter because the iOS native parser 'parseISO8601DateFromString:'
// strictly expects timezone offsets like '+0000' or '-0800' instead of 'Z'.
const formatISO = (date: Date): string => {
  return date.toISOString().replace('Z', '+0000');
};

const PERMISSIONS = isHealthKitAvailable ? {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.Steps,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      AppleHealthKit.Constants.Permissions.Workout,
    ],
    write: [
      AppleHealthKit.Constants.Permissions.Water,
      AppleHealthKit.Constants.Permissions.Workout,
    ]
  }
} : { permissions: { read: [], write: [] } };

export const initHealthKit = (): Promise<boolean> => new Promise((resolve, reject) => {
  if (!isHealthKitAvailable) return resolve(false);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) {
    console.warn("initHealthKit: NativeModules.AppleHealthKit is undefined");
    return resolve(false);
  }
  console.log("initHealthKit: Initializing HealthKit with permissions:", PERMISSIONS);
  try {
    nativeHK.initHealthKit(PERMISSIONS, (err: any) => {
      if (err) {
        console.warn("initHealthKit error:", err);
        resolve(false);
      }
      else {
        console.log("initHealthKit: Successfully initialized HealthKit");
        resolve(true);
      }
    });
  } catch (e) {
    console.warn("initHealthKit exception:", e);
    resolve(false);
  }
});

export const getTodaySteps = (): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const formattedDate = formatISO(start);
  console.log(`getTodaySteps: Querying steps for date: ${formattedDate}`);
  
  // Debug check to verify historical retrieval for yesterday (June 2nd)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const formattedYesterday = formatISO(yesterday);
  try {
    nativeHK.getStepCount(
      { date: formattedYesterday },
      (err: any, res: any) => {
        console.log(`[DEBUG VERIFICATION] Yesterday's Steps (June 2nd):`, err ? `Error: ${err.message}` : res);
      }
    );
  } catch (e) {}

  try {
    nativeHK.getStepCount(
      { date: formattedDate },
      (err: any, result: any) => {
        if (err) {
          console.warn("getTodaySteps error:", err);
          resolve(0);
        } else {
          console.log(`getTodaySteps result:`, result);
          resolve(result?.value || 0);
        }
      }
    );
  } catch (e) {
    console.warn("getTodaySteps catch:", e);
    resolve(0);
  }
});

export const getLastNightSleep = (): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(18, 0, 0, 0);
  const formattedStart = formatISO(yesterday);
  const formattedEnd = formatISO(new Date());
  console.log(`getLastNightSleep: Querying sleep from ${formattedStart} to ${formattedEnd}`);
  try {
    nativeHK.getSleepSamples(
      { startDate: formattedStart, endDate: formattedEnd },
      (err: any, results: any[]) => {
        if (err) {
          console.warn("getLastNightSleep error:", err);
          return resolve(0);
        }
        console.log(`getLastNightSleep result count: ${results?.length || 0}`);
        if (!results?.length) return resolve(0);
        const asleepMinutes = results
          .filter((s: any) => ['ASLEEP', 'CORE', 'DEEP', 'REM'].includes(s.value))
          .reduce((acc: number, s: any) => {
            return acc + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
          }, 0);
        const sleepHours = Math.round((asleepMinutes / 60) * 10) / 10;
        console.log(`getLastNightSleep computed sleep hours: ${sleepHours}`);
        resolve(sleepHours);
      }
    );
  } catch (e) {
    console.warn("getLastNightSleep catch:", e);
    resolve(0);
  }
});

export const getTodayActiveMinutes = (): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const formattedStart = formatISO(start);
  const formattedEnd = formatISO(new Date());
  console.log(`getTodayActiveMinutes: Querying active energy from ${formattedStart} to ${formattedEnd}`);
  try {
    nativeHK.getActiveEnergyBurned(
      { startDate: formattedStart, endDate: formattedEnd },
      (err: any, results: any[]) => {
        if (err) {
          console.warn("getTodayActiveMinutes error:", err);
          return resolve(0);
        }
        console.log(`getTodayActiveMinutes result count: ${results?.length || 0}`);
        if (!results?.length) return resolve(0);
        const totalCal = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
        const computedMinutes = Math.round(totalCal / 7);
        console.log(`getTodayActiveMinutes: total calories = ${totalCal}, active minutes = ${computedMinutes}`);
        resolve(computedMinutes);
      }
    );
  } catch (e) {
    console.warn("getTodayActiveMinutes catch:", e);
    resolve(0);
  }
});

export const getTodayActiveCalories = (): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const formattedStart = formatISO(start);
  const formattedEnd = formatISO(new Date());
  try {
    nativeHK.getActiveEnergyBurned(
      { startDate: formattedStart, endDate: formattedEnd },
      (err: any, results: any[]) => {
        if (err) {
          console.warn("getTodayActiveCalories error:", err);
          return resolve(0);
        }
        if (!results?.length) return resolve(0);
        const totalCal = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
        resolve(Math.round(totalCal));
      }
    );
  } catch (e) {
    console.warn("getTodayActiveCalories catch:", e);
    resolve(0);
  }
});

export const getTodayDistance = async (steps: number): Promise<number> => {
  // Average stride length 0.762m, so distance = steps * 0.000762 km
  return Math.round(steps * 0.000762 * 10) / 10;
};

export const getRecentWorkouts = (): Promise<any[]> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve([]);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve([]);
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const formattedStart = formatISO(start);
  console.log(`getRecentWorkouts: Querying workouts since ${formattedStart}`);
  try {
    nativeHK.getSamples(
      { startDate: formattedStart, type: 'Workout' },
      (err: any, results: any[]) => {
        if (err) {
          console.warn("getRecentWorkouts error:", err);
          resolve([]);
        } else {
          console.log(`getRecentWorkouts count: ${results?.length || 0}`);
          resolve(results || []);
        }
      }
    );
  } catch (e) {
    console.warn("getRecentWorkouts catch:", e);
    resolve([]);
  }
});

export const getTodayWorkoutMinutes = (): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const formattedStart = formatISO(start);
  try {
    nativeHK.getSamples(
      { startDate: formattedStart, type: 'Workout' },
      (err: any, results: any[]) => {
        if (err) {
          console.warn("getTodayWorkoutMinutes error:", err);
          resolve(0);
        } else {
          console.log(`getTodayWorkoutMinutes count: ${results?.length || 0}`);
          if (!results || results.length === 0) return resolve(0);
          const totalMinutes = results.reduce((sum, w) => {
            const durationMs = new Date(w.endDate).getTime() - new Date(w.startDate).getTime();
            return sum + (durationMs / 60000);
          }, 0);
          resolve(Math.round(totalMinutes));
        }
      }
    );
  } catch (e) {
    console.warn("getTodayWorkoutMinutes catch:", e);
    resolve(0);
  }
});

export const getSleepDetails = (): Promise<{
  lastNightHours: number;
  lastNightStart: Date | null;
  nightBeforeHours: number;
  nightBeforeStart: Date | null;
  tracked: boolean;
}> => new Promise((resolve) => {
  if (!isHealthKitAvailable) {
    return resolve({
      lastNightHours: 0,
      lastNightStart: null,
      nightBeforeHours: 0,
      nightBeforeStart: null,
      tracked: false
    });
  }
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) {
    return resolve({
      lastNightHours: 0,
      lastNightStart: null,
      nightBeforeHours: 0,
      nightBeforeStart: null,
      tracked: false
    });
  }

  // Query sleep from 60 hours ago to now
  const start = new Date();
  start.setTime(start.getTime() - 60 * 60 * 1000 * 2.5); // 60 hours ago
  const formattedStart = formatISO(start);
  const formattedEnd = formatISO(new Date());

  try {
    nativeHK.getSleepSamples(
      { startDate: formattedStart, endDate: formattedEnd },
      (err: any, results: any[]) => {
        if (err) {
          console.warn("getSleepDetails error:", err);
          return resolve({
            lastNightHours: 0,
            lastNightStart: null,
            nightBeforeHours: 0,
            nightBeforeStart: null,
            tracked: false
          });
        }
        if (!results || results.length === 0) {
          return resolve({
            lastNightHours: 0,
            lastNightStart: null,
            nightBeforeHours: 0,
            nightBeforeStart: null,
            tracked: false
          });
        }

        // Group samples into:
        // Last night: sleep starting after yesterday 12:00 PM and before today 12:00 PM
        // Night before last: sleep starting after 2 days ago 12:00 PM and before yesterday 12:00 PM
        const now = new Date();
        
        const todayNoon = new Date(now);
        todayNoon.setHours(12, 0, 0, 0);
        
        const yesterdayNoon = new Date(todayNoon);
        yesterdayNoon.setDate(yesterdayNoon.getDate() - 1);
        
        const twoDaysAgoNoon = new Date(yesterdayNoon);
        twoDaysAgoNoon.setDate(twoDaysAgoNoon.getDate() - 1);

        const lastNightSamples = results.filter((s: any) => {
          const sampleStart = new Date(s.startDate);
          return sampleStart >= yesterdayNoon && sampleStart < todayNoon;
        });

        const nightBeforeSamples = results.filter((s: any) => {
          const sampleStart = new Date(s.startDate);
          return sampleStart >= twoDaysAgoNoon && sampleStart < yesterdayNoon;
        });

        const calcHoursAndStart = (samples: any[]) => {
          if (samples.length === 0) return { hours: 0, start: null };
          
          // Total hours asleep
          const asleepMinutes = samples
            .filter((s: any) => ['ASLEEP', 'CORE', 'DEEP', 'REM'].includes(s.value))
            .reduce((acc: number, s: any) => {
              return acc + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
            }, 0);
          const hours = Math.round((asleepMinutes / 60) * 10) / 10;

          // Start time is the earliest sleep sample startDate in chronological order
          const sorted = [...samples].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
          const start = sorted[0] ? new Date(sorted[0].startDate) : null;
          
          return { hours, start };
        };

        const lastNight = calcHoursAndStart(lastNightSamples);
        const nightBefore = calcHoursAndStart(nightBeforeSamples);

        resolve({
          lastNightHours: lastNight.hours,
          lastNightStart: lastNight.start,
          nightBeforeHours: nightBefore.hours,
          nightBeforeStart: nightBefore.start,
          tracked: true
        });
      }
    );
  } catch (e) {
    console.warn("getSleepDetails catch:", e);
    resolve({
      lastNightHours: 0,
      lastNightStart: null,
      nightBeforeHours: 0,
      nightBeforeStart: null,
      tracked: false
    });
  }
});

export const checkHealthKitAuthorization = (): Promise<boolean> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(false);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(false);
  
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    nativeHK.getStepCount({ date: start.toISOString() }, (err: any) => {
      if (err) {
        console.log("checkHealthKitAuthorization status check failed:", err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  } catch (e) {
    resolve(false);
  }
});

export const getStepsForDate = (date: Date): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const formattedDate = formatISO(start);
  try {
    nativeHK.getStepCount(
      { date: formattedDate },
      (err: any, result: any) => {
        if (err) {
          console.warn(`getStepsForDate error for ${formattedDate}:`, err);
          resolve(0);
        } else {
          resolve(result?.value || 0);
        }
      }
    );
  } catch (e) {
    console.warn(`getStepsForDate catch for ${formattedDate}:`, e);
    resolve(0);
  }
});

export const getSleepDetailsForDate = (date: Date): Promise<{
  sleepHours: number;
  sleepStart: Date | null;
  tracked: boolean;
}> => new Promise((resolve) => {
  if (!isHealthKitAvailable) {
    return resolve({ sleepHours: 0, sleepStart: null, tracked: false });
  }
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) {
    return resolve({ sleepHours: 0, sleepStart: null, tracked: false });
  }

  const noonD = new Date(date);
  noonD.setHours(12, 0, 0, 0);

  const noonYesterday = new Date(noonD);
  noonYesterday.setDate(noonYesterday.getDate() - 1);

  const formattedStart = formatISO(noonYesterday);
  const formattedEnd = formatISO(noonD);

  try {
    nativeHK.getSleepSamples(
      { startDate: formattedStart, endDate: formattedEnd },
      (err: any, results: any[]) => {
        if (err) {
          console.warn(`getSleepDetailsForDate error for ${date.toDateString()}:`, err);
          return resolve({ sleepHours: 0, sleepStart: null, tracked: false });
        }
        if (!results || results.length === 0) {
          return resolve({ sleepHours: 0, sleepStart: null, tracked: true });
        }

        const asleepMinutes = results
          .filter((s: any) => ['ASLEEP', 'CORE', 'DEEP', 'REM'].includes(s.value))
          .reduce((acc: number, s: any) => {
            return acc + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
          }, 0);
        const hours = Math.round((asleepMinutes / 60) * 10) / 10;

        const sorted = [...results].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        const start = sorted[0] ? new Date(sorted[0].startDate) : null;

        resolve({
          sleepHours: hours,
          sleepStart: start,
          tracked: true
        });
      }
    );
  } catch (e) {
    console.warn(`getSleepDetailsForDate catch for ${date.toDateString()}:`, e);
    resolve({ sleepHours: 0, sleepStart: null, tracked: false });
  }
});

export const getActiveMinutesForDate = (date: Date): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  const formattedStart = formatISO(start);
  const formattedEnd = formatISO(end);
  
  try {
    nativeHK.getActiveEnergyBurned(
      { startDate: formattedStart, endDate: formattedEnd },
      (err: any, results: any[]) => {
        if (err || !results?.length) return resolve(0);
        const totalCal = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
        resolve(Math.round(totalCal / 7));
      }
    );
  } catch (e) {
    resolve(0);
  }
});

export const getActiveCaloriesForDate = (date: Date): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  const formattedStart = formatISO(start);
  const formattedEnd = formatISO(end);
  
  try {
    nativeHK.getActiveEnergyBurned(
      { startDate: formattedStart, endDate: formattedEnd },
      (err: any, results: any[]) => {
        if (err || !results?.length) return resolve(0);
        const totalCal = results.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
        resolve(Math.round(totalCal));
      }
    );
  } catch (e) {
    resolve(0);
  }
});

export const getWorkoutMinutesForDate = (date: Date): Promise<number> => new Promise((resolve) => {
  if (!isHealthKitAvailable) return resolve(0);
  const nativeHK = getNativeHealthKit();
  if (!nativeHK) return resolve(0);
  
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  const formattedStart = formatISO(start);
  const formattedEnd = formatISO(end);
  
  try {
    nativeHK.getSamples(
      { startDate: formattedStart, endDate: formattedEnd, type: 'Workout' },
      (err: any, results: any[]) => {
        if (err || !results?.length) return resolve(0);
        const totalMinutes = results.reduce((sum, w) => {
          const durationMs = new Date(w.endDate).getTime() - new Date(w.startDate).getTime();
          return sum + (durationMs / 60000);
        }, 0);
        resolve(Math.round(totalMinutes));
      }
    );
  } catch (e) {
    resolve(0);
  }
});

export const getHealthMetricsForDate = async (date: Date): Promise<{
  steps: number;
  sleepHours: number;
  sleepStart: Date | null;
  activeMinutes: number;
  activeCalories: number;
  workoutMinutes: number;
  stepsTracked: boolean;
  activeMinutesTracked: boolean;
  sleepTracked: boolean;
}> => {
  const [steps, sleep, activeMins, activeCals, workoutMins, hasAuth] = await Promise.all([
    getStepsForDate(date),
    getSleepDetailsForDate(date),
    getActiveMinutesForDate(date),
    getActiveCaloriesForDate(date),
    getWorkoutMinutesForDate(date),
    checkHealthKitAuthorization()
  ]);

  return {
    steps,
    sleepHours: sleep.sleepHours,
    sleepStart: sleep.sleepStart,
    activeMinutes: activeMins,
    activeCalories: activeCals,
    workoutMinutes: workoutMins,
    stepsTracked: hasAuth,
    activeMinutesTracked: hasAuth,
    sleepTracked: sleep.tracked && hasAuth
  };
};
