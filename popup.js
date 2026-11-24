// Script para el Pop-up de la Galería y Empaquetador .wastickers

document.addEventListener("DOMContentLoaded", () => {
  const gallery = document.getElementById("gallery-container");
  const emptyState = document.getElementById("empty-state");
  const countBadge = document.getElementById("sticker-count");
  const btnOpenWa = document.getElementById("btn-open-wa");
  const btnSelectAll = document.getElementById("btn-select-all");
  const btnClearAll = document.getElementById("btn-clear-all");
  const selectedCountBadge = document.getElementById("selected-count-badge");
  const btnExportWa = document.getElementById("btn-export-wa");
  const btnDownloadPack = document.getElementById("btn-download-pack");
  const toast = document.getElementById("toast");

  let currentStickers = [];
  let selectedIds = new Set();

  loadStickers();

  // Abrir WhatsApp Web
  btnOpenWa.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "OPEN_WHATSAPP" });
  });

  // Vaciar toda la carpeta
  btnClearAll.addEventListener("click", () => {
    if (currentStickers.length === 0) return;
    if (confirm("¿Estás seguro de que deseas borrar todos los stickers guardados?")) {
      chrome.storage.local.set({ stickers: [] }, () => {
        selectedIds.clear();
        loadStickers();
        showToast("Galería vaciada");
      });
    }
  });

  // Seleccionar / Deseleccionar todos
  btnSelectAll.addEventListener("click", () => {
    if (selectedIds.size === currentStickers.length) {
      selectedIds.clear();
      btnSelectAll.textContent = "Seleccionar todos";
    } else {
      currentStickers.forEach((s) => selectedIds.add(s.id));
      btnSelectAll.textContent = "Deseleccionar";
    }
    updateSelectionUI();
  });

  // Cargar stickers de almacenamiento
  function loadStickers() {
    chrome.storage.local.get({ stickers: [] }, (res) => {
      currentStickers = res.stickers || [];
      // Por defecto seleccionar todos los que existan para agilizar
      currentStickers.forEach((s) => selectedIds.add(s.id));
      renderGallery(currentStickers);
      updateSelectionUI();
    });
  }

  // Renderizar la cuadrícula
  function renderGallery(stickers) {
    gallery.innerHTML = "";
    countBadge.textContent = `${stickers.length} guardados`;

    if (stickers.length === 0) {
      emptyState.style.display = "flex";
      gallery.style.display = "none";
      document.getElementById("pack-bar").style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    gallery.style.display = "grid";
    document.getElementById("pack-bar").style.display = "flex";

    stickers.forEach((stk) => {
      const card = document.createElement("div");
      card.className = "sticker-card" + (selectedIds.has(stk.id) ? " selected" : "");
      card.dataset.id = stk.id;

      // Checkbox indicador
      const check = document.createElement("div");
      check.className = "select-indicator";
      check.innerHTML = "✓";
      card.appendChild(check);

      // Botón eliminar individual
      const delBtn = document.createElement("button");
      delBtn.className = "card-del-btn";
      delBtn.innerHTML = "✕";
      delBtn.title = "Eliminar de la colección";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSticker(stk.id);
      });
      card.appendChild(delBtn);

      // Miniatura
      const isVideo = stk.mediaType === "video" || (stk.url && stk.url.includes(".mp4"));
      if (isVideo) {
        const vid = document.createElement("video");
        vid.className = "sticker-thumb";
        vid.src = stk.dataUrl || stk.url;
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        card.appendChild(vid);
      } else {
        const img = document.createElement("img");
        img.className = "sticker-thumb";
        img.src = stk.dataUrl || stk.url;
        img.alt = "Sticker";
        card.appendChild(img);
      }

      // Etiqueta GIF
      if (stk.isGif) {
        const gifTag = document.createElement("span");
        gifTag.className = "gif-tag";
        gifTag.textContent = "ANIMADO";
        card.appendChild(gifTag);
      }

      // Clic para alternar selección
      card.addEventListener("click", () => {
        if (selectedIds.has(stk.id)) {
          selectedIds.delete(stk.id);
        } else {
          selectedIds.add(stk.id);
        }
        updateSelectionUI();
      });

      gallery.appendChild(card);
    });
  }

  // Actualizar estado visual de selecciones
  function updateSelectionUI() {
    const cards = gallery.querySelectorAll(".sticker-card");
    cards.forEach((c) => {
      const id = c.dataset.id;
      if (selectedIds.has(id)) {
        c.classList.add("selected");
      } else {
        c.classList.remove("selected");
      }
    });

    const count = selectedIds.size;
    selectedCountBadge.textContent = `${count} seleccionados`;

    const disabled = count === 0;
    btnExportWa.disabled = disabled;
    btnDownloadPack.disabled = disabled;

    if (count === currentStickers.length && count > 0) {
      btnSelectAll.textContent = "Deseleccionar";
    } else {
      btnSelectAll.textContent = "Seleccionar todos";
    }
  }

  // BOTÓN 1: Descargar archivo .wastickers en PC
  btnDownloadPack.addEventListener("click", async () => {
    const selected = currentStickers.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) return;

    btnDownloadPack.disabled = true;
    showToast("Generando paquete .wastickers...");

    try {
      const packBlob = await WastickersBuilder.buildPackage(selected, "TikTok Pack", "Mis Stickers");
      downloadBlob(packBlob, `TikTok_Stickers_${Date.now()}.wastickers`);
      showToast("💾 ¡Paquete .wastickers descargado!");
    } catch (e) {
      console.error(e);
      showToast("Error al generar el paquete.");
    } finally {
      btnDownloadPack.disabled = false;
    }
  });

  // BOTÓN 2: Empaquetar y Enviar a WhatsApp Web (para abrir en el celular con un toque)
  btnExportWa.addEventListener("click", async () => {
    const selected = currentStickers.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) return;

    btnExportWa.disabled = true;
    btnExportWa.textContent = "Empaquetando...";
    showToast("📦 Creando paquete de stickers...");

    try {
      const packBlob = await WastickersBuilder.buildPackage(selected, "TikTok Pack", "Mis Stickers");
      const filename = `Mis_Stickers_TikTok_${Date.now()}.wastickers`;

      // 1. También descargarlo como respaldo
      downloadBlob(packBlob, filename);

      // 2. Convertir a Base64 para enviar a WhatsApp Web como Documento
      const reader = new FileReader();
      const base64Data = await new Promise((res) => {
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(packBlob);
      });

      // 3. Enviar a través de WhatsApp Web para recibirlo en tu propio chat
      chrome.runtime.sendMessage({
        action: "SEND_DOCUMENT_TO_WA",
        dataUrl: base64Data,
        filename: filename
      }, (response) => {
        btnExportWa.disabled = false;
        btnExportWa.textContent = "📦 Empaquetar y Enviar a WhatsApp";
        showToast("✅ ¡Paquete enviado! Ábrelo en tu teléfono para instalarlo.");
      });

    } catch (e) {
      console.error(e);
      btnExportWa.disabled = false;
      btnExportWa.textContent = "📦 Empaquetar y Enviar a WhatsApp";
      showToast("Error al procesar el paquete.");
    }
  });

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function deleteSticker(id) {
    currentStickers = currentStickers.filter((s) => s.id !== id);
    selectedIds.delete(id);
    chrome.storage.local.set({ stickers: currentStickers }, () => {
      renderGallery(currentStickers);
      updateSelectionUI();
      showToast("Sticker eliminado");
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3200);
  }
});
