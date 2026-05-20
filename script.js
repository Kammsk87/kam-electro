const header = document.querySelector("[data-header]");
const form = document.querySelector("#lead-form");
const note = document.querySelector("[data-form-note]");
const metrikaCounterId = window.METRIKA_COUNTER_ID;

function reachGoal(goalName) {
  if (metrikaCounterId && typeof window.ym === "function") {
    window.ym(metrikaCounterId, "reachGoal", goalName);
  }
}

function updateHeader() {
  if (header) {
    header.classList.toggle("is-scrolled", window.scrollY > 20);
  }
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

document.querySelectorAll("[data-goal]").forEach((element) => {
  element.addEventListener("click", () => {
    reachGoal(element.dataset.goal);
  });
});

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    reachGoal("lead_form_submit");

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
    const message = `${subject}\n\n${body}`;

    if (note) {
      note.textContent = "Открываю WhatsApp с заполненной заявкой.";
    }
    window.location.href = `https://wa.me/79120507100?text=${encodeURIComponent(message)}`;
  });
}
