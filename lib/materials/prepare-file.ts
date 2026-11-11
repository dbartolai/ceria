const maxUploadSize = 4 * 1024 * 1024;

export async function prepareMaterialFile(file: File): Promise<File> {
  const heic = /\.(heic|heif)$/i.test(file.name) || /^image\/(heic|heif)(-sequence)?$/i.test(file.type);
  if (!heic) return file;
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Choose a HEIC photo up to 20 MB.");
  const { heicTo } = await import("heic-to");
  let jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.85 });
  if (jpeg.size > maxUploadSize) {
    const bitmap = await createImageBitmap(jpeg);
    try {
      const scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The photo could not be converted in this browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Photo conversion failed.")), "image/jpeg", 0.85));
    } finally { bitmap.close(); }
  }
  if (jpeg.size > maxUploadSize) throw new Error("The converted photo is over 4 MB. Choose a smaller photo.");
  return new File([jpeg], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
}
