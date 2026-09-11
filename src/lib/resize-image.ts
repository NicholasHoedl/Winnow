/**
 * Shrink a photo in the browser before it is uploaded (T33, ADR-0028).
 *
 * A phone photographs a receipt at 12 megapixels and several megabytes; the model reads
 * it just as well at 1600 px on the long edge, the provider would downscale anything
 * larger itself, and the request has to fit a route handler's body and a home upload
 * link. So the shrink happens here, on the device that took the picture, and only the
 * JPEG it produces leaves it. `fitWithin` is the arithmetic, kept pure so it is testable;
 * `resizeImageFile` is the DOM half, which only a browser can run.
 */

/** Long edge of the uploaded photo. Above this the provider downscales anyway. */
export const RECEIPT_MAX_EDGE = 1600
/** Readable receipt text at a fraction of the bytes; 0.85 is where JPEG stops paying. */
export const RECEIPT_JPEG_QUALITY = 0.85

export type ResizedImage = {
  mediaType: "image/jpeg"
  /** Base64, no data-URL prefix — what the request carries. */
  data: string
  /** The same image as a data URL, for the preview `<img>`. */
  previewUrl: string
  width: number
  height: number
}

/** The size a `width × height` image takes when its long edge is capped at `maxEdge`. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Decode `file`, shrink it, and re-encode it as a JPEG.
 *
 * `createImageBitmap` is what applies the camera's orientation tag and decodes whatever
 * the browser can display — including HEIC on iOS — so a portrait receipt arrives the
 * right way up. It throws for a file that is not an image the browser can decode, which
 * the caller turns into a message.
 */
export async function resizeImageFile(
  file: File,
  maxEdge = RECEIPT_MAX_EDGE,
): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is unavailable")
    context.drawImage(bitmap, 0, 0, width, height)
    const previewUrl = canvas.toDataURL("image/jpeg", RECEIPT_JPEG_QUALITY)
    return {
      mediaType: "image/jpeg",
      data: previewUrl.slice(previewUrl.indexOf(",") + 1),
      previewUrl,
      width,
      height,
    }
  } finally {
    bitmap.close()
  }
}
