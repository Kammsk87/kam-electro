export function calculateReadiness(checkin) {
  const sleep = Number(checkin.sleep) || 5;
  const energy = Number(checkin.energy) || 5;
  const stress = Number(checkin.stress) || 5;
  const pain = Number(checkin.pain) || 1;
  return Number(((sleep + energy + (10 - stress) + (10 - pain)) / 4).toFixed(2));
}

export function readinessLabel(score) {
  if (score >= 7) {
    return {
      level: "Высокая",
      tone: "text-emerald-300",
      bg: "bg-emerald-500/15",
      text: "хорошее время для силовой тренировки",
    };
  }
  if (score >= 4) {
    return {
      level: "Средняя",
      tone: "text-amber-300",
      bg: "bg-amber-500/15",
      text: "лучше тренироваться спокойно и оставить запас",
    };
  }
  return {
    level: "Низкая",
    tone: "text-red-300",
    bg: "bg-red-500/15",
    text: "сегодня лучше восстановление или лёгкое кардио",
  };
}
