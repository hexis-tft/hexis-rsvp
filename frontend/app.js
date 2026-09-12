(function () {
  "use strict";

  const state = { guestSession: sessionStorage.getItem("guestSession") || "", adminSession: sessionStorage.getItem("adminSession") || "", invites: [], guests: [], scanner: null };
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
    try { return await window.HexisBridge.call(action, payload, admin ? state.adminSession : state.guestSession); }
    catch (error) { toast(error.message, true); throw error; }
    finally { busy(false); }
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }
  function phoneMask(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) return digits.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => `${a ? `(${a}` : ""}${a.length === 2 ? ") " : ""}${b}${c ? `-${c}` : ""}`);
    return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
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
    $("#admin-welcome").textContent = result.user.name;
    renderStats(result.stats);
    show("dashboard");
  }

  function renderGuests(filter) {
    const term = (filter || "").toLocaleLowerCase("pt-BR");
    $("#guest-table").innerHTML = state.guests.filter((g) => `${g.name} ${g.phone}`.toLocaleLowerCase("pt-BR").includes(term)).map((g) => `
      <tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.phone || "—")}</td><td>${escapeHtml(g.status)}</td><td>${g.people}</td><td>${escapeHtml(g.checkin)}</td></tr>`).join("");
  }

  async function loadGuests() {
    const result = await rpc("listGuests", {}, true);
    state.guests = result.guests;
    renderGuests("");
    show("guests");
  }

  async function inspectToken(raw) {
    const token = raw.trim().replace(/^HX1:/i, "");
    if (!token) return;
    const result = await rpc("scanQr", { token }, true);
    $("#scan-result").innerHTML = `<section class="scan-card"><span class="status ${result.used ? "recusado" : "confirmado"}">${result.used ? "JÁ UTILIZADO" : "VÁLIDO"}</span><h3>${escapeHtml(result.name)}</h3><p>${result.people} pessoa${result.people === 1 ? "" : "s"}</p>${result.used ? `<p class="muted">Entrada: ${escapeHtml(result.checkinAt || "registrada")}</p>` : `<button class="primary confirm-entry" data-token="${escapeHtml(token)}" type="button">Confirmar entrada</button>`}</section>`;
  }

  async function startScanner() {
    show("scan");
    if (!window.Html5Qrcode) return toast("Use o código manual; o leitor não carregou.", true);
    if (state.scanner) return;
    state.scanner = new Html5Qrcode("reader");
    try {
      await state.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (text) => {
        await state.scanner.stop(); state.scanner = null; await inspectToken(text);
      }, () => {});
    } catch (_) { state.scanner = null; toast("Não foi possível abrir a câmera. Use o código manual.", true); }
  }

  $("#start-rsvp").addEventListener("click", () => show("phone"));
  $("#home-button").addEventListener("click", () => show("home"));
  $("#admin-button").addEventListener("click", () => state.adminSession ? loadDashboard() : show("admin-login"));
  $$('[data-back]').forEach((button) => button.addEventListener("click", () => show(button.dataset.back)));
  $("#phone").addEventListener("input", (event) => { event.target.value = phoneMask(event.target.value); });
  $("#phone-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await rpc("identify", { phone: $("#phone").value, clientId: localStorage.getItem("hexisClient") || "" });
    state.guestSession = result.session; state.invites = result.invites;
    sessionStorage.setItem("guestSession", state.guestSession); renderInvites(); show("invites");
  });
  $("#invite-list").addEventListener("click", (event) => {
    const card = event.target.closest(".invite"); if (!card) return;
    if (event.target.closest(".rsvp-confirm")) updateRsvp(card.dataset.id, "CONFIRMADO");
    if (event.target.closest(".rsvp-decline")) updateRsvp(card.dataset.id, "RECUSADO");
    if (event.target.closest(".show-ticket")) openTicket(card.dataset.id);
  });
  $("#admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await rpc("adminLogin", { login: $("#admin-login").value, password: $("#admin-password").value, clientId: localStorage.getItem("hexisClient") || "" }, true);
    state.adminSession = result.session; sessionStorage.setItem("adminSession", state.adminSession); await loadDashboard();
  });
  $("#logout-button").addEventListener("click", () => { state.adminSession = ""; sessionStorage.removeItem("adminSession"); show("home"); });
  $("#guests-button").addEventListener("click", loadGuests);
  $("#scan-button").addEventListener("click", startScanner);
  $("#guest-search").addEventListener("input", (event) => renderGuests(event.target.value));
  $("#token-form").addEventListener("submit", async (event) => { event.preventDefault(); await inspectToken($("#qr-token").value); });
  $("#scan-result").addEventListener("click", async (event) => {
    const button = event.target.closest(".confirm-entry"); if (!button) return;
    const result = await rpc("confirmCheckin", { token: button.dataset.token }, true);
    toast("Entrada confirmada."); await inspectToken(button.dataset.token); renderStats(result.stats);
  });

  if (!localStorage.getItem("hexisClient")) localStorage.setItem("hexisClient", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  rpc("bootstrap", {}).then(renderConfig).catch(() => {});
})();

