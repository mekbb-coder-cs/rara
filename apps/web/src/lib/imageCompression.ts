export interface CompressionResult {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
}

/**
 * Compresses an image in the browser using HTML5 Canvas.
 * - Resizes dimensions to at most maxWidth x maxHeight preserving aspect ratio.
 * - Re-encodes with JPEG quality (0.7 default).
 * - Strips all EXIF / metadata from the source image to protect user privacy.
 */
export async function compressImage(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.7
): Promise<CompressionResult> {
  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-ratio preserved dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get 2D canvas context'));
          return;
        }

        // Draw image onto canvas (automatically strips EXIF metadata)
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to low-bandwidth JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Approximate byte size of base64
        const head = 'data:image/jpeg;base64,';
        const base64Length = dataUrl.length - head.length;
        const compressedSize = Math.round((base64Length * 3) / 4);

        const reduction = originalSize > 0
          ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
          : 0;

        resolve({
          dataUrl,
          originalSize,
          compressedSize,
          reductionPercentage: reduction,
        });
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
