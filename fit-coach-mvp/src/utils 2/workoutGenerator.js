import { EXERCISE_DB, GROUP_LABELS, MUSCLE_ROTATION } from "./exerciseDb.js";

function nextGroup(recentWorkouts) {
  const last = recentWorkouts.find((workout) => workout.muscleGroup)?.muscleGroup;
  if (!last) return "chest_triceps";
  const current = MUSCLE_ROTATION.indexOf(last);
  return MUSCLE_ROTATION[(current + 1) % MUSCLE_ROTATION.length];
}

function exerciseCount(profile) {
  if (profile.availableTime <= 30) return 3;
  if (profile.availableTime <= 45) return 4;
  return 5;
}

function levelAdjustment(profile, exercise) {
  const setsShift = profile.level === "advanced" ? 1 : profile.level === "beginner" ? -1 : 0;
  const repsShift = profile.goal === "strength" ? -2 : profile.goal === "weight_loss" ? 2 : 0;
  return {
    ...exercise,
    plannedSets: Math.max(2, (exercise.defaultSets || 3) + setsShift),
    plannedReps: Math.max(6, (exercise.defaultReps || 10) + repsShift),
    suggestedWeight: profile.level === "advanced" ? 40 : profile.level === "intermediate" ? 25 : 15,
  };
}

export function generateWorkout(profile, recentWorkouts, checkin) {
  const readiness = Number(checkin.readinessScore) || 6;
  if (profile.cyclePhase === "menstrual" && readiness < 7) {
    return recoveryWorkout(profile, "Фаза цикла: снижаем нагрузку и бережём восстановление");
  }
  if (readiness < 4) return recoveryWorkout(profile, "Готовность низкая: сегодня полезнее восстановиться");
  if (readiness < 6) return cardioWorkout(profile, "Готовность средняя: лёгкое кардио даст прогресс без перегруза");

  const muscleGroup = nextGroup(recentWorkouts);
  const exercises = EXERCISE_DB[muscleGroup].slice(0, exerciseCount(profile)).map((exercise) => levelAdjustment(profile, exercise));
  return {
    id: crypto.randomUUID?.() || String(Date.now()),
    type: "strength",
    muscleGroup,
    icon: "💪",
    name: `Силовая: ${GROUP_LABELS[muscleGroup]}`,
    duration: profile.availableTime,
    reason: recentWorkouts.length
      ? `Следующая группа по ротации: ${GROUP_LABELS[muscleGroup]}`
      : "Начинаем с базовой силовой тренировки",
    exercises,
  };
}

function cardioWorkout(profile, reason) {
  const exercises = EXERCISE_DB.cardio.slice(0, 2).map((exercise) => ({
    ...exercise,
    plannedMinutes: profile.availableTime <= 30 ? 20 : 30,
  }));
  return {
    id: crypto.randomUUID?.() || String(Date.now()),
    type: "cardio",
    icon: "⚡",
    name: "Кардио: выносливость",
    duration: profile.availableTime,
    reason,
    exercises,
  };
}

function recoveryWorkout(profile, reason) {
  const exercises = EXERCISE_DB.recovery.slice(0, 4).map((exercise) => ({
    ...exercise,
    plannedMinutes: exercise.minutes,
  }));
  return {
    id: crypto.randomUUID?.() || String(Date.now()),
    type: "recovery",
    icon: "🧘",
    name: "Восстановление: лёгкий день",
    duration: Math.min(profile.availableTime, 30),
    reason,
    exercises,
  };
}
