/** Lê um File de imagem, redimensiona (quadrado central) e devolve um data URI leve. */
export async function fileToAvatarDataUri(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();

  // tenta webp; cai para jpeg; baixa a qualidade até caber em ~180 KB
  for (const type of ["image/webp", "image/jpeg"]) {
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const uri = canvas.toDataURL(type, q);
      if (uri.startsWith(`data:${type}`) && uri.length <= 260_000) return uri;
    }
  }
  return canvas.toDataURL("image/jpeg", 0.4);
}
