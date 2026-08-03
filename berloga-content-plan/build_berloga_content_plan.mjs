import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/aleksandr/Documents/New project KAM/berloga-content-plan/outputs/berloga_week_2026-08-04";
const outputPath = path.join(outputDir, "berloga_content_plan_2026-08-04_2026-08-10.xlsx");

const rows = [
  {
    date: "2026-08-04",
    day: "Вторник",
    type: "Сигара",
    item: "Romeo y Julieta Short Churchills",
    image: "Сигара на круглом деревянном столе у окна. На дальнем плане город и мягкий свет. Без бокала в центре, только пепельница сбоку.",
    post: "У Short Churchills есть редкое качество: она не требует повода. Просто садишься, делаешь первый спокойный вдох, и вечер начинает идти медленнее. Хороший вариант, когда хочется сигару не “на час раздумий”, а на ровный, уверенный разговор.",
    story: "Short Churchills на вечер: без лишней церемонии, просто хороший табак и вид с высоты.",
    telegram: "Сегодня в хьюмидоре берём Short Churchills. Сигара без лишней театральности: плотная, понятная, с хорошим ходом на вечерний разговор.",
    note: "Сделать вертикальный кадр 9:16 и квадрат 4:5. Цвет теплее, но без желтизны."
  },
  {
    date: "2026-08-05",
    day: "Среда",
    type: "Бутылка",
    item: "Ron Zacapa 23",
    image: "Бутылка Zacapa 23 на столе в Берлоге. Фон с кожаными креслами и окнами, бутылка стоит уверенно, тень на столе естественная.",
    post: "Zacapa 23 обычно выбирают в тот момент, когда спорить уже не хочется. В нём всё мягко: карамель, сухофрукты, немного дерева и это спокойное ощущение, будто вечер можно больше не торопить. Хорошо идёт после плотной сигары или просто отдельно, маленькими глотками.",
    story: "Zacapa 23. Мягкий ром для вечера, который не нужно подгонять.",
    telegram: "На среду ставим Zacapa 23. Не самый строгий ром, зато очень понятный: мягкость, сладость, дерево и хорошее послевкусие.",
    note: "Использовать уже удачный стиль с бутылкой на столе. Проверить, чтобы этикетка читалась."
  },
  {
    date: "2026-08-06",
    day: "Четверг",
    type: "Сигара",
    item: "Montecristo Master",
    image: "Одна сигара Montecristo Master на темном столе. Рядом спички или каттер, без перегруза. Фон слегка размытый, видны кресла.",
    post: "Montecristo Master - сигара для тех, кто любит, когда вкус собирается постепенно. Сначала кажется спокойной, потом подтягиваются дерево, кофе, немного пряности. Её лучше не курить на бегу. Хотя в Берлоге с этим обычно и так никто не спешит.",
    story: "Montecristo Master: не спешит раскрыться, зато потом держит внимание.",
    telegram: "Сегодня можно идти в классику: Montecristo Master. Хороший размер, ровный характер, вкус раскрывается постепенно.",
    note: "Сделать акцент на фактуре покровного листа. Не добавлять дым слишком густо."
  },
  {
    date: "2026-08-07",
    day: "Пятница",
    type: "Бутылка",
    item: "Patron Silver",
    image: "Бутылка Patron Silver на барной стойке или столе. Рядом лайм и соль допустимы, но без клише “вечеринка”. Свет вечерний.",
    post: "Patron Silver в пятницу работает честно: чисто, бодро, без лишней сладости. Можно пить аккуратно, можно пустить в Margarita, если вечер уже решил быть громче обычного. Главное - не превращать текилу в соревнование. У неё тоже есть вкус.",
    story: "Patron Silver: пятница, лайм рядом, спешки нет.",
    telegram: "На пятницу - Patron Silver. Хорошая база для Margarita и нормальный вариант для тех, кто любит текилу без лишней тяжести.",
    note: "Кадр должен быть премиальным, не клубным. Без стопки в фокусе крупнее бутылки."
  },
  {
    date: "2026-08-08",
    day: "Суббота",
    type: "Сигара",
    item: "Davidoff Winston Churchill Late Hour",
    image: "Сигара Davidoff Late Hour на столе, рядом темный напиток в низком бокале на втором плане. Фокус на сигаре и банте.",
    post: "Late Hour - название довольно точное. Это не дневная сигара между делами, а вечерняя история, когда город уже за стеклом, телефон лежит экраном вниз, и разговоры становятся тише. Во вкусе больше глубины, чем громкости: дерево, специи, немного темной сладости.",
    story: "Late Hour - сигара для той части вечера, где уже не хочется суеты.",
    telegram: "Суббота просит что-то плотнее. Davidoff Late Hour - сигара для позднего вечера и спокойного темпа.",
    note: "Лучше темный фон, но оставить часть окна/вида, чтобы кадр был берлоговский."
  },
  {
    date: "2026-08-09",
    day: "Воскресенье",
    type: "Бутылка",
    item: "Hennessy XO",
    image: "Hennessy XO на столе у окна. Рядом пустой коньячный бокал или бокал с малым объемом, сигара может лежать сбоку.",
    post: "Hennessy XO не нуждается в длинном представлении. С ним обычно другая задача: налить немного, сесть удобнее и дать вечеру спокойно закончиться. Воскресенье для этого подходит лучше, чем кажется. Особенно если впереди неделя, а здесь ещё есть вид, кресло и нормальная пауза.",
    story: "Hennessy XO и воскресный вечер: короткая пауза перед новой неделей.",
    telegram: "Воскресный вариант - Hennessy XO. Не для спешки, а для спокойного финала недели.",
    note: "Кадр спокойный, без пафоса. Важно не сделать слишком темным."
  },
  {
    date: "2026-08-10",
    day: "Понедельник",
    type: "Сигара",
    item: "Zino Puritos / короткий формат",
    image: "Небольшая сигара/сигарилла на блюдце или пепельнице, рядом кофе. Утренний или дневной свет, более легкий кадр.",
    post: "Понедельник не всегда просит большую сигару. Иногда достаточно короткого формата: кофе, двадцать минут тишины и нормальный способ вернуться в рабочий ритм. Zino Puritos как раз про это - без большого ритуала, но с ощущением, что пауза всё-таки была.",
    story: "Короткая сигара, кофе и 20 минут тишины. Понедельник уже мягче.",
    telegram: "На понедельник - короткий формат. Zino Puritos с кофе: быстрый, аккуратный ритуал без большого вечернего сценария.",
    note: "Снять легче и светлее, чтобы понедельник не выглядел как поздняя ночь."
  }
];

const checklist = [
  ["Правило недели", "Чередуем: сигара / бутылка / сигара / бутылка. Сегодняшний Laphroaig 10 считаем уже закрытым."],
  ["Стиль текста", "Писать как от лица Берлоги: наблюдение, маленькая ситуация, одна конкретная деталь. Без слов 'идеальный', 'насладитесь', 'погрузитесь'."],
  ["Кадры", "На каждую позицию готовить 2 формата: 4:5 для поста и 9:16 для сторис/статуса."],
  ["Сторис", "Подпись до 120 символов, без длинных предложений. Лучше одна мысль, чем рекламный абзац."],
  ["Telegram", "Можно чуть подробнее, чем Instagram, но без сухого описания вкуса из каталога."],
  ["Ограничение", "Для алкоголя и сигар не использовать посыл 'пейте больше/курите больше'. Держать тон взрослый и спокойный, 18+."]
];

const workbook = Workbook.create();
const plan = workbook.worksheets.add("Контент-план");
plan.showGridLines = false;

const title = plan.getRange("A1:J1");
title.merge();
title.values = [["Контент-план Берлоги: 04.08.2026 - 10.08.2026"]];
title.format.fill.color = "#173B2F";
title.format.font.color = "#FFFFFF";
title.format.font.bold = true;
title.format.font.size = 16;
title.format.horizontalAlignment = "center";
title.format.verticalAlignment = "center";
title.format.rowHeightPx = 34;

const intro = plan.getRange("A2:J2");
intro.merge();
intro.values = [["Сегодня уже опубликован Laphroaig 10. Дальше идем через день: сигара, бутылка, сигара, бутылка."]];
intro.format.fill.color = "#EFE7D4";
intro.format.font.color = "#2C2C2C";
intro.format.font.italic = true;
intro.format.wrapText = true;
intro.format.rowHeightPx = 30;

const headers = [["Дата", "День", "Тип", "Позиция", "Картинка / кадр", "Текст поста", "Сторис / WhatsApp до 120", "Telegram", "Что подготовить", "Статус"]];
plan.getRange("A4:J4").values = headers;
const headerRange = plan.getRange("A4:J4");
headerRange.format.fill.color = "#2D4A3F";
headerRange.format.font.color = "#FFFFFF";
headerRange.format.font.bold = true;
headerRange.format.horizontalAlignment = "center";
headerRange.format.verticalAlignment = "center";
headerRange.format.wrapText = true;

const body = rows.map((r) => [
  r.date.split("-").reverse().join("."),
  r.day,
  r.type,
  r.item,
  r.image,
  r.post,
  r.story,
  r.telegram,
  r.note,
  "Нужно фото"
]);
plan.getRange(`A5:J${4 + body.length}`).values = body;
plan.getRange(`A5:A${4 + body.length}`).format.numberFormat = [["@"], ["@"], ["@"], ["@"], ["@"], ["@"], ["@"]];
plan.getRange(`A5:J${4 + body.length}`).format.wrapText = true;
plan.getRange(`A5:J${4 + body.length}`).format.verticalAlignment = "top";
plan.getRange(`A5:J${4 + body.length}`).format.borders = { preset: "insideHorizontal", style: "thin", color: "#D8D1C3" };
plan.getRange(`A5:J${4 + body.length}`).format.font.size = 10;
plan.getRange(`C5:C${4 + body.length}`).format.horizontalAlignment = "center";
plan.getRange(`J5:J${4 + body.length}`).format.horizontalAlignment = "center";

for (let i = 0; i < rows.length; i += 1) {
  const excelRow = 5 + i;
  const fill = rows[i].type === "Сигара" ? "#F7EFE1" : "#EAF2EF";
  plan.getRange(`A${excelRow}:J${excelRow}`).format.fill.color = fill;
  plan.getRange(`A${excelRow}:J${excelRow}`).format.rowHeightPx = 132;
}

plan.getRange("A:A").format.columnWidthPx = 92;
plan.getRange("B:B").format.columnWidthPx = 90;
plan.getRange("C:C").format.columnWidthPx = 82;
plan.getRange("D:D").format.columnWidthPx = 190;
plan.getRange("E:E").format.columnWidthPx = 300;
plan.getRange("F:F").format.columnWidthPx = 430;
plan.getRange("G:G").format.columnWidthPx = 260;
plan.getRange("H:H").format.columnWidthPx = 320;
plan.getRange("I:I").format.columnWidthPx = 280;
plan.getRange("J:J").format.columnWidthPx = 105;
plan.freezePanes.freezeRows(4);

plan.getRange("J5:J11").dataValidation = { rule: { type: "list", values: ["Нужно фото", "Фото готово", "Запланировано", "Опубликовано"] } };

const memo = workbook.worksheets.add("Памятка");
memo.showGridLines = false;
memo.getRange("A1:B1").merge();
memo.getRange("A1:B1").values = [["Памятка по тону и кадрам"]];
memo.getRange("A1:B1").format.fill.color = "#173B2F";
memo.getRange("A1:B1").format.font.color = "#FFFFFF";
memo.getRange("A1:B1").format.font.bold = true;
memo.getRange("A1:B1").format.font.size = 15;
memo.getRange("A1:B1").format.horizontalAlignment = "center";

memo.getRange("A3:B8").values = checklist;
memo.getRange("A3:A8").format.fill.color = "#EFE7D4";
memo.getRange("A3:A8").format.font.bold = true;
memo.getRange("A3:B8").format.wrapText = true;
memo.getRange("A3:B8").format.verticalAlignment = "top";
memo.getRange("A3:B8").format.borders = { preset: "insideHorizontal", style: "thin", color: "#D8D1C3" };
memo.getRange("A:A").format.columnWidthPx = 180;
memo.getRange("B:B").format.columnWidthPx = 720;
for (let r = 3; r <= 8; r += 1) {
  memo.getRange(`A${r}:B${r}`).format.rowHeightPx = 58;
}

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const preview = await workbook.render({ sheetName: "Контент-план", range: "A1:J11", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "preview_content_plan.png"), new Uint8Array(await preview.arrayBuffer()));

console.log(outputPath);
