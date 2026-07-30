import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfilePhotoUpload from '../../src/components/ProfilePhotoUpload';

vi.mock('../../src/lib/imageUpload', async () => {
  const actual = await vi.importActual('../../src/lib/imageUpload');
  return {
    ...actual,
    uploadProfileImage: vi.fn(),
    MAX_INPUT_SIZE_BYTES: 15 * 1024 * 1024,
  };
});

import { uploadProfileImage } from '../../src/lib/imageUpload';

describe('ProfilePhotoUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an icon placeholder when no photoURL is provided', () => {
    const { container } = render(
      <ProfilePhotoUpload uid="user-1" photoURL={null} onUploaded={vi.fn()} />
    );

    const preview = container.querySelector('.profile-photo-preview');
    expect(preview).toBeInTheDocument();
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the provided photoURL as an image', () => {
    render(
      <ProfilePhotoUpload
        uid="user-1"
        photoURL="https://example.com/avatar.jpg"
        onUploaded={vi.fn()}
      />
    );

    const img = screen.getByAltText('Profilfoto');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('shows a remove button when a photo exists', () => {
    render(
      <ProfilePhotoUpload
        uid="user-1"
        photoURL="https://example.com/avatar.jpg"
        onUploaded={vi.fn()}
      />
    );

    expect(screen.getByTestId('profile-photo-remove')).toBeInTheDocument();
  });

  it('calls onRemoved when the remove button is clicked', () => {
    const onRemoved = vi.fn();
    render(
      <ProfilePhotoUpload
        uid="user-1"
        photoURL="https://example.com/avatar.jpg"
        onUploaded={vi.fn()}
        onRemoved={onRemoved}
      />
    );

    fireEvent.click(screen.getByTestId('profile-photo-remove'));
    expect(onRemoved).toHaveBeenCalled();
  });

  it('rejects unsupported file types', async () => {
    uploadProfileImage.mockResolvedValue('https://example.com/x.jpg');

    render(<ProfilePhotoUpload uid="user-1" photoURL={null} onUploaded={vi.fn()} />);

    const file = new File(['x'], 'test.gif', { type: 'image/gif' });
    const input = screen.getByTestId('profile-photo-input');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('profile-photo-error')).toHaveTextContent(
        /Nur JPEG, PNG und WebP/i
      );
    });
    expect(uploadProfileImage).not.toHaveBeenCalled();
  });

  it('rejects files larger than the upload limit', async () => {
    uploadProfileImage.mockResolvedValue('https://example.com/x.jpg');

    render(<ProfilePhotoUpload uid="user-1" photoURL={null} onUploaded={vi.fn()} />);

    const bigContent = new Uint8Array(16 * 1024 * 1024); // 16MB > 15MB limit
    const file = new File([bigContent], 'big.jpg', { type: 'image/jpeg' });
    const input = screen.getByTestId('profile-photo-input');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('profile-photo-error')).toHaveTextContent(/zu groß/i);
    });
    expect(uploadProfileImage).not.toHaveBeenCalled();
  });

  it('uploads a valid file and notifies the parent', async () => {
    uploadProfileImage.mockResolvedValue('https://example.com/uploaded.jpg');

    const onUploaded = vi.fn();
    render(<ProfilePhotoUpload uid="user-1" photoURL={null} onUploaded={onUploaded} />);

    const file = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });
    const input = screen.getByTestId('profile-photo-input');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadProfileImage).toHaveBeenCalled();
    });
    expect(uploadProfileImage).toHaveBeenCalledWith(
      file,
      'user-1',
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith('https://example.com/uploaded.jpg')
    );
  });

  it('shows an error if upload throws', async () => {
    uploadProfileImage.mockRejectedValue(new Error('boom'));

    render(<ProfilePhotoUpload uid="user-1" photoURL={null} onUploaded={vi.fn()} />);

    const file = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });
    const input = screen.getByTestId('profile-photo-input');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('profile-photo-error')).toHaveTextContent(
        /nicht hochgeladen werden/i
      );
    });
  });
});
