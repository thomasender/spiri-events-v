import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadBytesResumable = vi.hoisted(() => vi.fn());
vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, path: string) => ({ fullPath: path }),
  uploadBytesResumable,
  getDownloadURL: async (r: { fullPath: string }) => `https://dl/${r.fullPath}`,
  deleteObject: vi.fn(),
}));
vi.mock('../../src/lib/firebase', () => ({ storage: {} }));

import { uploadEventCover, uploadProfileImage } from '../../src/lib/imageUpload';

type Call = { path: string; blob: Blob; metadata: Record<string, string> };
const calls: Call[] = [];

function stubBrowserImagePipeline({ webp }: { webp: boolean }) {
  class FakeImage {
    width = 4000;
    height = 3000;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  const sizes: number[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: '' }),
    toBlob(cb: (b: Blob | null) => void, type: string) {
      sizes.push(canvas.width);
      const actual = type === 'image/webp' && !webp ? 'image/png' : type;
      cb(new Blob(['x'], { type: actual }));
    },
  };
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? canvas : Document.prototype.createElement.call(document, tag)) as never);
  return { canvas, sizes };
}

beforeEach(() => {
  calls.length = 0;
  vi.restoreAllMocks();
  uploadBytesResumable.mockImplementation((r: { fullPath: string }, blob: Blob, metadata) => {
    calls.push({ path: r.fullPath, blob, metadata });
    return {
      on: (_e: string, _p: unknown, _err: unknown, done: () => void) => queueMicrotask(done),
      snapshot: { ref: r },
    };
  });
});

describe('image upload pipeline', () => {
  it('uploads the cover plus a thumb_ sibling, both with long-lived cache headers', async () => {
    const { sizes } = stubBrowserImagePipeline({ webp: true });
    const out = await uploadEventCover(new File(['x'], 'my photo.png'), { eventId: 'e1' });

    expect(calls).toHaveLength(2);
    const [cover, thumb] = calls;
    expect(cover.path).toMatch(/^events\/e1\/\d+_my_photo\.png$/);
    expect(thumb.path).toBe(cover.path.replace('events/e1/', 'events/e1/thumb_'));
    expect(cover.metadata.contentType).toBe('image/jpeg');
    expect(thumb.metadata.contentType).toBe('image/webp');
    for (const c of calls) expect(c.metadata.cacheControl).toContain('max-age=31536000');
    expect(out).toEqual({ url: `https://dl/${cover.path}`, thumbUrl: `https://dl/${thumb.path}` });
    // 4000x3000 source: cover capped at 1600, thumbnail much smaller
    expect(sizes[0]).toBe(1600);
    expect(sizes[sizes.length - 1]).toBe(720);
  });

  it('falls back to a JPEG thumbnail when the browser cannot encode WebP', async () => {
    stubBrowserImagePipeline({ webp: false });
    await uploadEventCover(new File(['x'], 'a.jpg'), { eventId: 'e1' });
    expect(calls[1].metadata.contentType).toBe('image/jpeg');
  });

  it('still returns the cover when the thumbnail upload fails', async () => {
    stubBrowserImagePipeline({ webp: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    uploadBytesResumable.mockImplementationOnce((r: { fullPath: string }, blob: Blob, metadata) => {
      calls.push({ path: r.fullPath, blob, metadata });
      return {
        on: (_e: string, _p: unknown, _err: unknown, done: () => void) => queueMicrotask(done),
        snapshot: { ref: r },
      };
    });
    uploadBytesResumable.mockImplementationOnce(() => ({
      on: (_e: string, _p: unknown, err: (e: Error) => void) =>
        queueMicrotask(() => err(new Error('boom'))),
    }));
    const out = await uploadEventCover(new File(['x'], 'a.jpg'), { eventId: 'e1' });
    expect(out.url).toMatch(/^https:\/\/dl\/events\/e1\//);
    expect(out.thumbUrl).toBeNull();
  });

  it('downsizes profile photos to avatar size', async () => {
    const { sizes } = stubBrowserImagePipeline({ webp: true });
    await uploadProfileImage(new File(['x'], 'me.jpg'), 'u1');
    expect(sizes[0]).toBe(720);
    expect(calls[0].metadata.cacheControl).toContain('immutable');
  });
});
