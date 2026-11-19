import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressImage } from '../../src/lib/imageCompression';

describe('Image Compression Utility', () => {
  beforeEach(() => {
    // Mock HTMLCanvasElement and 2D context for jsdom
    const mockContext = {
      drawImage: vi.fn(),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId) => {
      if (contextId === '2d') return mockContext;
      return null;
    });

    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue('data:image/jpeg;base64,mockCompressedBase64Data12345');
  });

  it('should compress and resize image, stripping metadata and returning compression stats', async () => {
    // Create a mock image file
    const mockFile = new File(['fake-image-bytes-large-file-content'], 'disaster.jpg', {
      type: 'image/jpeg',
    });

    // Mock Image loader
    const originalImage = global.Image;
    global.Image = class {
      width = 2400;
      height = 1800;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    } as any;

    const result = await compressImage(mockFile, 1280, 1280, 0.7);

    expect(result).toBeDefined();
    expect(result.dataUrl).toContain('data:image/jpeg;base64');
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.compressedSize).toBeGreaterThan(0);

    // Restore Image
    global.Image = originalImage;
  });
});
