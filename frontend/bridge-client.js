(function () {
  "use strict";

  const CHANNEL = "HEXIS_RSVP_V1";
  const pending = new Map();.

  let bridgeFrame = null;
  let bridgeUrl = "";
  let initialized = false;
  let ready = false;
  let readyPromise = null;
  let resolveReady = null;
  let rejectReady = null;
  let queue = Promise.resolve();

  function initialize() {
    if (initialized) return;

    const config = window.HEXIS_CONFIG || {};

    if (!config.bridgeUrl || config.bridgeUrl.includes("COLE_AQUI")) {
      throw new Error("A URL da ponte do Apps Script ainda não foi configurada.");
    }

    bridgeUrl = config.bridgeUrl;
    bridgeFrame = document.getElementById("hexis-bridge");

    if (!bridgeFrame) {
      throw new Error("A ponte de comunicação não foi encontrada na página.");
    }

    readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const readyTimeout = window.setTimeout(() => {
      if (ready) return;

      rejectReady(
        new Error("Não foi possível estabelecer conexão com o servidor.")
      );
    }, 15000);

    window.addEventListener("message", (event) => {
      /*
       * O Web App do Apps Script pode ser redirecionado para um domínio
       * googleusercontent.com. Por isso não validamos event.origin contra
       * script.google.com.
       *
       * A segurança aqui é feita verificando se a mensagem veio exatamente
       * do iframe que nós próprios carregamos e se pertence ao canal Héxis.
       */
      if (event.source !== bridgeFrame.contentWindow) return;

      const data = event.data || {};

      if (data.channel !== CHANNEL) return;

      if (data.type === "READY") {
        if (!ready) {
          ready = true;
          window.clearTimeout(readyTimeout);
          resolveReady();
        }
        return;
      }

      if (data.type !== "RESPONSE" || !data.id) return;

      const item = pending.get(data.id);

      if (!item) return;

      pending.delete(data.id);
      window.clearTimeout(item.timeout);

      if (data.ok) {
        item.resolve(data.result);
      } else {
        item.reject(
          new Error(data.error || "Falha na solicitação.")
        );
      }
    });

    /*
     * Carrega a ponte uma única vez.
     * Depois disso, as chamadas são feitas por postMessage.
     */
    bridgeFrame.src = bridgeUrl;

    initialized = true;
  }

  async function waitForBridge() {
    if (!initialized) initialize();

    if (ready) return;

    await readyPromise;
  }

  async function executeCall(action, payload, session) {
    await waitForBridge();

    return new Promise((resolve, reject) => {
      const id =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const timeout = window.setTimeout(() => {
        pending.delete(id);

        reject(
          new Error("O servidor demorou demais para responder.")
        );
      }, 30000);

      pending.set(id, {
        resolve,
        reject,
        timeout
      });

      /*
       * O destino usa "*" porque o Web App do Google pode sofrer
       * redirecionamento entre script.google.com e googleusercontent.com.
       *
       * A mensagem continua restrita ao contentWindow do iframe.
       * O próprio Bridge.html também valida a origem do frontend.
       */
      bridgeFrame.contentWindow.postMessage(
        {
          channel: CHANNEL,
          type: "REQUEST",
          id: id,
          request: {
            action: action,
            payload: payload || {},
            session: session || ""
          }
        },
        "*"
      );
    });
  }

  function call(action, payload, session) {
    if (!initialized) initialize();

    /*
     * Mantemos as chamadas em sequência para evitar concorrência
     * desnecessária sobre o Apps Script e a planilha.
     */
    queue = queue
      .catch(() => undefined)
      .then(() => executeCall(action, payload, session));

    return queue;
  }

  window.HexisBridge = {
    call: call
  };
})();
