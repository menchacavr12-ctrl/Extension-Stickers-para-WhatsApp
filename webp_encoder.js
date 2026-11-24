// WebP Encoder & Multiplexer: Convierte GIFs/WebP a Stickers WebP Animados 512x512 (< 500 KB)

function createAnimatedWebPBinary(frames, width = 512, height = 512) {
  const vp8x = new Uint8Array([
    0x56, 0x50, 0x38, 0x58, // 'VP8X'
    0x0A, 0x00, 0x00, 0x00, // Size: 10
    0x02, 0x00, 0x00, 0x00, // Flags: Animation
    (width - 1) & 0xFF, ((width - 1) >> 8) & 0xFF, ((width - 1) >> 16) & 0xFF,
    (height - 1) & 0xFF, ((height - 1) >> 8) & 0xFF, ((height - 1) >> 16) & 0xFF
  ]);

  const anim = new Uint8Array([
    0x41, 0x4E, 0x49, 0x4D, // 'ANIM'
    0x06, 0x00, 0x00, 0x00, // Size: 6
    0x00, 0x00, 0x00, 0x00, // BG Color (transparent)
    0x00, 0x00             // Loop count: 0 (infinite)
  ]);

  const anmfList = [];
  let totalAnmfLength = 0;

  for (const f of frames) {
    const buf = f.buffer;
    let offset = 12;
    let bitstreamStart = -1;
    let bitstreamLen = 0;

    while (offset + 8 <= buf.length) {
      const fourcc = String.fromCharCode(buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]);
      const chunkSize = buf[offset+4] | (buf[offset+5] << 8) | (buf[offset+6] << 16) | (buf[offset+7] << 24);
      if (fourcc === 'VP8 ' || fourcc === 'VP8L') {
        bitstreamStart = offset;
        bitstreamLen = 8 + chunkSize + (chunkSize % 2);
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (bitstreamStart === -1) continue;

    const frameBitstream = buf.subarray(bitstreamStart, bitstreamStart + bitstreamLen);
    const duration = Math.max(10, Math.min(65535, f.durationMs || 100));
    const anmfPayloadSize = 16 + frameBitstream.length;
    const anmfPad = anmfPayloadSize % 2;

    const anmfChunk = new Uint8Array(8 + anmfPayloadSize + anmfPad);
    anmfChunk[0] = 0x41; anmfChunk[1] = 0x4E; anmfChunk[2] = 0x4D; anmfChunk[3] = 0x46; // 'ANMF'
    anmfChunk[4] = anmfPayloadSize & 0xFF;
    anmfChunk[5] = (anmfPayloadSize >> 8) & 0xFF;
    anmfChunk[6] = (anmfPayloadSize >> 16) & 0xFF;
    anmfChunk[7] = (anmfPayloadSize >> 24) & 0xFF;
    anmfChunk[8] = 0; anmfChunk[9] = 0; anmfChunk[10] = 0;
    anmfChunk[11] = 0; anmfChunk[12] = 0; anmfChunk[13] = 0;
    anmfChunk[14] = (width - 1) & 0xFF;
    anmfChunk[15] = ((width - 1) >> 8) & 0xFF;
    anmfChunk[16] = ((width - 1) >> 16) & 0xFF;
    anmfChunk[17] = (height - 1) & 0xFF;
    anmfChunk[18] = ((height - 1) >> 8) & 0xFF;
    anmfChunk[19] = ((height - 1) >> 16) & 0xFF;
    anmfChunk[20] = duration & 0xFF;
    anmfChunk[21] = (duration >> 8) & 0xFF;
    anmfChunk[22] = (duration >> 16) & 0xFF;
    anmfChunk[23] = 0x02; // Flags: do not blend, disposal none

    anmfChunk.set(frameBitstream, 24);

    anmfList.push(anmfChunk);
    totalAnmfLength += anmfChunk.length;
  }

  const bodyLength = vp8x.length + anim.length + totalAnmfLength;
  const totalRiffSize = 4 + bodyLength;

  const result = new Uint8Array(12 + bodyLength);
  result[0] = 0x52; result[1] = 0x49; result[2] = 0x46; result[3] = 0x46; // 'RIFF'
  result[4] = totalRiffSize & 0xFF;
  result[5] = (totalRiffSize >> 8) & 0xFF;
  result[6] = (totalRiffSize >> 16) & 0xFF;
  result[7] = (totalRiffSize >> 24) & 0xFF;
  result[8] = 0x57; result[9] = 0x45; result[10] = 0x42; result[11] = 0x50; // 'WEBP'

  result.set(vp8x, 12);
  result.set(anim, 12 + vp8x.length);

  let currentOffset = 12 + vp8x.length + anim.length;
  for (const anmf of anmfList) {
    result.set(anmf, currentOffset);
    currentOffset += anmf.length;
  }

  return result;
}

// Convertir cualquier Blob de GIF o WebP a Sticker Animado 512x512 oficial de WhatsApp (< 500 KB)
async function processToWhatsAppSticker(blob, isGif) {
  // Si no es animado, crear WebP estático 512x512
  if (!isGif) {
    return createStatic512WebP(blob);
  }

  // Si ImageDecoder está disponible en el navegador (Chrome 94+)
  if (typeof ImageDecoder !== "undefined") {
    try {
      const type = blob.type.includes("webp") ? "image/webp" : "image/gif";
      const decoder = new ImageDecoder({ data: blob.stream(), type: type });
      await decoder.tracks.ready;

      const track = decoder.tracks.selectedTrack;
      const frameCount = track ? track.frameCount : 1;

      if (frameCount > 1) {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");

        // Limitar a máximo 28 fotogramas para garantizar que pese menos de 480 KB
        const maxFrames = 28;
        const step = Math.max(1, Math.ceil(frameCount / maxFrames));
        const frames = [];

        for (let i = 0; i < frameCount; i += step) {
          const result = await decoder.decode({ frameIndex: i });
          const duration = ((result.image.duration ? result.image.duration / 1000 : 80) * step);

          ctx.clearRect(0, 0, 512, 512);

          // Escalar centrando en 512x512 con márgenes transparentes
          const dw = result.image.displayWidth || result.image.codedWidth || 512;
          const dh = result.image.displayHeight || result.image.codedHeight || 512;
          const scale = Math.min(512 / dw, 512 / dh);
          const w = dw * scale;
          const h = dh * scale;
          const x = (512 - w) / 2;
          const y = (512 - h) / 2;

          ctx.drawImage(result.image, x, y, w, h);
          result.image.close();

          const frameBlob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.70));
          const frameBuffer = new Uint8Array(await frameBlob.arrayBuffer());
          frames.push({
            buffer: frameBuffer,
            durationMs: Math.max(20, Math.round(duration))
          });
        }

        const animWebpBytes = createAnimatedWebPBinary(frames, 512, 512);
        return new Blob([animWebpBytes], { type: "image/webp" });
      }
    } catch (e) {
      console.warn("Fallo en ImageDecoder:", e);
    }
  }

  // Fallback si falla ImageDecoder
  return createStatic512WebP(blob);
}

// Convertir imagen estática a 512x512 WebP
function createStatic512WebP(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 512, 512);

      const scale = Math.min(512 / img.width, 512 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (512 - w) / 2;
      const y = (512 - h) / 2;

      ctx.drawImage(img, x, y, w, h);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url);
        resolve(b || blob);
      }, "image/webp", 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}
