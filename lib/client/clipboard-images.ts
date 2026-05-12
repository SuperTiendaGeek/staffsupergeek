export type CopyImagesResult = "all" | "single";

const UNSUPPORTED_MESSAGE =
  "Tu navegador no permite copiar imágenes automáticamente. Abre las fotos y cópialas manualmente.";
const COPY_FAILED_MESSAGE = "No se pudo copiar la imagen. Abre la foto y cópiala manualmente.";

function assertImageClipboardSupport() {
  if (
    typeof window === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function" ||
    typeof window.ClipboardItem === "undefined"
  ) {
    throw new Error(UNSUPPORTED_MESSAGE);
  }
}

async function blobToPng(blob: Blob) {
  if (blob.type === "image/png") return blob;

  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(COPY_FAILED_MESSAGE));
      image.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(COPY_FAILED_MESSAGE);
    context.drawImage(image, 0, 0);

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) throw new Error(COPY_FAILED_MESSAGE);
    return pngBlob;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function fetchImageAsPng(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(COPY_FAILED_MESSAGE);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error(COPY_FAILED_MESSAGE);
  return blobToPng(blob);
}

export async function copyImageToClipboard(url: string) {
  assertImageClipboardSupport();
  try {
    const pngBlob = await fetchImageAsPng(url);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  } catch (error) {
    if (error instanceof Error && error.message === UNSUPPORTED_MESSAGE) throw error;
    throw new Error(COPY_FAILED_MESSAGE);
  }
}

export async function copyImagesToClipboard(urls: string[]): Promise<CopyImagesResult> {
  assertImageClipboardSupport();
  if (urls.length === 0) throw new Error(COPY_FAILED_MESSAGE);

  try {
    const pngBlobs = await Promise.all(urls.map(fetchImageAsPng));
    const items = pngBlobs.map((blob) => new ClipboardItem({ "image/png": blob }));

    try {
      await navigator.clipboard.write(items);
      return items.length === 1 ? "single" : "all";
    } catch {
      await navigator.clipboard.write([items[0]]);
      return "single";
    }
  } catch (error) {
    if (error instanceof Error && error.message === UNSUPPORTED_MESSAGE) throw error;
    throw new Error(COPY_FAILED_MESSAGE);
  }
}
