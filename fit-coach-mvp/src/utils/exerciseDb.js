export const MUSCLE_ROTATION = ["chest_triceps", "back_biceps", "legs", "shoulders_core"];

export const GROUP_LABELS = {
  chest_triceps: "Грудь + Трицепс",
  back_biceps: "Спина + Бицепс",
  legs: "Ноги",
  shoulders_core: "Плечи + Кор",
};

export const EXERCISE_DB = {
  chest_triceps: [
    { name: "Жим штанги лёжа", defaultSets: 4, defaultReps: 8, type: "strength" },
    { name: "Жим гантелей на наклонной", defaultSets: 3, defaultReps: 10, type: "strength" },
    { name: "Разводка гантелей", defaultSets: 3, defaultReps: 12, type: "strength" },
    { name: "Трицепс на блоке", defaultSets: 3, defaultReps: 12, type: "strength" },
    { name: "Отжимания узким хватом", defaultSets: 3, defaultReps: 15, type: "strength" },
  ],
  back_biceps: [
    { name: "Тяга верхнего блока", defaultSets: 4, defaultReps: 10, type: "strength" },
    { name: "Горизонтальная тяга", defaultSets: 3, defaultReps: 10, type: "strength" },
    { name: "Тяга гантели в наклоне", defaultSets: 3, defaultReps: 10, type: "strength" },
    { name: "Сгибания рук с гантелями", defaultSets: 3, defaultReps: 12, type: "strength" },
    { name: "Молотковые сгибания", defaultSets: 3, defaultReps: 12, type: "strength" },
  ],
  legs: [
    { name: "Жим ногами", defaultSets: 4, defaultReps: 10, type: "strength" },
    { name: "Румынская тяга", defaultSets: 3, defaultReps: 10, type: "strength" },
    { name: "Выпады назад", defaultSets: 3, defaultReps: 10, type: "strength" },
    { name: "Сгибание ног в тренажёре", defaultSets: 3, defaultReps: 12, type: "strength" },
    { name: "Подъёмы на носки", defaultSets: 3, defaultReps: 15, type: "strength" },
  ],
  shoulders_core: [
    { name: "Жим гантелей сидя", defaultSets: 4, defaultReps: 8, type: "strength" },
    { name: "Разведения гантелей в стороны", defaultSets: 3, defaultReps: 12, type: "strength" },
    { name: "Тяга каната к лицу", defaultSets: 3, defaultReps: 12, type: "strength" },
    { name: "Планка", defaultSets: 3, defaultReps: 40, type: "time" },
    { name: "Скручивания", defaultSets: 3, defaultReps: 15, type: "strength" },
  ],
  cardio: [
    { name: "Дорожка с наклоном", minutes: 25, type: "cardio" },
    { name: "Велотренажёр", minutes: 25, type: "cardio" },
    { name: "Эллипс", minutes: 25, type: "cardio" },
    { name: "Лёгкая круговая", minutes: 30, type: "cardio" },
    { name: "Ходьба на улице", minutes: 30, type: "cardio" },
  ],
  recovery: [
    { name: "Спокойная ходьба", minutes: 15, type: "recovery" },
    { name: "Мобилизация плеч", minutes: 8, type: "recovery" },
    { name: "Растяжка бёдер", minutes: 8, type: "recovery" },
    { name: "Дыхание лёжа", minutes: 5, type: "recovery" },
    { name: "Лёгкая заминка", minutes: 10, type: "recovery" },
  ],
};
