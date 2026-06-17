(function () {
  "use strict";

  function waitForApiBaseUrl() {
    const apiBaseUrl = window.__API_BASE_URL__ || window.__NEIGHBOR_CONFIG__?.apiBaseUrl || "";
    if (apiBaseUrl) {
      maybeAddJuryNav(apiBaseUrl);
      return;
    }
    if (!waitForApiBaseUrl.retries) waitForApiBaseUrl.retries = 0;
    if (waitForApiBaseUrl.retries++ < 20) {
      window.setTimeout(waitForApiBaseUrl, 500);
    }
  }

  function maybeAddJuryNav(apiBaseUrl) {
    fetch(apiBaseUrl + "/api/auth/me", {
      credentials: "include",
      headers: { accept: "application/json" }
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (payload) {
        if (payload?.user?.isJury) {
          addJuryNavLink();
        }
      })
      .catch(function () {});
  }

  function addJuryNavLink() {
    const nav = document.querySelector(".bottom-nav");
    if (!nav || document.querySelector(".jlink")) {
      return;
    }

    const link = document.createElement("a");
    link.href = "/jury";
    link.className = "jlink";
    link.innerHTML = [
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">',
      '<path d="M12 2L2 7l10 5 10-5-10-5z"/>',
      '<path d="M2 17l10 5 10-5"/>',
      '<path d="M2 12l10 5 10-5"/>',
      "</svg>",
      "陪审"
    ].join("");
    nav.insertBefore(link, nav.lastElementChild);
  }

  window.setTimeout(waitForApiBaseUrl, 800);
})();
