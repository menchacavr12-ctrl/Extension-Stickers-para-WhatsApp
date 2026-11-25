// Background Service Worker for TikTok to WhatsApp Stickers

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-wa-sticker",
    title: " Guardar como Sticker de WhatsApp",
    contexts: ["image", "video", "link"]
  });
  console.log("TikTok to WhatsApp Stickers listo.");
  migrateExistingStickers();
});

// Convertir stickers antiguos a base64 para arreglar imágenes rotas
async function migrateExistingStickers() {
  try {
    const result = await chrome.storage.local.get({ stickers: [] });
    let changed = false;
    for (let s of result.stickers) {
      if (!s.dataUrl || !s.dataUrl.startsWith("data:")) {
        const b64 = await fetchAsBase64(s.url);
        if (b64 && b64.startsWith("data:")) {
          s.dataUrl = b64;
          changed = true;
        }
      }
    }
    if (changed) {
      await chrome.storage.local.set({ stickers: result.stickers });
      console.log("Stickers anteriores reparados a base64 correctamente.");
    }
  } catch (e) {
    console.warn("Migración de stickers:", e);
  }
}

migrateExistingStickers();

// Clic derecho
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-to-wa-sticker") {
    const mediaUrl = info.srcUrl || info.linkUrl;
    if (mediaUrl) {
      const isVideo = mediaUrl.includes(".mp4") || info.mediaType === "video";
      const isGif = isVideo || mediaUrl.includes(".gif") || mediaUrl.includes("giphy.com");

      await saveStickerToGallery({
        url: mediaUrl,
        isGif: isGif,
        mediaType: isVideo ? "video" : "image"
      });

      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: "SHOW_TOAST",
          message: isGif ? "¡GIF guardado para WhatsApp Web!" : "¡Sticker guardado para WhatsApp Web!"
        }).catch(() => {});
      }
    }
  }
});

// Mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SAVE_STICKER") {
    saveStickerToGallery(request.data).then((savedItem) => {
      sendResponse({ success: true, item: savedItem });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === "OPEN_WHATSAPP") {
    chrome.tabs.create({ url: "https://web.whatsapp.com" });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "SEND_DOCUMENT_TO_WA") {
    sendDocumentToWhatsApp(request.dataUrl, request.filename)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function sendDocumentToWhatsApp(dataUrl, filename) {
  const tabs = await chrome.tabs.query({ url: "*://web.whatsapp.com/*" });
  let waTab = null;

  if (tabs && tabs.length > 0) {
    waTab = tabs[0];
    await chrome.tabs.update(waTab.id, { active: true });
    if (waTab.windowId) {
      await chrome.windows.update(waTab.windowId, { focused: true });
    }
  } else {
    waTab = await chrome.tabs.create({ url: "https://web.whatsapp.com" });
    await waitForTabComplete(waTab.id);
    await new Promise(r => setTimeout(r, 4000));
  }

  try {
    const res = await chrome.tabs.sendMessage(waTab.id, {
      action: "AUTO_SEND_DOCUMENT",
      dataUrl: dataUrl,
      filename: filename
    });
    return res || { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Descargar medios y convertirlos a base64 DataURL
async function fetchAsBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("No se pudo convertir a base64, usando URL original:", e);
    return url;
  }
}

// Guardar sticker en el almacenamiento local de Chrome
async function saveStickerToGallery(stickerData) {
  const result = await chrome.storage.local.get({ stickers: [] });
  const stickers = result.stickers;

  const exists = stickers.some(s => s.url === stickerData.url);
  if (exists) {
    return stickers.find(s => s.url === stickerData.url);
  }

  const isVideo = stickerData.mediaType === "video" || stickerData.url.includes(".mp4");
  const isGif = stickerData.isGif || isVideo || stickerData.url.toLowerCase().includes(".gif") || stickerData.url.includes("giphy.com");

  let dataUrl = stickerData.dataUrl;
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    dataUrl = await fetchAsBase64(stickerData.url);
  }

  const newSticker = {
    id: "stk_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    url: stickerData.url,
    dataUrl: dataUrl,
    isGif: isGif,
    mediaType: isVideo ? "video" : (stickerData.mediaType || "image"),
    createdAt: Date.now()
  };

  stickers.unshift(newSticker);
  await chrome.storage.local.set({ stickers });

  chrome.action.setBadgeText({ text: "+" });
  chrome.action.setBadgeBackgroundColor({ color: "#25D366" });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 2500);

  return newSticker;
}
