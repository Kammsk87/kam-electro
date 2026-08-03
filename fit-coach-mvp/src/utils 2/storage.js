const PROFILE_KEY = "fitcoach_profile";
const WORKOUTS_KEY = "fitcoach_workouts";
const CHECKINS_KEY = "fitcoach_checkins";

export function loadProfile() {
  return read(PROFILE_KEY, null);
}

export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadWorkouts() {
  return read(WORKOUTS_KEY, []);
}

export function saveWorkouts(workouts) {
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify(workouts));
}

export function loadCheckins() {
  return read(CHECKINS_KEY, []);
}

export function saveCheckins(checkins) {
  localStorage.setItem(CHECKINS_KEY, JSON.stringify(checkins));
}

export function exportAllData() {
  return {
    profile: loadProfile(),
    workouts: loadWorkouts(),
    checkins: loadCheckins(),
    exportedAt: new Date().toISOString(),
  };
}

export function importAllData(data) {
  if (data.profile) saveProfile(data.profile);
  if (Array.isArray(data.workouts)) saveWorkouts(data.workouts);
  if (Array.isArray(data.checkins)) saveCheckins(data.checkins);
}

export function clearAllData() {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(WORKOUTS_KEY);
  localStorage.removeItem(CHECKINS_KEY);
}

export function downloadJson(data, filename = "kam-fit-coach-data.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
