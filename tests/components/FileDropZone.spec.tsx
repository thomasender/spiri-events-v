import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FileDropZone from '../../src/components/FileDropZone';

const a = new File(['a'], 'a.pdf', { type: 'application/pdf' });
const b = new File(['b'], 'b.pdf', { type: 'application/pdf' });
const drag = { dataTransfer: { types: ['Files'], files: [a, b] } };

describe('FileDropZone', () => {
  it('passes only the first dropped file unless multiple', () => {
    const onFiles = vi.fn();
    render(<FileDropZone onFiles={onFiles}>zone</FileDropZone>);
    fireEvent.drop(screen.getByText('zone'), drag);
    expect(onFiles).toHaveBeenCalledWith([a]);
  });

  it('passes all files with multiple and highlights while dragging over', () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone multiple onFiles={onFiles}>
        zone
      </FileDropZone>
    );
    const zone = screen.getByText('zone');
    fireEvent.dragOver(zone, drag);
    expect(zone.className).toContain('is-dragover');
    fireEvent.drop(zone, drag);
    expect(zone.className).not.toContain('is-dragover');
    expect(onFiles).toHaveBeenCalledWith([a, b]);
  });

  it('ignores drops while disabled and drags that carry no files', () => {
    const onFiles = vi.fn();
    const { rerender } = render(
      <FileDropZone disabled onFiles={onFiles}>
        zone
      </FileDropZone>
    );
    fireEvent.drop(screen.getByText('zone'), drag);
    rerender(<FileDropZone onFiles={onFiles}>zone</FileDropZone>);
    fireEvent.drop(screen.getByText('zone'), {
      dataTransfer: { types: ['text/plain'], files: [] },
    });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
