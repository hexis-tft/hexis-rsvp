window.HEXIS_CONFIG = Object.freeze({
  bridgeUrl: "https://script.google.com/macros/s/AKfycbyAyJ-QkmoVFTMr0M5wSJIaBox_iYnyB0ZEdAtFDFuzFErOJx_TUWK44_vcDU4KdPbiaA/exec?bridge=1",
  environment: "production"
});

(function () {
  "use strict";

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Allura&display=swap');

    .brand-invite-mark {
      padding: 2px 0 !important;
      display: inline-flex !important;
      align-items: center;
      min-width: 126px;
    }
    .brand-invite-mark img {
      display: block;
      width: 150px;
      max-height: 54px;
      object-fit: contain;
      object-position: left center;
      filter: drop-shadow(0 0 8px rgba(255,255,255,.16));
    }

    .event-title-display {
      margin: 6px auto 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
    }
    .event-title-word {
      display: block;
      font-family: 'Allura', cursive;
      font-size: clamp(4rem, 10vw, 6.7rem);
      font-weight: 400;
      line-height: .9;
      color: #f8f5fb;
      text-shadow: 0 3px 22px rgba(207,143,239,.28);
    }
    .event-signature {
      display: block;
      width: min(430px, 82vw);
      max-height: 132px;
      object-fit: contain;
      margin: -6px auto 8px;
      filter: drop-shadow(0 0 12px rgba(186,97,231,.2));
    }

    .phone-toast-layer[hidden] { display: none !important; }
    .phone-toast-layer {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      align-items: end;
      justify-items: center;
      padding: 18px;
      background: rgba(10, 1, 19, .56);
      backdrop-filter: blur(5px);
    }
    .phone-toast-card {
      width: min(100%, 470px);
      margin-bottom: max(10px, env(safe-area-inset-bottom));
      padding: 22px;
      border-radius: 22px;
      border: 1px solid rgba(223,216,230,.34);
      background: linear-gradient(145deg, rgba(67,20,100,.98), rgba(30,6,53,.99));
      box-shadow: 0 26px 80px rgba(4,0,10,.58), inset 0 1px 0 rgba(255,255,255,.08);
      animation: phoneToastIn .18s ease-out;
    }
    @keyframes phoneToastIn {
      from { opacity: 0; transform: translateY(24px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .phone-toast-card .eyebrow { margin-bottom: 8px; }
    .phone-toast-card h3 {
      margin: 0 0 18px;
      font-family: Montserrat, sans-serif;
      font-size: 1.05rem;
      color: #fff;
    }
    .phone-toast-card form { margin-top: 0; }
    .phone-toast-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 8px;
    }
    .phone-toast-actions button { width: 100%; }

    @media (max-width: 740px) {
      .brand-invite-mark { min-width: 105px; }
      .brand-invite-mark img { width: 122px; max-height: 46px; }
      .event-title-word { font-size: clamp(3.7rem, 18vw, 5.4rem); }
      .event-signature { width: min(360px, 88vw); max-height: 112px; }
      .phone-toast-layer { padding: 12px; }
      .phone-toast-card { border-radius: 20px; padding: 19px; }
    }
  `;

  const style = document.createElement("style");
  style.id = "invite-visual-overrides";
  style.textContent = css;
  document.head.appendChild(style);

  const brand = document.querySelector("#home-button");
  if (brand) {
    brand.classList.add("brand-invite-mark");
    brand.innerHTML = '<img src="assets/18-anos.png" alt="18 Anos">';
  }

  const originalEventName = document.querySelector("#event-name");
  if (originalEventName) {
    originalEventName.id = "event-title-display";
    originalEventName.classList.add("event-title-display");
    originalEventName.innerHTML = '<span class="event-title-word">Aniversário</span><img class="event-signature" src="assets/nati-neri.png" alt="Nati Neri">';

    const hiddenName = document.createElement("span");
    hiddenName.id = "event-name";
    hiddenName.hidden = true;
    originalEventName.after(hiddenName);
  }

  const modal = document.createElement("div");
  modal.id = "phone-toast-layer";
  modal.className = "phone-toast-layer";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="phone-toast-card" role="dialog" aria-modal="true" aria-labelledby="phone-toast-title">
      <p class="eyebrow">WHATSAPP</p>
      <h3 id="phone-toast-title">Editar WhatsApp</h3>
      <form id="phone-toast-form">
        <input id="phone-toast-id" type="hidden">
        <label for="phone-toast-input">Número com DDD</label>
        <input id="phone-toast-input" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" required>
        <div class="phone-toast-actions">
          <button id="phone-toast-cancel" class="secondary" type="button">Cancelar</button>
          <button class="primary" type="submit">Salvar</button>
        </div>
      </form>
    </section>`;
  document.body.appendChild(modal);

  const phoneMask = (value) => {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => `${a ? `(${a}` : ""}${a.length === 2 ? ") " : ""}${b}${c ? `-${c}` : ""}`);
    }
    return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
  };

  const showToastMessage = (message, error) => {
    const node = document.querySelector("#toast");
    if (!node) return;
    node.textContent = message;
    node.className = `toast show${error ? " error" : ""}`;
    window.setTimeout(() => { node.className = "toast"; }, 3200);
  };

  const closePhoneToast = () => {
    modal.hidden = true;
    document.querySelector("#phone-toast-id").value = "";
    document.querySelector("#phone-toast-input").value = "";
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".edit-phone");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const row = button.closest("tr");
    const cells = row ? row.querySelectorAll("td") : [];
    const name = cells[0] ? cells[0].querySelector("strong")?.textContent || "convidado" : "convidado";
    const currentPhone = cells[1] ? cells[1].textContent.trim() : "";

    document.querySelector("#phone-toast-id").value = button.dataset.id || "";
    document.querySelector("#phone-toast-title").textContent = `WhatsApp de ${name}`;
    document.querySelector("#phone-toast-input").value = currentPhone === "—" ? "" : currentPhone;
    modal.hidden = false;
    window.setTimeout(() => document.querySelector("#phone-toast-input").focus(), 30);
  }, true);

  document.querySelector("#phone-toast-input").addEventListener("input", (event) => {
    event.target.value = phoneMask(event.target.value);
  });

  document.querySelector("#phone-toast-cancel").addEventListener("click", closePhoneToast);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePhoneToast();
  });

  document.querySelector("#phone-toast-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.querySelector("#phone-toast-id").value;
    const phone = String(document.querySelector("#phone-toast-input").value || "").replace(/\D/g, "");
    if (phone.length !== 10 && phone.length !== 11) {
      showToastMessage("Informe um WhatsApp válido, com DDD.", true);
      return;
    }

    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Salvando...";
    try {
      await window.HexisBridge.call("setPhone", { id, phone }, sessionStorage.getItem("adminSession") || "");
      const button = document.querySelector(`.edit-phone[data-id="${CSS.escape(id)}"]`);
      const row = button ? button.closest("tr") : null;
      const cell = row ? row.querySelectorAll("td")[1] : null;
      if (cell) cell.textContent = phoneMask(phone);
      closePhoneToast();
      showToastMessage("WhatsApp atualizado.", false);
    } catch (error) {
      showToastMessage(error && error.message ? error.message : "Não foi possível atualizar o WhatsApp.", true);
    } finally {
      submit.disabled = false;
      submit.textContent = "Salvar";
    }
  });
})();
