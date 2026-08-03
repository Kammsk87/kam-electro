export const interviewQuestions = [
  "Что здесь произошло?",
  "Почему ты решил сохранить именно этот момент?",
  "Что тебя удивило?",
  "Что ты почувствовал?",
  "Что было самым важным?",
  "Что изменилось после этого?",
  "Какой главный вывод?",
  "Что ты сказал бы себе год назад?",
  "Чему это может научить других?"
] as const;

export function getQuestionForStep(step: number, previousAnswer?: string) {
  const answerIsShort = previousAnswer ? previousAnswer.trim().split(/\s+/).length < 12 : false;

  if (answerIsShort) {
    return "Раскрой чуть глубже: какая деталь делает этот момент важным именно для тебя?";
  }

  return interviewQuestions[Math.min(step, interviewQuestions.length - 1)] ?? "Что здесь произошло?";
}

export function buildReadinessSummary() {
  return [
    "✓ Контекст",
    "✓ Эмоции",
    "✓ Главный вывод",
    "✓ Ключевые события",
    "✓ Ценность для читателя"
  ].join("\n");
}

export function isFinalStep(step: number) {
  return step >= interviewQuestions.length;
}
