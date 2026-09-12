(function () {
  "use strict";

  function normalizeInviteCard(card) {
    if (!card || card.dataset.namesFormatted === "1") return;

    const title = card.querySelector("h3");
    const summary = card.querySelector("p.muted");
    if (!title || !summary) return;

    const titular = title.textContent.trim();
    const raw = summary.textContent || "";
    const parts = raw.split("·");
    const peopleLabel = (parts.shift() || "").trim();
    const companionsRaw = parts.join("·").trim();

    const companions = companionsRaw
      ? companionsRaw.split(/\r?\n|\s{2,}|\s*[;,]\s*/).map((name) => name.trim()).filter(Boolean)
      : [];

    const names = [titular, ...companions];

    summary.innerHTML = `
      <span class="invite-people-count">${peopleLabel}:</span>
      <ul class="invite-name-list">
        ${names.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}
      </ul>`;

    card.dataset.namesFormatted = "1";
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

  function formatAllInviteCards() {
    document.querySelectorAll("#invite-list .invite").forEach(normalizeInviteCard);
  }

  const inviteList = document.querySelector("#invite-list");
  if (inviteList) {
    new MutationObserver(formatAllInviteCards).observe(inviteList, {
      childList: true,
      subtree: true
    });
    formatAllInviteCards();
  }
})();
