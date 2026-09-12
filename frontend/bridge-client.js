(function () {
  "use strict";

  const pending = new Map();
  let bridgeFrame;
  let ready = false;
  let readyPromise;

  function initialize() {
    const config = window.HEXIS_CONFIG || {};
    if (!config.bridgeUrl || config.bridgeUrl.includes("COLE_AQUI")) {
      throw new Error("A URL da ponte do Apps Script ainda não foi configurada.");
    }
    bridgeFrame = document.getElementById("hexis-bridge");
    readyPromise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("A conexão com o servidor não respondeu.")), 15000);
      window.addEventListener("message", (event) => {
        if (event.source !== bridgeFrame.contentWindow || !event.data || event.data.channel !== "HEXIS_RSVP_V1") return;
        if (event.data.type === "READY") {
          ready = true;
          window.clearTimeout(timeout);
          resolve();
          return;
        }
        if (event.data.type !== "RESPONSE") return;
        const item = pending.get(event.data.id);
        if (!item) return;
        pending.delete(event.data.id);
        if (event.data.ok) item.resolve(event.data.result);
        else item.reject(new Error(event.data.error || "Falha na solicitação."));
      });
    });
    bridgeFrame.src = config.bridgeUrl;
  }

  async function call(action, payload, session) {
    if (!readyPromise) initialize();
    if (!ready) await readyPromise;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error("O servidor demorou demais para responder."));
      }, 30000);
      pending.set(id, {
        resolve: (value) => { window.clearTimeout(timeout); resolve(value); },
        reject: (error) => { window.clearTimeout(timeout); reject(error); }
      });
      bridgeFrame.contentWindow.postMessage({
        channel: "HEXIS_RSVP_V1",
        type: "REQUEST",
        id,
        request: { action, payload: payload || {}, session: session || "" }
      }, "*");
    });
  }

  window.HexisBridge = { call };
})();

