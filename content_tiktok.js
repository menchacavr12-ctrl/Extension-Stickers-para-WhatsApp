// Content Script para TikTok Web

(function () {
  let activeFloatingBtn = null;
  let currentTargetMedia = null;
  let hideTimeout = null;

  const WA_ICON_SVG = `
    <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;flex-shrink:0;">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2z"/>
    </svg>
  `;

  // Asegurar que la URL sea la versión animada original
  function getAnimatedUrl(url) {
    if (!url) return url;

    // Giphy en TikTok: asegurar que descargue la versión GIF completa (.gif)
    if (url.includes("giphy.com")) {
      url = url.replace(/_s\.(gif|webp|png|jpg)$/i, ".gif");
      url = url.replace(/\.(webp|png|jpg)(\?.*)?$/i, ".gif$2");
    }

    // TikTok CDN: quitar recorte estático cropcenter
    if (url.includes("tiktokcdn.com") || url.includes("byteoversea.com") || url.includes("ibyteimg.com")) {
      if (url.includes("cropcenter")) {
        url = url.replace(/~tplv-[^?&]+\.webp/i, "~tplv-tiktok-play.image");
      }
    }

    return url;
  }

  function createFloatingButton() {
    const btn = document.createElement("button");
    btn.className = "wa-tiktok-btn";
    btn.innerHTML = `${WA_ICON_SVG}<span>Guardar Sticker</span>`;
    btn.style.display = "none";
    document.body.appendChild(btn);

    btn.addEventListener("mouseenter", () => clearTimeout(hideTimeout));
    btn.addEventListener("mouseleave", () => hideFloatingButton());

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (!chrome.runtime?.id) {
        alert("⚠️ Por favor recarga esta pestaña de TikTok (presiona F5) para activar la extensión.");
        return;
      }

      if (!currentTargetMedia) return;

      const mediaData = extractMediaSource(currentTargetMedia);
      if (!mediaData || !mediaData.url) {
        showToast("⚠️ No se pudo obtener el GIF o sticker.");
        return;
      }

      btn.classList.add("saved");
      btn.innerHTML = `✓ <span>¡Guardado!</span>`;

      try {
        chrome.runtime.sendMessage({
          action: "SAVE_STICKER",
          data: {
            url: mediaData.url,
            isGif: mediaData.isGif,
            mediaType: mediaData.type
          }
        }, () => {
          showToast(mediaData.isGif ? "🎬 ¡GIF animado guardado para WhatsApp!" : "🟢 ¡Sticker guardado!");
        });
      } catch (err) {
        alert("⚠️ Por favor recarga esta pestaña de TikTok (F5) para conectar la extensión.");
      }

      setTimeout(() => {
        hideFloatingButton();
      }, 1500);
    });

    return btn;
  }

  function extractMediaSource(el) {
    if (!el) return null;

    if (el.tagName === "VIDEO") {
      const src = el.currentSrc || el.src || el.querySelector("source")?.src;
      return { url: getAnimatedUrl(src), isGif: true, type: "video" };
    }

    if (el.tagName === "IMG") {
      const src = el.currentSrc || el.src;
      const isGif = src.toLowerCase().includes(".gif") || 
                    src.includes("format=gif") || 
                    src.includes("giphy.com") || 
                    src.includes("tplv-tiktok-play");
      
      const cleanUrl = isGif ? getAnimatedUrl(src) : src;
      return { url: cleanUrl, isGif: isGif, type: "image" };
    }

    return null;
  }

  function findStickerElement(target) {
    if (!target) return null;

    if (isValidSticker(target)) return target;

    const imgInside = target.querySelector("img");
    if (imgInside && isValidSticker(imgInside)) return imgInside;

    const videoInside = target.querySelector("video");
    if (videoInside && isValidSticker(videoInside)) return videoInside;

    const container = target.closest(
      '[class*="comment"], [class*="sticker"], [class*="emoji"], [class*="giphy"], [data-e2e="comment-item"]'
    );
    if (container) {
      const foundImg = container.querySelector("img");
      if (foundImg && isValidSticker(foundImg)) return foundImg;

      const foundVideo = container.querySelector("video");
      if (foundVideo && isValidSticker(foundVideo)) return foundVideo;
    }

    return null;
  }

  function isValidSticker(el) {
    if (!el) return false;

    if (el.tagName === "VIDEO") {
      if (el.closest('[data-e2e="feed-video"]') || el.classList.contains("basicPlayer")) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.width <= 550 && rect.height > 20 && rect.height <= 550;
    }

    if (el.tagName === "IMG") {
      if (el.closest('[data-e2e="comment-avatar"]') || el.classList.contains("avatar") || el.alt?.toLowerCase().includes("avatar")) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 44 && rect.height <= 44 && (rect.width === rect.height)) {
        if (el.className.includes("circle") || el.closest('[class*="avatar"]')) return false;
      }

      return rect.width >= 20 && rect.width <= 550 && rect.height >= 20 && rect.height <= 550;
    }

    return false;
  }

  function showFloatingButton(element) {
    if (!activeFloatingBtn) {
      activeFloatingBtn = createFloatingButton();
    }

    clearTimeout(hideTimeout);
    currentTargetMedia = element;

    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    const isVideo = element.tagName === "VIDEO" || element.src?.includes("giphy");
    activeFloatingBtn.classList.remove("saved");
    activeFloatingBtn.innerHTML = `${WA_ICON_SVG}<span>${isVideo ? "Guardar GIF" : "Guardar Sticker"}</span>`;
    activeFloatingBtn.style.top = `${scrollTop + rect.top + 4}px`;
    activeFloatingBtn.style.left = `${scrollLeft + rect.right - 95}px`;
    activeFloatingBtn.style.display = "flex";
  }

  function hideFloatingButton() {
    hideTimeout = setTimeout(() => {
      if (activeFloatingBtn) {
        activeFloatingBtn.style.display = "none";
        currentTargetMedia = null;
      }
    }, 450);
  }

  document.addEventListener("mouseover", (e) => {
    const candidate = findStickerElement(e.target);
    if (candidate) {
      showFloatingButton(candidate);
    }
  }, true);

  document.addEventListener("mouseout", (e) => {
    if (currentTargetMedia && !e.relatedTarget?.closest(".wa-tiktok-btn")) {
      hideFloatingButton();
    }
  }, true);

  function showToast(message) {
    const existing = document.querySelector(".wa-sticker-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "wa-sticker-toast";
    toast.innerHTML = `
      <div class="wa-sticker-toast-icon">✓</div>
      <div>${message}</div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "SHOW_TOAST") {
      showToast(msg.message);
    }
  });

})();
