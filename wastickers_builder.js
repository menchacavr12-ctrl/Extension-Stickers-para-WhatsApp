// Generador de Paquetes Oficiales .wastickers para WhatsApp (Compatible con Sticker Maker / Sticker.ly)

const WastickersBuilder = {
  // Tabla CRC32
  crcTable: (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    return table;
  })(),

  crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = this.crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  },

  // Crear archivo ZIP (STORE sin compresión para máxima velocidad y compatibilidad)
  createZip(files) {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const data = file.data;
      const crc = this.crc32(data);
      const size = data.length;

      // Local Header (30 bytes + name)
      const local = new Uint8Array(30 + nameBytes.length);
      local[0] = 0x50; local[1] = 0x4B; local[2] = 0x03; local[3] = 0x04;
      local[4] = 20; local[5] = 0;
      local[14] = crc & 0xFF; local[15] = (crc >> 8) & 0xFF;
      local[16] = (crc >> 16) & 0xFF; local[17] = (crc >> 24) & 0xFF;
      local[18] = size & 0xFF; local[19] = (size >> 8) & 0xFF;
      local[20] = (size >> 16) & 0xFF; local[21] = (size >> 24) & 0xFF;
      local[22] = size & 0xFF; local[23] = (size >> 8) & 0xFF;
      local[24] = (size >> 16) & 0xFF; local[25] = (size >> 24) & 0xFF;
      local[26] = nameBytes.length & 0xFF; local[27] = (nameBytes.length >> 8) & 0xFF;
      local.set(nameBytes, 30);

      // Central Directory Header (46 bytes + name)
      const central = new Uint8Array(46 + nameBytes.length);
      central[0] = 0x50; central[1] = 0x4B; central[2] = 0x01; central[3] = 0x02;
      central[4] = 20; central[5] = 0;
      central[6] = 20; central[7] = 0;
      central[16] = crc & 0xFF; central[17] = (crc >> 8) & 0xFF;
      central[18] = (crc >> 16) & 0xFF; central[19] = (crc >> 24) & 0xFF;
      central[20] = size & 0xFF; central[21] = (size >> 8) & 0xFF;
      central[22] = (size >> 16) & 0xFF; central[23] = (size >> 24) & 0xFF;
      central[24] = size & 0xFF; central[25] = (size >> 8) & 0xFF;
      central[26] = (size >> 16) & 0xFF; central[27] = (size >> 24) & 0xFF;
      central[28] = nameBytes.length & 0xFF; central[29] = (nameBytes.length >> 8) & 0xFF;
      central[42] = offset & 0xFF; central[43] = (offset >> 8) & 0xFF;
      central[44] = (offset >> 16) & 0xFF; central[45] = (offset >> 24) & 0xFF;
      central.set(nameBytes, 46);

      localHeaders.push(local, data);
      centralHeaders.push(central);

      offset += local.length + data.length;
    }

    const cdSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);
    const eocd = new Uint8Array(22);
    eocd[0] = 0x50; eocd[1] = 0x4B; eocd[2] = 0x05; eocd[3] = 0x06;
    eocd[8] = files.length & 0xFF; eocd[9] = (files.length >> 8) & 0xFF;
    eocd[10] = files.length & 0xFF; eocd[11] = (files.length >> 8) & 0xFF;
    eocd[12] = cdSize & 0xFF; eocd[13] = (cdSize >> 8) & 0xFF;
    eocd[14] = (cdSize >> 16) & 0xFF; eocd[15] = (cdSize >> 24) & 0xFF;
    eocd[16] = offset & 0xFF; eocd[17] = (offset >> 8) & 0xFF;
    eocd[18] = (offset >> 16) & 0xFF; eocd[19] = (offset >> 24) & 0xFF;

    const total = offset + cdSize + 22;
    const zip = new Uint8Array(total);
    let pos = 0;
    for (const part of [...localHeaders, ...centralHeaders, eocd]) {
      zip.set(part, pos);
      pos += part.length;
    }

    return zip;
  },

  // Construir el archivo .wastickers a partir de los stickers seleccionados
  async buildPackage(stickers, title = "TikTok Pack", author = "TikTok Stickers") {
    const files = [
      { name: "title.txt", data: new TextEncoder().encode(title) },
      { name: "author.txt", data: new TextEncoder().encode(author) }
    ];

    let iconData = null;

    for (let i = 0; i < stickers.length; i++) {
      const stk = stickers[i];
      let bytes = null;

      if (stk.dataUrl && stk.dataUrl.startsWith("data:")) {
        const parts = stk.dataUrl.split(",");
        const bstr = atob(parts[1]);
        bytes = new Uint8Array(bstr.length);
        for (let j = 0; j < bstr.length; j++) bytes[j] = bstr.charCodeAt(j);
      } else {
        const res = await fetch(stk.url);
        const ab = await res.arrayBuffer();
        bytes = new Uint8Array(ab);
      }

      // El primer sticker se usa como icono del pack si no hay otro
      if (i === 0) iconData = bytes;

      files.push({
        name: `${i}.webp`,
        data: bytes
      });
    }

    if (iconData) {
      files.push({
        name: "tray_icon.png",
        data: iconData
      });
    }

    const zipBytes = this.createZip(files);
    return new Blob([zipBytes], { type: "application/octet-stream" });
  }
};
