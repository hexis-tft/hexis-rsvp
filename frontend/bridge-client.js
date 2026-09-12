(function () {
  "use strict";

  const CHANNEL = "HEXIS_RSVP_V1";
  const pending = new Map();

  let bridgeFrame = null;
  let bridgeUrl = "";
  let bridgeOrigin = "";
  let initialized = false;
  let queue = Promise.resolve();

  function initialize() {
    if (initialized) return;

    const config = window.HEXIS_CONFIG || {};

    if (!config.bridgeUrl || config.bridgeUrl.includes("COLE_AQUI")) {
      throw new Error(
        "A URL da ponte do Apps Script ainda não foi configurada."
      );
    }

    bridgeUrl = config.bridgeUrl;
    bridgeOrigin = new URL(bridgeUrl).origin;
    bridgeFrame = document.getElementById("hexis-bridge");

    if (!bridgeFrame) {
      throw new Error(
        "A ponte de comunicação não foi encontrada na página."
      );
    }

    window.addEventListener("message", function (event) {
      const data = event.data || {};

      if (data.channel !== CHANNEL) return;
      if (data.type !== "RESPONSE") return;
      if (!data.id) return;

      /*
       * O Apps Script pode responder a partir de domínio Google
       * diferente de script.google.com após o redirecionamento.
       * A validação principal aqui é feita pelo canal e pelo id
       * único da requisição.
       */
      const item = pending.get(data.id);

      if (!item) return;

      pending.delete(data.id);
      window.clearTimeout(item.timeout);

      if (data.ok) {
        item.resolve(data.result);
      } else {
        item.reject(
          new Error(
            data.error ||
            "Falha na solicitação."
          )
        );
      }
    });

    initialized = true;
  }

  function executeCall(action, payload, session) {
    if (!initialized) {
      initialize();
    }

    return new Promise(function (resolve, reject) {
      const id =
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .slice(2);

      const timeout =
        window.setTimeout(function () {
          pending.delete(id);

          reject(
            new Error(
              "O servidor demorou demais para responder."
            )
          );
        }, 30000);

      pending.set(id, {
        resolve: resolve,
        reject: reject,
        timeout: timeout
      });

      const request = {
        id: id,

        request: {
          action: action,
          payload: payload || {},
          session: session || ""
        }
      };

      const serialized =
        encodeURIComponent(
          JSON.stringify(request)
        );

      /*
       * A BridgeV2 executa uma requisição por carregamento do iframe.
       * Por isso cada chamada troca o src do iframe e leva os dados no
       * parâmetro r.
       */
      bridgeFrame.src =
        bridgeUrl +
        (bridgeUrl.includes("?") ? "&" : "?") +
        "r=" +
        serialized;
    });
  }

  function call(action, payload, session) {
    if (!initialized) {
      initialize();
    }

    /*
     * Serializa as chamadas para evitar concorrência desnecessária
     * no iframe e no Apps Script.
     */
    queue = queue
      .catch(function () {
        return undefined;
      })
      .then(function () {
        return executeCall(
          action,
          payload,
          session
        );
      });

    return queue;
  }

  window.HexisBridge = {
    call: call
  };
})();
