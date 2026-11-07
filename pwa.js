"use strict";

(() => {
  const installButton = document.getElementById("install-button");
  const updateButton = document.getElementById("update-button");
  const offlineStatuses = document.querySelectorAll("[data-offline-status]");
  const standalone = window.matchMedia("(display-mode: standalone)");
  let installPrompt = null;
  let registration = null;
  let reloadForUpdate = false;

  if (!["https:", "http:"].includes(location.protocol)) return;

  function updateInstallButton() {
    installButton.hidden = standalone.matches || navigator.standalone === true;
  }
  function showMessage(message) {
    window.dispatchEvent(new CustomEvent("pwa-message", { detail: message }));
  }
  function setOfflineStatus(message) {
    offlineStatuses.forEach(status => { status.textContent = message; });
  }
  function showWaitingUpdate() {
    updateButton.hidden = !registration?.waiting || !navigator.serviceWorker.controller;
  }

  updateInstallButton();
  standalone.addEventListener?.("change", updateInstallButton);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButton.hidden = true;
    showMessage("已安装到桌面，下次可以直接打开。");
  });
  installButton.addEventListener("click", async () => {
    window.dispatchEvent(new Event("pwa-lock-key"));
    if (!installPrompt) {
      window.dispatchEvent(new Event("pwa-install-help"));
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") installButton.hidden = true;
    } catch (error) {
      console.info("浏览器未能显示安装提示。", error.name);
      window.dispatchEvent(new Event("pwa-install-help"));
    }
  });

  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    setOfflineStatus("当前浏览器可在线游玩");
    return;
  }

  setOfflineStatus("正在准备离线");
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadForUpdate) location.reload();
  });
  updateButton.addEventListener("click", () => {
    if (!registration?.waiting) return;
    window.dispatchEvent(new Event("pwa-lock-key"));
    reloadForUpdate = true;
    updateButton.disabled = true;
    updateButton.textContent = "正在更新";
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  });

  navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).then(result => {
    registration = result;
    showWaitingUpdate();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") showWaitingUpdate();
        if (worker.state === "redundant" && !registration.active) {
          setOfflineStatus("离线准备失败 · 联网后重试");
        }
      });
    });
    return navigator.serviceWorker.ready;
  }).then(() => {
    setOfflineStatus("离线就绪");
  }).catch(error => {
    setOfflineStatus("离线准备失败 · 联网后重试");
    console.info("未能准备离线缓存。", error.name);
  });

  window.addEventListener("online", () => {
    registration?.update().catch(error => console.info("未能检查应用更新。", error.name));
  });
})();
