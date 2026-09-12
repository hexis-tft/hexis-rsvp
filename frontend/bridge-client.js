(function () {
  "use strict";

  const pending = new Map();
  let bridgeFrame, bridgeUrl, bridgeOrigin, initialized = false;
  let queue = Promise.resolve();

  function initialize() {
    const config = window.HEXIS_CONFIG || {};
    if (!config.bridgeUrl || config.bridgeUrl.includes("COLE_AQUI")) {
      throw new Error("A URL da ponte do Apps Script ainda não foi configurada.");
    }
    bridgeUrl = config.bridgeUrl;
    bridgeOrigin = new URL(bridgeUrl).origin;
    bridgeFrame = document.getElementById("hexis-bridge");
    window.addEventListener("message", (event) => {
        if (event.origin !== bridgeOrigin || !event.data || event.data.channel !== "HEXIS_RSVP_V1" || event.data.type !== "RESPONSE") return;
        const item = pending.get(event.data.id);
        if (!item) return;
        pending.delete(event.data.id);
        window.clearTimeout(item.timeout);
        if (event.data.ok) item.resolve(event.data.result); else item.reject(new Error(event.data.error || "Falha na solicitação."));
    });
    initialized = true;
  }

  async function call(action, payload, session) {
    if (!initialized) initialize();
    const execute = () => new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error("O servidor demorou demais para responder."));
      }, 30000);
      pending.set(id, { resolve, reject, timeout });
      const request = encodeURIComponent(JSON.stringify({ id, request: { action, payload: payload || {}, session: session || "" } }));
      bridgeFrame.src = `${bridgeUrl}${bridgeUrl.includes("?") ? "&" : "?"}r=${request}`;
    });
    queue = queue.catch(() => undefined).then(execute);
    return queue;
  }

  window.HexisBridge = { call };
})();
