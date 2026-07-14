const PROFILE_KEY = "fitcoach_profile";
const WORKOUTS_KEY = "fitcoach_workouts";
const CHECKINS_KEY = "fitcoach_checkins";

export function loadProfile() {
  const profile = read(PROFILE_KEY, null);
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  if (!profile.name || !profile.level || !profile.goal || !profile.availableTime) return null;
  return {
    name: String(profile.name),
    level: ["beginner", "intermediate", "advanced"].includes(profile.level) ? profile.level : "beginner",
    goal: ["strength", "weight_loss", "health"].includes(profile.goal) ? profile.goal : "health",
    availableTime: [30, 45, 60].includes(Number(profile.availableTime)) ? Number(profile.availableTime) : 45,
    restTimerDefault: [60, 90, 120].includes(Number(profile.restTimerDefault)) ? Number(profile.restTimerDefault) : 90,
    vibrationEnabled: profile.vibrationEnabled !== false,
    cyclePhase: ["follicular", "ovulation", "luteal", "menstrual"].includes(profile.cyclePhase) ? profile.cyclePhase : null,
    createdAt: profile.createdAt || new Date().toISOString(),
  };
}

export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadWorkouts() {
  const workouts = read(WORKOUTS_KEY, []);
  return Array.isArray(workouts) ? workouts.filter((workout) => workout && typeof workout === "object") : [];
}

export function saveWorkouts(workouts) {
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify(workouts));
}

export function loadCheckins() {
  const checkins = read(CHECKINS_KEY, []);
  return Array.isArray(checkins) ? checkins.filter((checkin) => checkin && typeof checkin === "object" && checkin.date) : [];
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
