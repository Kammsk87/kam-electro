const { __test } = await import("./server.mjs");

const state = await __test.buildInitialState();
const testClient = {
  telegramChatId: "",
  id: `CL-${String(state.clients.length + 1).padStart(5, "0")}`,
  udsId: "",
  registeredAt: new Date().toLocaleString("ru-RU"),
  name: "Каменский Александр Михайлович",
  phone: "+79120507100",
  email: "",
  telegram: "@kam_ekb",
  instagram: "",
  source: "Telegram",
  status: "Интересовался",
  interest: "Тест CRM и Telegram-бота",
  nextGameId: "",
  lastContactAt: "",
  lastGameAt: "",
  visits: 0,
  lastPurchaseAt: "",
  udsPoints: 0,
  udsPaid: 0,
  udsStatus: "",
  referrer: "",
  birthday: "",
  tags: "",
  comment: "Тестовый клиент для проверки MVP",
};
state.clients.unshift(testClient);
await __test.saveDb(state);

await __test.handleTelegramUpdate({
  update_id: 1001,
  message: {
    message_id: 1,
    text: `/start ${testClient.id}`,
    chat: { id: 123456789, type: "private" },
    from: {
      id: 123456789,
      is_bot: false,
      first_name: "Александр",
      last_name: "Каменский",
      username: "kam_ekb",
    },
  },
});

const finalState = await __test.readDb();
const client = finalState.clients.find((item) => item.id === testClient.id);
const tasks = finalState.tasks.filter((task) => task.clientId === testClient.id);

console.log(JSON.stringify({
  id: client.id,
  name: client.name,
  telegram: client.telegram,
  telegramChatId: client.telegramChatId,
  status: client.status,
  tasks,
}, null, 2));

if (client.telegramChatId !== "123456789") {
  throw new Error("telegramChatId was not saved");
}
