// Integración de la Bandeja de TikTok Stickers y Envío de Paquetes .wastickers en WhatsApp Web

(function () {
  let isPanelOpen = false;
  let panelElement = null;
  let cachedStickers = [];

  const TIKTOK_WA_ICON = `
    <svg viewBox="0 0 24 24">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2z"/>
    </svg>
  `;

  function loadStoredStickers() {
    if (!chrome.runtime?.id) return;
    chrome.storage.local.get({ stickers: [] }, (res) => {
      cachedStickers = res.stickers || [];
      updateBadge();
      if (isPanelOpen) renderPanelContent();
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.stickers) {
      cachedStickers = changes.stickers.newValue || [];
      updateBadge();
      if (isPanelOpen) renderPanelContent();
    }
  });

  // Escuchar envío de paquetes .wastickers desde el popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "AUTO_SEND_DOCUMENT") {
      handleAutoSendDocument(request.dataUrl, request.filename)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });

  // Enviar archivo de paquete .wastickers al chat como documento oficial
  async function handleAutoSendDocument(dataUrl, filename) {
    showBanner("📦 Preparando paquete .wastickers para tu chat...");

    try {
      const parts = dataUrl.split(",");
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8 = new Uint8Array(n);
      while (n--) u8[n] = bstr.charCodeAt(n);
      const file = new File([u8], filename, { type: "application/octet-stream" });

      const dt = new DataTransfer();
      dt.items.add(file);

      const attachBtn = document.querySelector(
        'span[data-icon="plus"], span[data-icon="clip"], span[data-icon="attach-menu-plus"], button[aria-label*="Adjuntar"], button[aria-label*="Attach"]'
      );

      if (attachBtn) {
        (attachBtn.closest("button, div[role='button']") || attachBtn).click();
        await sleep(350);

        const docOption = document.querySelector(
          'span[data-icon="document"], span[data-icon="attach-document"], [aria-label*="documento" i], [title*="documento" i]'
        );

        let docInput = null;
        if (docOption) {
          const parentBtn = docOption.closest("li, div[role='button'], button");
          docInput = parentBtn?.querySelector('input[type="file"]');
        }

        if (!docInput) {
          const allInputs = document.querySelectorAll('input[type="file"]');
          for (let inp of allInputs) {
            const acc = inp.getAttribute("accept") || "";
            if (acc === "*" || acc === "") {
              docInput = inp;
              break;
            }
          }
        }

        if (docInput) {
          docInput.files = dt.files;
          docInput.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(700);

          const sent = await clickSendButton();
          if (sent) {
            showBanner("📦 ¡Paquete .wastickers enviado a tu chat! Ábrelo en tu celular para añadir el pack completo.");
            return { success: true };
          }
        }
      }
    } catch (e) {
      console.warn("Error enviando documento:", e);
    }

    showBanner("📦 Paquete descargado en tu PC.");
    return { success: true };
  }

  function updateBadge() {
    const badge = document.querySelector(".wa-tiktok-tray-badge");
    if (badge) {
      badge.textContent = cachedStickers.length;
      badge.style.display = cachedStickers.length > 0 ? "block" : "none";
    }
  }

  function injectTrayButton() {
    if (document.querySelector(".wa-tiktok-tray-trigger")) return;

    const footer = document.querySelector("footer");
    if (!footer) return;

    const targetAnchor = footer.querySelector(
      'span[data-icon="smiley"], span[data-icon="emoji-input"], span[data-icon="plus"], span[data-icon="clip"], button[aria-label*="emoji"], button[aria-label*="Emoticonos"]'
    )?.closest("button, div[role='button']");

    const container = targetAnchor?.parentElement || footer.querySelector('div[tabindex="-1"]') || footer;

    const btn = document.createElement("button");
    btn.className = "wa-tiktok-tray-trigger";
    btn.title = "Mis Stickers de TikTok";
    btn.type = "button";
    btn.innerHTML = `
      ${TIKTOK_WA_ICON}
      <span class="wa-tiktok-tray-badge" style="display: ${cachedStickers.length > 0 ? "block" : "none"}">
        ${cachedStickers.length}
      </span>
    `;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleStickerPanel();
    });

    if (targetAnchor && targetAnchor.nextSibling) {
      container.insertBefore(btn, targetAnchor.nextSibling);
    } else {
      container.appendChild(btn);
    }
  }

  function toggleStickerPanel() {
    isPanelOpen = !isPanelOpen;
    const trigger = document.querySelector(".wa-tiktok-tray-trigger");
    if (trigger) trigger.classList.toggle("active", isPanelOpen);

    if (isPanelOpen) {
      openStickerPanel();
    } else {
      closeStickerPanel();
    }
  }

  function openStickerPanel() {
    if (!panelElement) {
      panelElement = document.createElement("div");
      panelElement.className = "wa-tiktok-panel";
      panelElement.innerHTML = `
        <div class="wa-tiktok-panel-header">
          <div class="wa-tiktok-panel-title">
            ${TIKTOK_WA_ICON}
            <span>Mis Stickers de TikTok</span>
          </div>
          <button class="wa-tiktok-panel-close" title="Cerrar">✕</button>
        </div>
        <div class="wa-tiktok-panel-grid" id="wa-tiktok-grid"></div>
      `;

      panelElement.querySelector(".wa-tiktok-panel-close").addEventListener("click", () => {
        toggleStickerPanel();
      });

      panelElement.addEventListener("click", (e) => e.stopPropagation());
    }

    const mainChat = document.querySelector("#main") || document.body;
    mainChat.appendChild(panelElement);
    renderPanelContent();

    setTimeout(() => {
      document.addEventListener("click", handleClickOutside, { once: true });
    }, 100);
  }

  function closeStickerPanel() {
    if (panelElement && panelElement.parentElement) {
      panelElement.remove();
    }
    isPanelOpen = false;
    const trigger = document.querySelector(".wa-tiktok-tray-trigger");
    if (trigger) trigger.classList.remove("active");
  }

  function handleClickOutside(e) {
    if (isPanelOpen && panelElement && !panelElement.contains(e.target) && !e.target.closest(".wa-tiktok-tray-trigger")) {
      closeStickerPanel();
    }
  }

  function renderPanelContent() {
    const grid = panelElement?.querySelector("#wa-tiktok-grid");
    if (!grid) return;

    grid.innerHTML = "";

    if (cachedStickers.length === 0) {
      grid.innerHTML = `
        <div class="wa-tiktok-panel-empty">
          No tienes stickers de TikTok todavía.<br>
          Ve a TikTok, pasa el mouse sobre uno y guárdalo.
        </div>
      `;
      return;
    }

    cachedStickers.forEach((stk) => {
      const item = document.createElement("div");
      item.className = "wa-tiktok-panel-item";
      item.title = "Enviar al chat";

      const imgSrc = stk.dataUrl || stk.url;
      const isVideo = stk.mediaType === "video" || (imgSrc && imgSrc.includes("video/mp4"));

      if (isVideo) {
        const vid = document.createElement("video");
        vid.src = imgSrc;
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        item.appendChild(vid);
      } else {
        const img = document.createElement("img");
        img.src = imgSrc;
        img.alt = "Sticker";
        item.appendChild(img);
      }

      if (stk.isGif) {
        const tag = document.createElement("span");
        tag.className = "wa-tiktok-panel-gif-tag";
        tag.textContent = "ANIMADO";
        item.appendChild(tag);
      }

      item.addEventListener("click", () => {
        showBanner(stk.isGif ? "🎬 Enviando..." : "🟢 Enviando...");
        closeStickerPanel();
        sendStickerToActiveChat(stk).catch((err) => {
          console.warn("Error en envío:", err);
          showBanner("⚠️ Abre un chat para enviar el sticker.");
        });
      });

      grid.appendChild(item);
    });
  }

  // Enviar sticker individual al chat
  async function sendStickerToActiveChat(stk) {
    try {
      const src = stk.dataUrl || stk.url;
      let rawBlob = null;

      if (src && src.startsWith("data:")) {
        const arr = src.split(",");
        const mime = arr[0].match(/:(.*?);/)?.[1] || (stk.isGif ? "image/gif" : "image/webp");
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8 = new Uint8Array(n);
        while (n--) u8[n] = bstr.charCodeAt(n);
        rawBlob = new Blob([u8], { type: mime });
      } else {
        const res = await fetch(src);
        rawBlob = await res.blob();
      }

      if (!rawBlob) return;

      const file = new File([rawBlob], `media_${Date.now()}.${stk.isGif ? "mp4" : "webp"}`, {
        type: stk.isGif ? "video/mp4" : "image/webp"
      });

      const dt = new DataTransfer();
      dt.items.add(file);

      const attachBtn = document.querySelector(
        'span[data-icon="plus"], span[data-icon="clip"], span[data-icon="attach-menu-plus"], button[aria-label*="Adjuntar"], button[aria-label*="Attach"]'
      );

      if (!attachBtn) {
        showBanner("⚠️ Abre un chat para enviar el sticker.");
        return;
      }

      (attachBtn.closest("button, div[role='button']") || attachBtn).click();
      await sleep(350);

      const allInputs = document.querySelectorAll('input[type="file"]');
      let chosenInput = null;

      if (stk.isGif) {
        for (let inp of allInputs) {
          const acc = inp.getAttribute("accept") || "";
          if (acc.includes("video") || acc.includes("mp4")) {
            chosenInput = inp;
            break;
          }
        }
      } else {
        for (let inp of allInputs) {
          const acc = inp.getAttribute("accept") || "";
          if (acc === "image/*") {
            chosenInput = inp;
            break;
          }
        }
      }

      if (!chosenInput && allInputs.length > 0) {
        chosenInput = allInputs[0];
      }

      if (chosenInput) {
        chosenInput.files = dt.files;
        chosenInput.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(650);

        const sent = await clickSendButton();
        if (sent) {
          showBanner(stk.isGif ? "🎬 ¡Enviado!" : "✅ ¡Sticker enviado!");
          return;
        }
      }

      showBanner("Sticker listo en el chat.");
    } catch (err) {
      console.warn("Envío individual falló:", err);
      showBanner("⚠️ Error al enviar el sticker individual.");
    }
  }

  async function clickSendButton() {
    for (let i = 0; i < 20; i++) {
      const sendBtn = document.querySelector(
        'span[data-icon="send"], span[data-testid="send"], [aria-label="Enviar"], [aria-label="Send"], div[role="button"][aria-label*="Enviar"]'
      );
      if (sendBtn) {
        (sendBtn.closest("button, div[role='button']") || sendBtn).click();
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  function showBanner(msg) {
    let banner = document.querySelector(".wa-ext-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "wa-ext-banner";
      banner.innerHTML = `
        <div class="wa-ext-banner-icon">✓</div>
        <div class="wa-ext-banner-text"></div>
      `;
      document.body.appendChild(banner);
    }

    banner.querySelector(".wa-ext-banner-text").textContent = msg;
    banner.classList.add("show");

    setTimeout(() => {
      banner.classList.remove("show");
    }, 3800);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const observer = new MutationObserver(() => {
    injectTrayButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  loadStoredStickers();
  injectTrayButton();
})();
