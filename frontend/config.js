window.HEXIS_CONFIG = Object.freeze({
  bridgeUrl: "https://script.google.com/macros/s/AKfycbyAyJ-QkmoVFTMr0M5wSJIaBox_iYnyB0ZEdAtFDFuzFErOJx_TUWK44_vcDU4KdPbiaA/exec?bridge=1",
  environment: "production"
});

(function () {
  "use strict";

  const css = `
    .phone-toast-layer[hidden], .confirm-toast-layer[hidden] { display: none !important; }
    .phone-toast-layer, .confirm-toast-layer {
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
    .phone-toast-card, .confirm-toast-card {
      width: min(100%, 470px);
      margin-bottom: max(10px, env(safe-area-inset-bottom));
      padding: 22px;
      border-radius: 22px;
      border: 1px solid rgba(223,216,230,.34);
      background: linear-gradient(145deg, rgba(67,20,100,.98), rgba(30,6,53,.99));
      box-shadow: 0 26px 80px rgba(4,0,10,.58), inset 0 1px 0 rgba(255,255,255,.08);
      animation: toastIn .18s ease-out;
    }
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(24px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .phone-toast-card .eyebrow, .confirm-toast-card .eyebrow { margin-bottom: 8px; }
    .phone-toast-card h3, .confirm-toast-card h3 {
      margin: 0 0 10px;
      font-family: Montserrat, sans-serif;
      font-size: 1.05rem;
      color: #fff;
    }
    .confirm-toast-card p.confirm-text {
      color: #c5b9d0;
      line-height: 1.5;
      margin: 0 0 18px;
    }
    .phone-toast-card form { margin-top: 0; }
    .phone-toast-actions, .confirm-toast-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 8px;
    }
    .phone-toast-actions button, .confirm-toast-actions button { width: 100%; }
    @media (max-width: 740px) {
      .phone-toast-layer, .confirm-toast-layer { padding: 12px; }
      .phone-toast-card, .confirm-toast-card { border-radius: 20px; padding: 19px; }
    }
  `;

  const style = document.createElement("style");
  style.id = "rsvp-toast-overrides";
  style.textContent = css;
  document.head.appendChild(style);

  /* IMPORTANTE: não altera mais o título nem a assinatura da capa.
     O HTML/CSS principal é a única fonte visual de Aniversário + Nati Neri. */

  const phoneModal = document.createElement("div");
  phoneModal.id = "phone-toast-layer";
  phoneModal.className = "phone-toast-layer";
  phoneModal.hidden = true;
  phoneModal.innerHTML = `
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
  document.body.appendChild(phoneModal);

  const confirmModal = document.createElement("div");
  confirmModal.id = "confirm-toast-layer";
  confirmModal.className = "confirm-toast-layer";
  confirmModal.hidden = true;
  confirmModal.innerHTML = `
    <section class="confirm-toast-card" role="dialog" aria-modal="true" aria-labelledby="confirm-toast-title">
      <p class="eyebrow">CONFIRMAÇÃO</p>
      <h3 id="confirm-toast-title">Converter em acompanhante</h3>
      <p id="confirm-toast-text" class="confirm-text"></p>
      <div class="confirm-toast-actions">
        <button id="confirm-toast-cancel" class="secondary" type="button">Cancelar</button>
        <button id="confirm-toast-ok" class="primary" type="button">Confirmar</button>
      </div>
    </section>`;
  document.body.appendChild(confirmModal);

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
    phoneModal.hidden = true;
    document.querySelector("#phone-toast-id").value = "";
    document.querySelector("#phone-toast-input").value = "";
  };

  let bypassConvert = false;
  let pendingConvertButton = null;

  document.addEventListener("click", (event) => {
    const phoneButton = event.target.closest(".edit-phone");
    if (phoneButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const row = phoneButton.closest("tr");
      const cells = row ? row.querySelectorAll("td") : [];
      const name = cells[0] ? cells[0].querySelector("strong")?.textContent || "convidado" : "convidado";
      const currentPhone = cells[1] ? cells[1].textContent.trim() : "";

      document.querySelector("#phone-toast-id").value = phoneButton.dataset.id || "";
      document.querySelector("#phone-toast-title").textContent = `WhatsApp de ${name}`;
      document.querySelector("#phone-toast-input").value = currentPhone === "—" ? "" : currentPhone;
      phoneModal.hidden = false;
      window.setTimeout(() => document.querySelector("#phone-toast-input").focus(), 30);
      return;
    }

    const convertButton = event.target.closest("#convert-button");
    if (convertButton && !bypassConvert) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const sourceName = document.querySelector("#guest-name")?.value || "este convidado";
      const targetSelect = document.querySelector("#convert-target");
      const targetName = targetSelect && targetSelect.selectedOptions[0] ? targetSelect.selectedOptions[0].textContent : "o convite selecionado";
      if (!targetSelect || !targetSelect.value) {
        showToastMessage("Selecione o convite de destino.", true);
        return;
      }

      document.querySelector("#confirm-toast-text").textContent = `${sourceName} será transformado em acompanhante de ${targetName}. O convite individual será desativado.`;
      pendingConvertButton = convertButton;
      confirmModal.hidden = false;
    }
  }, true);

  document.querySelector("#phone-toast-input").addEventListener("input", (event) => {
    event.target.value = phoneMask(event.target.value);
  });

  document.querySelector("#phone-toast-cancel").addEventListener("click", closePhoneToast);
  phoneModal.addEventListener("click", (event) => {
    if (event.target === phoneModal) closePhoneToast();
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

  document.querySelector("#confirm-toast-cancel").addEventListener("click", () => {
    confirmModal.hidden = true;
    pendingConvertButton = null;
  });

  confirmModal.addEventListener("click", (event) => {
    if (event.target === confirmModal) {
      confirmModal.hidden = true;
      pendingConvertButton = null;
    }
  });

  document.querySelector("#confirm-toast-ok").addEventListener("click", () => {
    if (!pendingConvertButton) return;
    const button = pendingConvertButton;
    pendingConvertButton = null;
    confirmModal.hidden = true;

    const originalConfirm = window.confirm;
    bypassConvert = true;
    window.confirm = () => true;
    try {
      button.click();
    } finally {
      window.setTimeout(() => {
        bypassConvert = false;
        window.confirm = originalConfirm;
      }, 0);
    }
  });
})();
