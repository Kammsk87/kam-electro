const header = document.querySelector("[data-header]");
const form = document.querySelector("#lead-form");
const note = document.querySelector("[data-form-note]");
const submitButton = form?.querySelector("button[type='submit']");
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
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = new FormData(form);
    data.set("form-name", form.getAttribute("name"));

    if (note) {
      note.classList.remove("success", "error");
      note.textContent = "Отправляем заявку...";
    }
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Отправляем...";
    }

    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      });

      if (!response.ok) {
        throw new Error("Form submit failed");
      }

      reachGoal("lead_form_submit");
      form.reset();
      if (note) {
        note.classList.add("success");
        note.textContent = "Спасибо, заявка отправлена. В ближайшее время с вами свяжется специалист.";
      }
    } catch (error) {
      if (note) {
        note.classList.add("error");
        note.textContent = "Не получилось отправить заявку. Напишите нам в WhatsApp, Telegram, MAX или на почту.";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Отправить заявку";
      }
    }
  });
}
