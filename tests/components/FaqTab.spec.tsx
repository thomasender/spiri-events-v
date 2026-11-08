import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import FaqTab from '../../src/components/FaqTab';

const mockFaqs = vi.hoisted(() => ({
  faqs: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as string | null,
  canEdit: true,
  args: undefined as unknown,
  addFaq: vi.fn(),
  updateFaq: vi.fn(),
  deleteFaq: vi.fn(),
  reorderFaqs: vi.fn(),
}));

vi.mock('../../src/hooks/useFaqs', () => ({
  useFaqs: (args: unknown) => {
    mockFaqs.args = args;
    return mockFaqs;
  },
}));

vi.mock('../../src/components/RichTextEditorLazy', () => ({
  default: ({
    onChange,
    testId,
    value,
  }: {
    onChange: (v: string) => void;
    testId: string;
    value: string;
  }) => (
    <textarea
      data-testid={testId}
      defaultValue={value}
      onChange={(e) => onChange(e.target.value ? `<p>${e.target.value}</p>` : '')}
    />
  ),
}));

const SEED = [
  {
    id: 'p1',
    question: 'Warum heißt die Plattform „dein tribe“?',
    answerHtml: '<p>Weil wir verbinden.</p>',
    topic: 'Plattform',
    order: 0,
    published: true,
  },
  {
    id: 'p2',
    question: 'Wer steht dahinter?',
    answerHtml: '<p>Ein Verein.</p>',
    topic: 'Plattform',
    order: 100,
    published: false,
  },
  {
    id: 'e1',
    question: 'Wer darf Events eintragen?',
    answerHtml: '<p>Alle.</p>',
    topic: 'Events',
    order: 200,
    published: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFaqs.faqs = SEED;
  mockFaqs.loading = false;
  mockFaqs.error = null;
  mockFaqs.canEdit = true;
  mockFaqs.addFaq.mockResolvedValue('new-id');
  mockFaqs.updateFaq.mockResolvedValue(undefined);
  mockFaqs.deleteFaq.mockResolvedValue(undefined);
  mockFaqs.reorderFaqs.mockResolvedValue(undefined);
});

describe('FaqTab', () => {
  it('loads drafts too and lists entries grouped by topic', () => {
    render(<FaqTab />);
    expect(mockFaqs.args).toEqual({ includeDrafts: true });
    expect(screen.getAllByTestId('faq-tab-group-title').map((h) => h.textContent)).toEqual([
      'Plattform',
      'Events',
    ]);
    const rows = screen.getAllByTestId('faq-tab-row');
    expect(within(rows[1]).getByTestId('faq-tab-row-draft')).toHaveTextContent('Entwurf');
    expect(within(rows[0]).queryByTestId('faq-tab-row-draft')).not.toBeInTheDocument();
  });

  it('shows an empty state', () => {
    mockFaqs.faqs = [];
    render(<FaqTab />);
    expect(screen.getByTestId('faq-tab-empty')).toBeInTheDocument();
  });

  it('creates an entry with the right fields', async () => {
    render(<FaqTab />);
    fireEvent.click(screen.getByTestId('faq-tab-add'));
    fireEvent.change(screen.getByTestId('faq-edit-question'), {
      target: { value: '  Gibt es eine App?  ' },
    });
    fireEvent.change(screen.getByTestId('faq-edit-answer'), { target: { value: 'Ja.' } });
    fireEvent.change(screen.getByTestId('faq-edit-topic'), { target: { value: 'Technik' } });
    fireEvent.click(screen.getByTestId('faq-edit-save'));
    await waitFor(() => expect(mockFaqs.addFaq).toHaveBeenCalledTimes(1));
    expect(mockFaqs.addFaq).toHaveBeenCalledWith({
      question: 'Gibt es eine App?',
      answerHtml: '<p>Ja.</p>',
      topic: 'Technik',
      published: true,
    });
    await waitFor(() => expect(screen.queryByTestId('faq-edit-dialog')).not.toBeInTheDocument());
  });

  it('offers the topics in use as suggestions', () => {
    const { container } = render(<FaqTab />);
    fireEvent.click(screen.getByTestId('faq-tab-add'));
    const options = [...container.querySelectorAll('#faq-topic-suggestions option')].map((o) =>
      o.getAttribute('value')
    );
    expect(options).toEqual(['Events', 'Plattform']);
  });

  it('validates before saving', async () => {
    render(<FaqTab />);
    fireEvent.click(screen.getByTestId('faq-tab-add'));
    fireEvent.click(screen.getByTestId('faq-edit-save'));
    expect(await screen.findByTestId('faq-edit-error')).toHaveTextContent(
      'Bitte gib eine Frage ein.'
    );
    fireEvent.change(screen.getByTestId('faq-edit-question'), { target: { value: 'Frage?' } });
    fireEvent.click(screen.getByTestId('faq-edit-save'));
    expect(await screen.findByTestId('faq-edit-error')).toHaveTextContent(
      'Bitte gib eine Antwort ein.'
    );
    expect(mockFaqs.addFaq).not.toHaveBeenCalled();
  });

  it('edits an entry, including the published switch', async () => {
    render(<FaqTab />);
    fireEvent.click(screen.getAllByTestId('faq-tab-row-edit')[1]);
    expect(screen.getByTestId('faq-edit-question')).toHaveValue('Wer steht dahinter?');
    expect(screen.getByTestId('faq-edit-published')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('faq-edit-published'));
    fireEvent.change(screen.getByTestId('faq-edit-question'), {
      target: { value: 'Wer steht hinter dem tribe?' },
    });
    fireEvent.click(screen.getByTestId('faq-edit-save'));
    await waitFor(() => expect(mockFaqs.updateFaq).toHaveBeenCalledTimes(1));
    expect(mockFaqs.updateFaq).toHaveBeenCalledWith('p2', {
      question: 'Wer steht hinter dem tribe?',
      answerHtml: '<p>Ein Verein.</p>',
      topic: 'Plattform',
      published: true,
    });
  });

  it('shows the save error and keeps the dialog open', async () => {
    mockFaqs.updateFaq.mockRejectedValueOnce(new Error('Keine Berechtigung.'));
    render(<FaqTab />);
    fireEvent.click(screen.getAllByTestId('faq-tab-row-edit')[0]);
    fireEvent.click(screen.getByTestId('faq-edit-save'));
    expect(await screen.findByTestId('faq-edit-error')).toHaveTextContent('Keine Berechtigung.');
    expect(screen.getByTestId('faq-edit-dialog')).toBeInTheDocument();
  });

  it('deletes only after confirming', async () => {
    render(<FaqTab />);
    fireEvent.click(screen.getAllByTestId('faq-tab-row-delete')[2]);
    expect(screen.getByText('Frage löschen?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(mockFaqs.deleteFaq).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByTestId('faq-tab-row-delete')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(mockFaqs.deleteFaq).toHaveBeenCalledWith('e1'));
  });

  it('moves a question inside its topic and a whole topic', async () => {
    render(<FaqTab />);
    const ups = screen.getAllByTestId('faq-tab-row-up');
    expect(ups[0]).toBeDisabled();
    expect(ups[2]).toBeDisabled(); // first of "Events"
    fireEvent.click(ups[1]);
    await waitFor(() => expect(mockFaqs.reorderFaqs).toHaveBeenCalledWith(['p2', 'p1', 'e1']));

    fireEvent.click(screen.getAllByTestId('faq-tab-topic-up')[1]);
    await waitFor(() => expect(mockFaqs.reorderFaqs).toHaveBeenLastCalledWith(['e1', 'p1', 'p2']));
  });

  it('hides all editing controls without rights', () => {
    mockFaqs.canEdit = false;
    render(<FaqTab />);
    expect(screen.queryByTestId('faq-tab-add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('faq-tab-row-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('faq-tab-row-up')).not.toBeInTheDocument();
  });
});
