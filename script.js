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

function ensureMobileLeadBar() {
  if (document.querySelector(".mobile-lead-bar")) {
    return;
  }

  const bar = document.createElement("div");
  bar.className = "mobile-lead-bar";
  bar.setAttribute("aria-label", "Быстрая связь");
  bar.innerHTML = `
    <a href="tel:+79120507100" data-goal="click_mobile_phone">Позвонить</a>
    <a href="https://wa.me/79120507100" target="_blank" rel="noopener" data-goal="click_mobile_whatsapp">WhatsApp</a>
    <a href="/#contact" data-goal="click_mobile_request">Заявка</a>
  `;
  document.body.append(bar);
}

function showSubmissionSuccess() {
  reachGoal("lead_form_submit");
  form.reset();
  if (note) {
    note.classList.add("success");
    note.textContent = "Спасибо, заявка отправлена. В ближайшее время с вами свяжется специалист.";
  }
}

function getFormEndpoint() {
  const localHosts = ["localhost", "127.0.0.1", ""];
  return localHosts.includes(window.location.hostname) ? "https://kamtok.ru/" : "/";
}

function submitLeadForm(data) {
  return new Promise((resolve, reject) => {
    const frameName = `lead-submit-${Date.now()}`;
    const iframe = document.createElement("iframe");
    const shadowForm = document.createElement("form");
    let submitted = false;
    let timeoutId;

    iframe.name = frameName;
    iframe.style.display = "none";

    shadowForm.method = "POST";
    shadowForm.action = getFormEndpoint();
    shadowForm.target = frameName;
    shadowForm.style.display = "none";

    data.forEach((value, key) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      shadowForm.append(input);
    });

    function cleanup() {
      window.clearTimeout(timeoutId);
      iframe.remove();
      shadowForm.remove();
    }

    iframe.addEventListener("load", () => {
      if (!submitted) {
        return;
      }
      cleanup();
      resolve();
    });

    iframe.addEventListener("error", () => {
      cleanup();
      reject(new Error("Form submit failed"));
    });

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Form submit timeout"));
    }, 12000);

    document.body.append(iframe, shadowForm);
    submitted = true;
    shadowForm.submit();
  });
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();
ensureMobileLeadBar();

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
    data.set("page_url", window.location.href);
    data.set("page_title", document.title);

    if (note) {
      note.classList.remove("success", "error");
      note.textContent = "Отправляем заявку...";
    }
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Отправляем...";
    }

    try {
      await submitLeadForm(data);
      showSubmissionSuccess();
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
