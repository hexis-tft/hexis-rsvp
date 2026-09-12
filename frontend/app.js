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

  function busy(value) { $("#loading").hidden = !value; }

  function toast(message, error) {
    const node = $("#toast");
    node.textContent = message;
    node.className = `toast show${error ? " error" : ""}`;
    window.setTimeout(() => { node.className = "toast"; }, 3800);
  }

  async function rpc(action, payload, admin) {
    busy(true);
    try {
      return await window.HexisBridge.call(action, payload, admin ? state.adminSession : state.guestSession);
    } catch (error) {
      toast(error.message, true);
      throw error;
    } finally {
      busy(false);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function phoneMask(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) return digits.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => `${a ? `(${a}` : ""}${a.length === 2 ? ") " : ""}${b}${c ? `-${c}` : ""}`);
    return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    return value || "—";
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    }).format(date).replace(",", " às");
  }

  function isGestor() {
    return !!state.adminUser && state.adminUser.profile === "GESTOR_APP";
  }

  function applyProfileUi() {
    $$(".gestor-only").forEach((node) => { node.hidden = !isGestor(); });
    $$(".gestor-column").forEach((node) => { node.hidden = !isGestor(); });
    $("#admin-profile").textContent = state.adminUser ? (isGestor() ? "Gestor" : "Administrador") : "";
  }

  function renderConfig(config) {
    $("#event-name").textContent = config.name || "Aniversário Natii Neri";
    $("#event-message").textContent = config.message || "Você faz parte desta comemoração.";
    $("#event-date").textContent = config.date || "A definir";
    $("#event-time").textContent = config.time || "A definir";
    $("#event-place").textContent = [config.place, config.address].filter(Boolean).join(" — ") || "A definir";
    document.title = config.name || "Aniversário Natii";
    if (config.maintenance) {
      $("#start-rsvp").disabled = true;
      toast(config.maintenanceMessage || "Sistema em manutenção.", true);
    }
  }

  function renderInvites() {
    $("#invite-list").innerHTML = state.invites.map((invite) => `
      <section class="invite" data-id="${escapeHtml(invite.id)}">
        <span class="status ${invite.status.toLowerCase()}">${escapeHtml(invite.status)}</span>
        <h3>${escapeHtml(invite.name)}</h3>
        <p class="muted">${invite.people} pessoa${invite.people === 1 ? "" : "s"}${invite.companions ? ` · ${escapeHtml(invite.companions)}` : ""}</p>
        <div class="invite-actions">
          <button class="primary rsvp-confirm" type="button">Confirmar</button>
          <button class="secondary rsvp-decline" type="button">Não poderei ir</button>
          ${invite.status === "CONFIRMADO" ? '<button class="secondary show-ticket" type="button">Ver QR Code</button>' : ""}
        </div>
      </section>`).join("");
  }

  async function updateRsvp(id, status) {
    const result = await rpc("respondRsvp", { id, status });
    state.invites = result.invites;
    renderInvites();
    toast(status === "CONFIRMADO" ? "Presença confirmada." : "Resposta registrada.");
    if (status === "CONFIRMADO") openTicket(id);
  }

  function openTicket(id) {
    const invite = state.invites.find((item) => item.id === id);
    if (!invite || !invite.qrToken) return toast("O ingresso ainda não está disponível.", true);
    $("#ticket-name").textContent = invite.name;
    $("#ticket-party").textContent = `Convite para ${invite.people} pessoa${invite.people === 1 ? "" : "s"}`;
    const container = $("#qrcode");
    container.innerHTML = "";
    new QRCode(container, { text: `HX1:${invite.qrToken}`, width: 216, height: 216, correctLevel: QRCode.CorrectLevel.H });
    show("ticket");
  }

  function renderStats(data) {
    const entries = [["Convites", data.invites], ["Pendentes", data.pending], ["Confirmados", data.confirmedPeople], ["Recusados", data.declinedPeople], ["Presentes", data.checkedInPeople]];
    $("#stats").innerHTML = entries.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
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
    const rows = state.guests.filter((g) => `${g.name} ${g.phone}`.toLocaleLowerCase("pt-BR").includes(term));
    $("#guest-table").innerHTML = rows.map((g) => `
      <tr>
        <td><strong>${escapeHtml(g.name)}</strong>${Array.isArray(g.companions) && g.companions.length ? `<div class="cell-note">+ ${g.companions.map(escapeHtml).join(", ")}</div>` : ""}</td>
        <td>${escapeHtml(formatPhone(g.phone))}</td>
        <td>${escapeHtml(g.status)}</td>
        <td>${g.people}</td>
        <td>${escapeHtml(g.checkin)}</td>
        ${isGestor() ? `<td><button class="table-action edit-guest" data-id="${escapeHtml(g.id)}" type="button">Editar</button></td>` : ""}
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
    row.innerHTML = `<input class="companion-name" maxlength="120" placeholder="Nome do acompanhante" value="${escapeHtml(value || "")}"><button class="remove-companion" type="button" aria-label="Remover acompanhante">Remover</button>`;
    $("#companion-fields").appendChild(row);
  }

  function resetGuestEditor(guest) {
    const isEdit = !!guest;
    $("#guest-editor-title").textContent = isEdit ? "Editar convidado" : "Novo convidado";
    $("#guest-id").value = guest ? guest.id : "";
    $("#guest-name").value = guest ? guest.name : "";
    $("#guest-entry-label").value = guest ? (guest.entryLabel || "") : "";
    $("#guest-phone").value = guest ? phoneMask(guest.phone || "") : "";
    $("#guest-adult").value = guest && guest.adult === "NÃO" ? "NÃO" : "SIM";
    $("#guest-active").value = guest && guest.active === "NÃO" ? "NÃO" : "SIM";
    $("#companion-fields").innerHTML = "";
    const companions = guest && Array.isArray(guest.companions) ? guest.companions : [];
    companions.forEach(addCompanionField);
    if (!companions.length) addCompanionField("");

    const convertBox = $("#convert-box");
    convertBox.hidden = !isEdit;
    if (isEdit) {
      $("#convert-target").innerHTML = '<option value="">Selecione...</option>' + state.guests
        .filter((item) => item.id !== guest.id)
        .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
    }
    show("guest-editor");
  }

  function collectCompanions() {
    return $$(".companion-name").map((input) => input.value.trim()).filter(Boolean);
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
    if (!sourceId || !targetId) return toast("Selecione o convite de destino.", true);
    const source = state.guests.find((g) => g.id === sourceId);
    if (!confirm(`Converter ${source ? source.name : "este convidado"} em acompanhante? O convite individual será desativado.`)) return;
    await rpc("adminConvertGuestToCompanion", { sourceId, targetId, force: !!source && source.status === "CONFIRMADO" }, true);
    toast("Convidado convertido em acompanhante.");
    await loadGuests();
  }

  async function loadUsers() {
    const result = await rpc("adminListUsers", {}, true);
    state.users = result.users;
    $("#user-table").innerHTML = state.users.map((u) => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.login)}</td>
        <td>${escapeHtml(u.profile === "GESTOR_APP" ? "GESTOR" : "ADM")}</td>
        <td>${escapeHtml(u.active)}</td>
        <td>${escapeHtml(formatDateTime(u.lastAccess))}</td>
        <td><button class="table-action edit-user" data-id="${escapeHtml(u.id)}" type="button">Editar</button></td>
      </tr>`).join("");
    show("users");
  }

  function resetUserEditor(user) {
    $("#user-editor-title").textContent = user ? "Editar usuário" : "Novo usuário";
    $("#user-id").value = user ? user.id : "";
    $("#user-name").value = user ? user.name : "";
    $("#user-login").value = user ? user.login : "";
    $("#user-profile").value = user ? user.profile : "ADM_APP";
    $("#user-active").value = user && user.active === "NÃO" ? "NÃO" : "SIM";
    $("#user-password").value = "";
    $("#user-password").required = !user;
    $("#password-hint").textContent = user ? "(deixe em branco para manter)" : "(mínimo 10 caracteres)";
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

  async function inspectToken(raw) {
    const token = raw.trim().replace(/^HX1:/i, "");
    if (!token) return;
    const result = await rpc("scanQr", { token }, true);
    $("#scan-result").innerHTML = `<section class="scan-card"><span class="status ${result.used ? "recusado" : "confirmado"}">${result.used ? "JÁ UTILIZADO" : "VÁLIDO"}</span><h3>${escapeHtml(result.name)}</h3><p>${result.people} pessoa${result.people === 1 ? "" : "s"}</p>${result.used ? `<p class="muted">Entrada: ${escapeHtml(formatDateTime(result.checkinAt))}</p>` : `<button class="primary confirm-entry" data-token="${escapeHtml(token)}" type="button">Confirmar entrada</button>`}</section>`;
  }

  async function startScanner() {
    show("scan");
    if (!window.Html5Qrcode) return toast("Use o código manual; o leitor não carregou.", true);
    if (state.scanner) return;
    state.scanner = new Html5Qrcode("reader");
    try {
      await state.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (text) => {
        await state.scanner.stop();
        state.scanner = null;
        await inspectToken(text);
      }, () => {});
    } catch (_) {
      state.scanner = null;
      toast("Não foi possível abrir a câmera. Use o código manual.", true);
    }
  }

  $("#start-rsvp").addEventListener("click", () => show("phone"));
  $("#home-button").addEventListener("click", () => show("home"));
  $("#admin-button").addEventListener("click", () => state.adminSession ? loadDashboard() : show("admin-login"));
  $$('[data-back]').forEach((button) => button.addEventListener("click", () => show(button.dataset.back)));

  $("#phone").addEventListener("input", (event) => { event.target.value = phoneMask(event.target.value); });
  $("#guest-phone").addEventListener("input", (event) => { event.target.value = phoneMask(event.target.value); });

  $("#phone-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await rpc("identify", { phone: $("#phone").value, clientId: localStorage.getItem("hexisClient") || "" });
    state.guestSession = result.session;
    state.invites = result.invites;
    sessionStorage.setItem("guestSession", state.guestSession);
    renderInvites();
    show("invites");
  });

  $("#invite-list").addEventListener("click", (event) => {
    const card = event.target.closest(".invite");
    if (!card) return;
    if (event.target.closest(".rsvp-confirm")) updateRsvp(card.dataset.id, "CONFIRMADO");
    if (event.target.closest(".rsvp-decline")) updateRsvp(card.dataset.id, "RECUSADO");
    if (event.target.closest(".show-ticket")) openTicket(card.dataset.id);
  });

  $("#admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await rpc("adminLogin", { login: $("#admin-login").value, password: $("#admin-password").value, clientId: localStorage.getItem("hexisClient") || "" }, true);
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
  $("#new-guest-button").addEventListener("click", async () => { if (!state.guests.length) await loadGuests(); resetGuestEditor(null); });
  $("#new-guest-list-button").addEventListener("click", () => resetGuestEditor(null));
  $("#users-button").addEventListener("click", loadUsers);
  $("#scan-button").addEventListener("click", startScanner);
  $("#guest-search").addEventListener("input", (event) => renderGuests(event.target.value));

  $("#guest-table").addEventListener("click", (event) => {
    const button = event.target.closest(".edit-guest");
    if (!button) return;
    const guest = state.guests.find((g) => g.id === button.dataset.id);
    if (guest) resetGuestEditor(guest);
  });

  $("#add-companion-button").addEventListener("click", () => addCompanionField(""));
  $("#companion-fields").addEventListener("click", (event) => {
    const button = event.target.closest(".remove-companion");
    if (!button) return;
    button.closest(".companion-row").remove();
    if (!$("#companion-fields").children.length) addCompanionField("");
  });
  $("#guest-form").addEventListener("submit", saveGuestFromForm);
  $("#convert-button").addEventListener("click", convertCurrentGuest);

  $("#new-user-button").addEventListener("click", () => resetUserEditor(null));
  $("#user-table").addEventListener("click", (event) => {
    const button = event.target.closest(".edit-user");
    if (!button) return;
    const user = state.users.find((u) => u.id === button.dataset.id);
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
    const result = await rpc("confirmCheckin", { token: button.dataset.token }, true);
    toast("Entrada confirmada.");
    await inspectToken(button.dataset.token);
    renderStats(result.stats);
  });

  if (!localStorage.getItem("hexisClient")) {
    localStorage.setItem("hexisClient", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  rpc("bootstrap", {}).then(renderConfig).catch(() => {});
})();
