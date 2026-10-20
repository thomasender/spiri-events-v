import { describe, it, expect, vi } from 'vitest';
import { deleteEventAssets, eventStoragePrefixes } from '../../functions/src/eventStorageCleanup';

describe('eventStorageCleanup', () => {
  it('covers cover image, thumbnails and description images', () => {
    expect(eventStoragePrefixes('abc')).toEqual(['events/abc/', 'event-descriptions/abc/']);
  });

  it('deletes all files under each prefix', async () => {
    const deleteFiles = vi.fn().mockResolvedValue(undefined);
    await deleteEventAssets({ deleteFiles }, 'abc');
    expect(deleteFiles).toHaveBeenCalledTimes(2);
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'events/abc/', force: true });
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'event-descriptions/abc/', force: true });
  });
});
