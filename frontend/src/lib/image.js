// Shrinks a photo in the browser before it is sent to Gemini.
// Phone photos are several megabytes; 1024px is plenty to read a layout.

const MAX_SIDE = 1024;
const QUALITY = 0.85;

export async function prepareImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image could not be opened. Try a JPEG or PNG.");
  });

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);

  return {
    preview: dataUrl,
    mime_type: "image/jpeg",
    image: dataUrl.slice(dataUrl.indexOf(",") + 1),
  };
}
