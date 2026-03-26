/**
 * Image upload service using ImgBB (free public image hosting)
 * Images are uploaded to imgbb.com and served via their CDN
 * No authentication required for basic uploads
 */

const IMGBB_API_URL = "https://api.imgbb.com/1/upload";

/**
 * Upload an image file to ImgBB
 * @param {File} file - The image file to upload
 * @param {number} maxSizeKB - Maximum file size in KB (default: 500KB)
 * @returns {Promise<string>} - The URL of the uploaded image
 */
export async function uploadImage(file, maxSizeKB = 500) {
  // Compress image before upload
  const compressedBlob = await compressImage(file, maxSizeKB);

  // Convert blob to base64
  const base64 = await blobToBase64(compressedBlob);

  // ImgBB expects raw base64 without the "data:image/...;base64," prefix
  const base64Data = base64.split(",")[1];

  // Build form data
  const formData = new FormData();
  formData.append("image", base64Data);

  // Upload to ImgBB
  const response = await fetch(
    `${IMGBB_API_URL}?key=3db7dc19a9f9068d0c780b6b63126d32`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error("Bild-Upload fehlgeschlagen");
  }

  const data = await response.json();

  if (data.success) {
    return data.data.url;
  } else {
    throw new Error("Bild-Upload fehlgeschlagen");
  }
}

/**
 * Compress an image to target size
 * @param {File} file - The image file
 * @param {number} maxSizeKB - Target max size in KB
 * @returns {Promise<Blob>} - Compressed image blob
 */
function compressImage(file, maxSizeKB = 500) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // Scale down if needed
      const maxDim = 1200;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Try quality 0.8 first, then lower if needed
      let quality = 0.8;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);

      // Base64 is ~37% larger than binary, so check accordingly
      while (dataUrl.length > maxSizeKB * 1024 * 1.37 && quality > 0.2) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }

      // Convert data URL to blob
      const byteString = atob(dataUrl.split(",")[1]);
      const mimeType = "image/jpeg";
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      resolve(new Blob([ab], { type: mimeType }));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Convert blob to base64 string
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} - Base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
