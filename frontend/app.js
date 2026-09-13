(function () {
  "use strict";

  const state = {
    guestSession: sessionStorage.getItem("guestSession") || "",
    adminSession: sessionStorage.getItem("adminSession") || "",
    adminUser: null,
    invites: [],
    guests: [],
    users: [],
    scanner: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function show(view) {
    $$(".view").forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function busy(value) {
    $("#loading").hidden = !value;
  }

  function toast(message, error) {
    const node = $("#toast");
    node.textContent = message;
    node.className = `toast show${error ? " error" : ""}`;
    window.setTimeout(() => {
      node.className = "toast";
    }, 3800);
  }

  async function rpc(action, payload, admin) {
    busy(true);
    try {
      return await window.HexisBridge.call(
        action,
        payload,
        admin ? state.adminSession : state.guestSession
      );
    } catch (error) {
      toast(error && error.message ? error.message : "Ocorreu um erro.", true);
      throw error;
    } finally {
      busy(false);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[char]));
  }

  function phoneMask(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(
        /^(\d{0,2})(\d{0,4})(\d{0,4}).*/,
        (_, a, b, c) =>
          `${a ? `(${a}` : ""}${a.length === 2 ? ") " : ""}${b}${c ? `-${c}` : ""}`
      );
    }
    return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return value || "—";
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date).replace(",", " às");
  }

  function isGestor() {
    return !!state.adminUser && state.adminUser.profile === "GESTOR_APP";
  }

  function applyProfileUi() {
    $$(".gestor-only").forEach((node) => {
      node.hidden = !isGestor();
    });

    $$(".gestor-column").forEach((node) => {
      node.hidden = !isGestor();
    });

    $("#admin-profile").textContent = state.adminUser
      ? (isGestor() ? "Gestor" : "Administrador")
      : "";
  }

  /* =========================================================
     MODAIS / TOASTED DO APP
     Nenhuma ação usa alert(), confirm() ou prompt().
     ========================================================= */

  const confirmLayer = document.createElement("div");
  confirmLayer.id = "app-confirm-layer";
  confirmLayer.className = "app-toast-layer";
  confirmLayer.hidden = true;
  confirmLayer.innerHTML = `
    <section class="app-toast-card" role="dialog" aria-modal="true" aria-labelledby="app-confirm-title">
      <p class="eyebrow">CONFIRMAÇÃO</p>
      <h3 id="app-confirm-title">Confirmar ação</h3>
      <p id="app-confirm-text" class="app-toast-text"></p>
      <div class="app-toast-actions">
        <button id="app-confirm-cancel" class="secondary" type="button">Cancelar</button>
        <button id="app-confirm-ok" class="primary" type="button">Confirmar</button>
      </div>
    </section>`;
  document.body.appendChild(confirmLayer);

  let confirmResolver = null;

  function closeConfirm(result) {
    confirmLayer.hidden = true;
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(result);
    }
  }

  function askConfirmation({
    title = "Confirmar ação",
    text = "",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar"
  } = {}) {
    $("#app-confirm-title").textContent = title;
    $("#app-confirm-text").textContent = text;
    $("#app-confirm-ok").textContent = confirmLabel;
    $("#app-confirm-cancel").textContent = cancelLabel;
    confirmLayer.hidden = false;

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  $("#app-confirm-cancel").addEventListener("click", () => closeConfirm(false));
  $("#app-confirm-ok").addEventListener("click", () => closeConfirm(true));
  confirmLayer.addEventListener("click", (event) => {
    if (event.target === confirmLayer) closeConfirm(false);
  });

  const phoneLayer = document.createElement("div");
  phoneLayer.id = "phone-toast-layer";
  phoneLayer.className = "app-toast-layer";
  phoneLayer.hidden = true;
  phoneLayer.innerHTML = `
    <section class="app-toast-card" role="dialog" aria-modal="true" aria-labelledby="phone-toast-title">
      <p class="eyebrow">WHATSAPP</p>
      <h3 id="phone-toast-title">Editar WhatsApp</h3>
      <form id="phone-toast-form">
        <input id="phone-toast-id" type="hidden">
        <label for="phone-toast-input">Número com DDD</label>
        <input id="phone-toast-input" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" required>
        <div class="app-toast-actions">
          <button id="phone-toast-cancel" class="secondary" type="button">Cancelar</button>
          <button class="primary" type="submit">Salvar</button>
        </div>
      </form>
    </section>`;
  document.body.appendChild(phoneLayer);

  function closePhoneToast() {
    phoneLayer.hidden = true;
    $("#phone-toast-id").value = "";
    $("#phone-toast-input").value = "";
  }

  function openPhoneToast(guest) {
    $("#phone-toast-id").value = guest.id;
    $("#phone-toast-title").textContent = `WhatsApp de ${guest.name}`;
    $("#phone-toast-input").value = guest.phone ? formatPhone(guest.phone) : "";
    phoneLayer.hidden = false;
    window.setTimeout(() => $("#phone-toast-input").focus(), 30);
  }

  $("#phone-toast-cancel").addEventListener("click", closePhoneToast);
  phoneLayer.addEventListener("click", (event) => {
    if (event.target === phoneLayer) closePhoneToast();
  });

  $("#phone-toast-input").addEventListener("input", (event) => {
    event.target.value = phoneMask(event.target.value);
  });

  $("#phone-toast-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = $("#phone-toast-id").value;
    const phone = String($("#phone-toast-input").value || "").replace(/\D/g, "");

    if (phone.length !== 10 && phone.length !== 11) {
      toast("Informe um WhatsApp válido, com DDD.", true);
      return;
    }

    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Salvando...";

    try {
      await rpc("setPhone", { id, phone }, true);
      closePhoneToast();
      toast("WhatsApp atualizado.");
      await loadGuests();
    } finally {
      submit.disabled = false;
      submit.textContent = "Salvar";
    }
  });

  function renderConfig(config) {
    $("#event-name").textContent = config.name || "Aniversário Natii Neri";
    $("#event-message").textContent = config.message || "Você faz parte desta comemoração.";
    $("#event-date").textContent = config.date || "A definir";
    $("#event-time").textContent = config.time || "A definir";
    $("#event-place").textContent =
      [config.place, config.address].filter(Boolean).join(" — ") || "A definir";
    document.title = config.name || "Aniversário Natii";

    if (config.maintenance) {
      $("#start-rsvp").disabled = true;
      toast(config.maintenanceMessage || "Sistema em manutenção.", true);
    }
  }

  function companionNames(invite) {
    if (Array.isArray(invite.companions)) {
      return invite.companions.map((name) => String(name).trim()).filter(Boolean);
    }

    const raw = String(invite.companions || "").trim();
    if (!raw) return [];

    return raw
      .split(/\r?\n|\s*[;,]\s*|\s{2,}/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function renderInvites() {
    $("#invite-list").innerHTML = state.invites.map((invite) => {
      const names = [invite.name, ...companionNames(invite)];
      const peopleLabel = `${invite.people} pessoa${invite.people === 1 ? "" : "s"}`;

      return `
        <section class="invite" data-id="${escapeHtml(invite.id)}">
          <span class="status ${String(invite.status || "").toLowerCase()}">${escapeHtml(invite.status)}</span>
          <h3>${escapeHtml(invite.name)}</h3>

          <div class="invite-party">
            <p class="invite-people-count">${peopleLabel}:</p>
            <ul class="invite-name-list">
              ${names.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}
            </ul>
          </div>

          <div class="invite-actions">
            <button
              class="primary rsvp-confirm${invite.status === "CONFIRMADO" ? " is-disabled" : ""}"
              type="button"
              ${invite.status === "CONFIRMADO" ? "disabled aria-disabled=\"true\"" : ""}>
              Confirmar
            </button>
            <button class="secondary rsvp-decline" type="button">Não poderei ir</button>
            ${invite.status === "CONFIRMADO"
              ? '<button class="secondary show-ticket" type="button">Ver QR Code</button>'
              : ""}
          </div>
        </section>`;
    }).join("");
  }

  async function updateRsvp(id, status) {
    const invite = state.invites.find((item) => item.id === id);
    if (!invite) return;

    const confirming = status === "CONFIRMADO";
    const accepted = await askConfirmation({
      title: confirming ? "Confirmar presença" : "Registrar ausência",
      text: confirming
        ? `Confirmar a presença de ${invite.name} e das pessoas deste convite?`
        : `Registrar que ${invite.name} não poderá comparecer?`,
      confirmLabel: confirming ? "Confirmar presença" : "Registrar ausência"
    });

    if (!accepted) return;

    const result = await rpc("respondRsvp", { id, status });
    state.invites = result.invites;
    renderInvites();
    toast(confirming ? "Presença confirmada." : "Resposta registrada.");

    if (confirming) openTicket(id);
  }

  function openTicket(id) {
    const invite = state.invites.find((item) => item.id === id);

    if (!invite || !invite.qrToken) {
      toast("O ingresso ainda não está disponível.", true);
      return;
    }

    $("#ticket-name").textContent = invite.name;
    $("#ticket-party").textContent =
      `Convite para ${invite.people} pessoa${invite.people === 1 ? "" : "s"}`;

    const container = $("#qrcode");
    container.innerHTML = "";

    new QRCode(container, {
      text: `HX1:${invite.qrToken}`,
      width: 216,
      height: 216,
      correctLevel: QRCode.CorrectLevel.H
    });

    show("ticket");
  }

  function renderStats(data) {
    const entries = [
      ["Convites", data.invites],
      ["Pessoas", data.totalPeople],
      ["Confirmados", data.confirmedPeople],
      ["Recusados", data.declinedPeople],
      ["Presentes", data.checkedInPeople]
    ];

    $("#stats").innerHTML = entries
      .map(([label, value]) =>
        `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`
      )
      .join("");
  }

  async function loadDashboard() {
    const result = await rpc("dashboard", {}, true);
    state.adminUser = result.user;
    $("#admin-welcome").textContent = result.user.name;
    renderStats(result.stats);
    applyProfileUi();
    show("dashboard");
  }

  function renderGuests(filter) {
    const term = (filter || "").toLocaleLowerCase("pt-BR");
    const rows = state.guests.filter((guest) =>
      `${guest.name} ${guest.phone}`.toLocaleLowerCase("pt-BR").includes(term)
    );

    $("#guest-table").innerHTML = rows.map((guest) => `
      <tr>
        <td data-label="Nome">
          <strong>${escapeHtml(guest.name)}</strong>
          ${Array.isArray(guest.companions) && guest.companions.length
            ? `<div class="cell-note">+ ${guest.companions.map(escapeHtml).join(", ")}</div>`
            : ""}
        </td>
        <td data-label="Telefone">${escapeHtml(formatPhone(guest.phone))}</td>
        <td data-label="Resposta">${escapeHtml(guest.status)}</td>
        <td data-label="Pessoas">${guest.people}</td>
        <td data-label="Entrada">${escapeHtml(guest.checkin)}</td>
        <td data-label="Ações">
          <button class="table-action edit-phone" data-id="${escapeHtml(guest.id)}" type="button">WhatsApp</button>
          ${isGestor()
            ? `<button class="table-action edit-guest" data-id="${escapeHtml(guest.id)}" type="button">Editar</button>`
            : ""}
        </td>
      </tr>`).join("");
  }

  async function loadGuests() {
    const action = isGestor() ? "adminListGuests" : "listGuests";
    const result = await rpc(action, {}, true);
    state.guests = result.guests;
    renderGuests($("#guest-search").value || "");
    applyProfileUi();
    show("guests");
  }

  function addCompanionField(value) {
    const row = document.createElement("div");
    row.className = "companion-row";
    row.innerHTML = `
      <input class="companion-name" maxlength="120" placeholder="Nome do acompanhante" value="${escapeHtml(value || "")}">
      <button class="remove-companion" type="button" aria-label="Remover acompanhante">Remover</button>`;
    $("#companion-fields").appendChild(row);
  }

  function resetGuestEditor(guest) {
    const isEdit = !!guest;

    $("#guest-editor-title").textContent =
      isEdit ? "Editar convidado" : "Novo convidado";
    $("#guest-id").value = guest ? guest.id : "";
    $("#guest-name").value = guest ? guest.name : "";
    $("#guest-entry-label").value = guest ? (guest.entryLabel || "") : "";
    $("#guest-phone").value = guest ? phoneMask(guest.phone || "") : "";
    $("#guest-adult").value =
      guest && guest.adult === "NÃO" ? "NÃO" : "SIM";
    $("#guest-active").value =
      guest && guest.active === "NÃO" ? "NÃO" : "SIM";

    $("#companion-fields").innerHTML = "";

    const companions =
      guest && Array.isArray(guest.companions) ? guest.companions : [];

    companions.forEach(addCompanionField);

    if (!companions.length) {
      addCompanionField("");
    }

    const convertBox = $("#convert-box");
    convertBox.hidden = !isEdit;

    if (isEdit) {
      $("#convert-target").innerHTML =
        '<option value="">Selecione...</option>' +
        state.guests
          .filter((item) => item.id !== guest.id)
          .map((item) =>
            `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
          )
          .join("");
    }

    show("guest-editor");
  }

  function collectCompanions() {
    return $$(".companion-name")
      .map((input) => input.value.trim())
      .filter(Boolean);
  }

  async function saveGuestFromForm(event) {
    event.preventDefault();

    const guest = {
      id: $("#guest-id").value,
      name: $("#guest-name").value,
      entryLabel: $("#guest-entry-label").value,
      phone: $("#guest-phone").value,
      adult: $("#guest-adult").value,
      active: $("#guest-active").value,
      companions: collectCompanions()
    };

    await rpc("adminSaveGuest", { guest }, true);
    toast(guest.id ? "Convidado atualizado." : "Convidado criado.");
    await loadGuests();
  }

  async function convertCurrentGuest() {
    const sourceId = $("#guest-id").value;
    const targetId = $("#convert-target").value;

    if (!sourceId || !targetId) {
      toast("Selecione o convite de destino.", true);
      return;
    }

    const source = state.guests.find((guest) => guest.id === sourceId);
    const target = state.guests.find((guest) => guest.id === targetId);

    const accepted = await askConfirmation({
      title: "Converter em acompanhante",
      text:
        `${source ? source.name : "Este convidado"} será transformado em acompanhante de ` +
        `${target ? target.name : "outro convite"}. O convite individual será desativado.`,
      confirmLabel: "Converter"
    });

    if (!accepted) return;

    await rpc(
      "adminConvertGuestToCompanion",
      {
        sourceId,
        targetId,
        force: !!source && source.status === "CONFIRMADO"
      },
      true
    );

    toast("Convidado convertido em acompanhante.");
    await loadGuests();
  }

  async function loadUsers() {
    const result = await rpc("adminListUsers", {}, true);
    state.users = result.users;

    $("#user-table").innerHTML = state.users.map((user) => `
      <tr>
        <td data-label="Nome">${escapeHtml(user.name)}</td>
        <td data-label="Login">${escapeHtml(user.login)}</td>
        <td data-label="Perfil">${escapeHtml(user.profile === "GESTOR_APP" ? "GESTOR" : "ADM")}</td>
        <td data-label="Ativo">${escapeHtml(user.active)}</td>
        <td data-label="Último acesso">${escapeHtml(formatDateTime(user.lastAccess))}</td>
        <td data-label="Ações">
          <button class="table-action edit-user" data-id="${escapeHtml(user.id)}" type="button">Editar</button>
        </td>
      </tr>`).join("");

    show("users");
  }

  function resetUserEditor(user) {
    $("#user-editor-title").textContent =
      user ? "Editar usuário" : "Novo usuário";
    $("#user-id").value = user ? user.id : "";
    $("#user-name").value = user ? user.name : "";
    $("#user-login").value = user ? user.login : "";
    $("#user-profile").value = user ? user.profile : "ADM_APP";
    $("#user-active").value =
      user && user.active === "NÃO" ? "NÃO" : "SIM";
    $("#user-password").value = "";
    $("#user-password").required = !user;
    $("#password-hint").textContent =
      user ? "(deixe em branco para manter)" : "(mínimo 10 caracteres)";
    show("user-editor");
  }

  async function saveUserFromForm(event) {
    event.preventDefault();

    const user = {
      id: $("#user-id").value,
      name: $("#user-name").value,
      login: $("#user-login").value,
      profile: $("#user-profile").value,
      active: $("#user-active").value,
      password: $("#user-password").value
    };

    await rpc("saveUser", { user }, true);
    toast(user.id ? "Usuário atualizado." : "Usuário criado.");
    await loadUsers();
  }

  function quantityButtons(result, token) {
    if (result.complete || result.remaining <= 0) {
      return `
        <p class="notice">
          <strong>ENTRADA COMPLETA</strong><br>
          ${result.admitted} de ${result.authorized} pessoas registradas.
        </p>`;
    }

    return `
      <div class="checkin-quantity">
        <p><strong>Quantas pessoas estão entrando agora?</strong></p>
        <div class="invite-actions checkin-buttons">
          ${Array.from({ length: result.remaining }, (_, index) => index + 1)
            .map((quantity) =>
              `<button class="secondary confirm-entry"
                data-token="${escapeHtml(token)}"
                data-quantity="${quantity}"
                type="button">${quantity}</button>`
            )
            .join("")}
        </div>
      </div>`;
  }

  async function inspectToken(raw) {
    const token = raw.trim().replace(/^HX1:/i, "");
    if (!token) return;

    const result = await rpc("scanQr", { token }, true);

    const statusClass = result.complete ? "recusado" : "confirmado";
    const statusText = result.complete
      ? "ENTRADA COMPLETA"
      : (result.admitted > 0 ? "ENTRADA PARCIAL" : "VÁLIDO");

    $("#scan-result").innerHTML = `
      <section class="scan-card">
        <span class="status ${statusClass}">${statusText}</span>
        <h3>${escapeHtml(result.name)}</h3>
        <p>Convite para <strong>${result.authorized}</strong> pessoa${result.authorized === 1 ? "" : "s"}</p>
        <p>Já entraram: <strong>${result.admitted}</strong></p>
        <p>Ainda podem entrar: <strong>${result.remaining}</strong></p>
        ${result.checkinAt
          ? `<p class="muted">Último registro: ${escapeHtml(formatDateTime(result.checkinAt))}</p>`
          : ""}
        ${quantityButtons(result, token)}
      </section>`;
  }

  async function startScanner() {
    show("scan");

    if (!window.Html5Qrcode) {
      toast("Use o código manual; o leitor não carregou.", true);
      return;
    }

    if (state.scanner) return;

    state.scanner = new Html5Qrcode("reader");

    try {
      await state.scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (text) => {
          await state.scanner.stop();
          state.scanner = null;
          await inspectToken(text);
        },
        () => {}
      );
    } catch (_) {
      state.scanner = null;
      toast("Não foi possível abrir a câmera. Use o código manual.", true);
    }
  }

  $("#start-rsvp").addEventListener("click", () => show("phone"));
  $("#home-button").addEventListener("click", () => show("home"));

  $("#admin-button").addEventListener("click", () =>
    state.adminSession ? loadDashboard() : show("admin-login")
  );

  $$('[data-back]').forEach((button) => {
    button.addEventListener("click", async () => {
      const target = button.dataset.back;

      if (target === "dashboard" && state.adminSession) {
        await loadDashboard();
        return;
      }

      if (target === "guests" && state.adminSession) {
        await loadGuests();
        return;
      }

      if (target === "users" && state.adminSession && isGestor()) {
        await loadUsers();
        return;
      }

      show(target);
    });
  });

  $("#phone").addEventListener("input", (event) => {
    event.target.value = phoneMask(event.target.value);
  });

  $("#guest-phone").addEventListener("input", (event) => {
    event.target.value = phoneMask(event.target.value);
  });

  $("#phone-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const result = await rpc("identify", {
      phone: $("#phone").value,
      clientId: localStorage.getItem("hexisClient") || ""
    });

    state.guestSession = result.session;
    state.invites = result.invites;
    sessionStorage.setItem("guestSession", state.guestSession);

    renderInvites();
    show("invites");
  });

  $("#invite-list").addEventListener("click", async (event) => {
    const card = event.target.closest(".invite");
    if (!card) return;

    if (event.target.closest(".rsvp-confirm")) {
      await updateRsvp(card.dataset.id, "CONFIRMADO");
      return;
    }

    if (event.target.closest(".rsvp-decline")) {
      await updateRsvp(card.dataset.id, "RECUSADO");
      return;
    }

    if (event.target.closest(".show-ticket")) {
      openTicket(card.dataset.id);
    }
  });

  $("#admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const result = await rpc(
      "adminLogin",
      {
        login: $("#admin-login").value,
        password: $("#admin-password").value,
        clientId: localStorage.getItem("hexisClient") || ""
      },
      true
    );

    state.adminSession = result.session;
    state.adminUser = result.user;
    sessionStorage.setItem("adminSession", state.adminSession);
    await loadDashboard();
  });

  $("#logout-button").addEventListener("click", () => {
    state.adminSession = "";
    state.adminUser = null;
    sessionStorage.removeItem("adminSession");
    show("home");
  });

  $("#guests-button").addEventListener("click", loadGuests);

  $("#new-guest-button").addEventListener("click", async () => {
    if (!state.guests.length) await loadGuests();
    resetGuestEditor(null);
  });

  $("#new-guest-list-button").addEventListener("click", () =>
    resetGuestEditor(null)
  );

  $("#users-button").addEventListener("click", loadUsers);
  $("#scan-button").addEventListener("click", startScanner);

  $("#guest-search").addEventListener("input", (event) =>
    renderGuests(event.target.value)
  );

  $("#guest-table").addEventListener("click", (event) => {
    const phoneButton = event.target.closest(".edit-phone");

    if (phoneButton) {
      const guest = state.guests.find(
        (item) => item.id === phoneButton.dataset.id
      );

      if (guest) openPhoneToast(guest);
      return;
    }

    const editButton = event.target.closest(".edit-guest");
    if (!editButton) return;

    const guest = state.guests.find(
      (item) => item.id === editButton.dataset.id
    );

    if (guest) resetGuestEditor(guest);
  });

  $("#add-companion-button").addEventListener("click", () =>
    addCompanionField("")
  );

  $("#companion-fields").addEventListener("click", (event) => {
    const button = event.target.closest(".remove-companion");
    if (!button) return;

    button.closest(".companion-row").remove();

    if (!$("#companion-fields").children.length) {
      addCompanionField("");
    }
  });

  $("#guest-form").addEventListener("submit", saveGuestFromForm);
  $("#convert-button").addEventListener("click", convertCurrentGuest);

  $("#new-user-button").addEventListener("click", () =>
    resetUserEditor(null)
  );

  $("#user-table").addEventListener("click", (event) => {
    const button = event.target.closest(".edit-user");
    if (!button) return;

    const user = state.users.find((item) => item.id === button.dataset.id);
    if (user) resetUserEditor(user);
  });

  $("#user-form").addEventListener("submit", saveUserFromForm);

  $("#token-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await inspectToken($("#qr-token").value);
  });

  $("#scan-result").addEventListener("click", async (event) => {
    const button = event.target.closest(".confirm-entry");
    if (!button) return;

    const quantity = Number(button.dataset.quantity || 0);

    if (!Number.isInteger(quantity) || quantity < 1) {
      toast("Quantidade inválida.", true);
      return;
    }

    const accepted = await askConfirmation({
      title: "Confirmar entrada",
      text: `Registrar a entrada de ${quantity} pessoa${quantity === 1 ? "" : "s"} agora?`,
      confirmLabel: "Registrar entrada"
    });

    if (!accepted) return;

    const result = await rpc(
      "confirmCheckin",
      {
        token: button.dataset.token,
        quantity
      },
      true
    );

    toast(
      `${quantity} pessoa${quantity === 1 ? "" : "s"} ` +
      `registrada${quantity === 1 ? "" : "s"}.`
    );

    await inspectToken(button.dataset.token);
    renderStats(result.stats);
  });

  if (!localStorage.getItem("hexisClient")) {
    localStorage.setItem(
      "hexisClient",
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  rpc("bootstrap", {}).then(renderConfig).catch(() => {});
})();