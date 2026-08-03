const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173";

const resetResponse = await fetch(`${BASE_URL}/api/reset`, { method: "POST" });
if (!resetResponse.ok) throw new Error(`Reset failed: ${resetResponse.status}`);
const state = await resetResponse.json();

const client = state.clients[0];
const game = state.games[0];
const booking = {
  id: "B-SMOKE-0001",
  clientId: client.id,
  gameId: game.id,
  status: "Записан",
  attended: null,
  createdAt: new Date().toISOString(),
};

state.bookings.push(booking);
client.status = "Записан";
client.nextGameId = game.id;
state.tasks.push(
  {
    id: "T-SMOKE-0001",
    clientId: client.id,
    channel: "Telegram",
    type: "Напоминание 24ч",
    when: new Date(Date.now() - 1000).toISOString(),
    status: "К отправке",
    template: "Напомнить о записи и месте",
    gameId: game.id,
    lastAttemptAt: "",
    comment: "",
  },
  {
    id: "T-SMOKE-0002",
    clientId: client.id,
    channel: "Telegram",
    type: "Напоминание 3ч",
    when: new Date(Date.now() - 1000).toISOString(),
    status: "К отправке",
    template: "Короткое подтверждение прихода",
    gameId: game.id,
    lastAttemptAt: "",
    comment: "",
  },
);

const saveResponse = await fetch(`${BASE_URL}/api/state`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(state),
});
if (!saveResponse.ok) throw new Error(`Save failed: ${saveResponse.status}`);

const botResponse = await fetch(`${BASE_URL}/api/bot/run-once`, { method: "POST" });
if (!botResponse.ok) throw new Error(`Bot run failed: ${botResponse.status}`);
const botResult = await botResponse.json();

const finalResponse = await fetch(`${BASE_URL}/api/state`);
if (!finalResponse.ok) throw new Error(`Final load failed: ${finalResponse.status}`);
const finalState = await finalResponse.json();

console.log(JSON.stringify({
  clients: finalState.clients.length,
  games: finalState.games.length,
  bookings: finalState.bookings.length,
  tasks: finalState.tasks.length,
  firstClientStatus: finalState.clients[0].status,
  botResult,
  taskStatuses: finalState.tasks.map((task) => task.status),
}, null, 2));
