import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FeedbackTab from '../../src/components/FeedbackTab';

const mockItems = vi.hoisted(() => []);
const mockCounts = vi.hoisted(() => ({ total: 0, new: 0, read: 0, archived: 0 }));
const markAsReadMock = vi.fn();
const archiveMock = vi.fn();
const removeMock = vi.fn();

vi.mock('../../src/hooks/useFeedbackList', () => ({
  useFeedbackList: () => ({
    items: mockItems,
    counts: mockCounts,
    loading: false,
    error: null,
    markAsRead: markAsReadMock,
    archive: archiveMock,
    remove: removeMock,
  }),
}));

beforeEach(() => {
  mockItems.length = 0;
  mockCounts.total = 0;
  mockCounts.new = 0;
  mockCounts.read = 0;
  mockCounts.archived = 0;
  markAsReadMock.mockReset();
  archiveMock.mockReset();
  removeMock.mockReset();
  if (!window.confirm) {
    window.confirm = () => true;
  }
});

describe('FeedbackTab', () => {
  it('shows an empty state when there is no feedback', () => {
    render(<FeedbackTab />);
    expect(screen.getByTestId('feedback-tab-empty')).toBeInTheDocument();
    expect(screen.getByText(/Noch kein Feedback/i)).toBeInTheDocument();
  });

  it('renders feedback items with description, name, email and pageUrl', () => {
    const ts = { toDate: () => new Date('2026-08-01T10:00:00Z') };
    mockItems.push({
      id: 'fb-1',
      description: 'Sehr schöne Plattform!',
      name: 'Peter',
      email: 'peter@example.com',
      pageUrl: 'https://events.thetribe.at/',
      pageTitle: 'Tribe Vorarlberg',
      userAgent: 'Mozilla/5.0',
      status: 'new',
      createdAt: ts,
    });

    render(<FeedbackTab />);

    expect(screen.getByTestId('feedback-item')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-item-description')).toHaveTextContent(
      'Sehr schöne Plattform!'
    );
    expect(screen.getByText('Peter')).toBeInTheDocument();
    const emailLink = screen.getByRole('link', { name: 'peter@example.com' });
    expect(emailLink).toHaveAttribute('href', 'mailto:peter@example.com');
  });

  it('marks new feedback as read once it appears', () => {
    mockItems.push({
      id: 'fb-1',
      description: 'Auto-read test',
      status: 'new',
      createdAt: { toDate: () => new Date() },
    });

    render(<FeedbackTab />);
    expect(markAsReadMock).toHaveBeenCalledWith('fb-1');
  });

  it('calls archive when the archive action is clicked', () => {
    mockItems.push({
      id: 'fb-1',
      description: 'archivieren bitte',
      status: 'read',
      createdAt: { toDate: () => new Date() },
    });

    render(<FeedbackTab />);
    fireEvent.click(screen.getByTestId('feedback-archive'));
    expect(archiveMock).toHaveBeenCalledWith('fb-1');
  });

  it('shows a confirmation prompt before deleting', () => {
    const confirmSpy = vi.fn().mockReturnValue(false);
    window.confirm = confirmSpy;
    mockItems.push({
      id: 'fb-1',
      description: 'löschen',
      status: 'read',
      createdAt: { toDate: () => new Date() },
    });

    render(<FeedbackTab />);
    fireEvent.click(screen.getByTestId('feedback-delete'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('deletes feedback when confirm is accepted', () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    window.confirm = confirmSpy;
    mockItems.push({
      id: 'fb-1',
      description: 'löschen',
      status: 'read',
      createdAt: { toDate: () => new Date() },
    });

    render(<FeedbackTab />);
    fireEvent.click(screen.getByTestId('feedback-delete'));

    expect(removeMock).toHaveBeenCalledWith('fb-1');
  });

  it('renders a screenshot link when screenshotUrl is present', () => {
    mockItems.push({
      id: 'fb-1',
      description: 'siehe screenshot',
      status: 'read',
      screenshotUrl: 'https://example.com/feedback/fb-1/screenshot.jpg',
      createdAt: { toDate: () => new Date() },
    });

    render(<FeedbackTab />);
    const link = screen.getByTestId('feedback-screenshot-link');
    expect(link).toHaveAttribute('href', 'https://example.com/feedback/fb-1/screenshot.jpg');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders the summary with counts', () => {
    mockCounts.total = 5;
    mockCounts.new = 2;
    mockCounts.read = 2;
    mockCounts.archived = 1;
    mockItems.push({
      id: 'fb-1',
      description: 'ein feedback',
      status: 'new',
      createdAt: { toDate: () => new Date() },
    });

    render(<FeedbackTab />);
    expect(screen.getByTestId('feedback-tab-summary')).toHaveTextContent('5 Feedback');
    expect(screen.getByTestId('feedback-tab-summary')).toHaveTextContent('2 neu');
  });
});
