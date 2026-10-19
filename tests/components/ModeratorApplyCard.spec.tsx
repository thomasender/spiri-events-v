import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../src/lib/moderatorApplication', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/moderatorApplication')>(
    '../../src/lib/moderatorApplication'
  );
  return { ...actual, sendModeratorApplication: mocks.send };
});
vi.mock('../../src/lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));

import ModeratorApplyCard from '../../src/components/ModeratorApplyCard';
import { validateApplicationForm } from '../../src/lib/moderatorApplication';

beforeEach(() => {
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ sent: true });
});

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Moderator:in werden' }));
const fill = (name: string, email: string, message: string) => {
  fireEvent.change(screen.getByLabelText('Dein Name *'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/Deine E-Mail-Adresse/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Erzähl uns kurz von dir *'), {
    target: { value: message },
  });
};

describe('validateApplicationForm', () => {
  it('needs name, a valid e-mail address and a few lines', () => {
    expect(Object.keys(validateApplicationForm({ name: '', email: 'x', message: 'kurz' }))).toEqual(
      ['name', 'email', 'message']
    );
    expect(
      validateApplicationForm({
        name: 'Ma',
        email: 'ma@x.at',
        message: 'Ich kenne viele Veranstalter in der Region.',
      })
    ).toEqual({});
  });
});

describe('ModeratorApplyCard', () => {
  it('invites with a friendly text and opens the form on demand', () => {
    render(<ModeratorApplyCard />);
    expect(screen.getByText('Du möchtest deine Region mitgestalten?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dein Name *')).not.toBeInTheDocument();
    open();
    expect(screen.getByLabelText('Dein Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Foto (optional)')).toBeInTheDocument();
  });

  it('shows field errors and sends nothing while the form is incomplete', () => {
    render(<ModeratorApplyCard />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Bewerbung senden' }));
    expect(screen.getByText('Bitte gib deinen Namen an.')).toBeInTheDocument();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends name, e-mail, text and the preselected region, then says thanks', async () => {
    render(<ModeratorApplyCard regionId="tirol" />);
    open();
    fill('Maria Muster', 'maria@example.at', 'Ich lebe in Tirol und kenne viele Veranstalter.');
    expect((screen.getByLabelText('Region (optional)') as HTMLSelectElement).value).toBe('tirol');
    fireEvent.click(screen.getByRole('button', { name: 'Bewerbung senden' }));
    await waitFor(() => expect(screen.getByTestId('moderator-apply-sent')).toBeInTheDocument());
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Maria Muster',
        email: 'maria@example.at',
        regionId: 'tirol',
        website: '',
      })
    );
  });

  it('tells the person when sending fails and keeps the form', async () => {
    mocks.send.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ModeratorApplyCard />);
    open();
    fill('Maria Muster', 'maria@example.at', 'Ich lebe in Tirol und kenne viele Veranstalter.');
    fireEvent.click(screen.getByRole('button', { name: 'Bewerbung senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nicht geklappt');
    expect(screen.getByLabelText('Dein Name *')).toHaveValue('Maria Muster');
  });

  it('styles the name input like the other inputs and uses the shared photo upload', () => {
    const { container } = render(<ModeratorApplyCard />);
    open();
    expect(screen.getByLabelText('Dein Name *')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/Deine E-Mail-Adresse/)).toHaveAttribute('type', 'email');
    expect(container.querySelector('[data-testid="helper-photo-upload"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Foto hochladen/ })).toBeInTheDocument();
  });

  it('rejects wrong file types and files over 2 MB, accepts a valid photo', () => {
    render(<ModeratorApplyCard />);
    open();
    const input = screen.getByLabelText('Foto (optional)') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Nur JPEG, PNG und WebP');
    const big = new File(['x'], 'b.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(screen.getByRole('alert')).toHaveTextContent('zu groß');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'c.png', { type: 'image/png' })] },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
