const header = document.querySelector("[data-header]");
const form = document.querySelector("#lead-form");
const note = document.querySelector("[data-form-note]");

function updateHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 20);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const subject = "Заявка на электромонтаж / сборку щита";
  const body = [
    `Имя: ${data.get("name") || "не указано"}`,
    `Телефон: ${data.get("phone") || "не указан"}`,
    `Услуга: ${data.get("service") || "не указана"}`,
    "",
    "Задача:",
    data.get("message") || "не указана",
  ].join("\n");

  note.textContent = "Открываю почтовый клиент с заполненной заявкой.";
  window.location.href = `mailto:info@kamtok.ru?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
