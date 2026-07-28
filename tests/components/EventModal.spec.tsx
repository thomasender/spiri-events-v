import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventModal from '../../src/components/EventModal';

const mockEvent = {
  id: '1',
  title: 'Test Event',
  date: '2026-07-15',
  time: '10:00',
  place: 'Test Place',
  bezirk: 'Bregenz',
  contribution: 'free',
  description: 'Test description',
  categories: ['Yoga'],
};

describe('EventModal', () => {
  it('renders event title', () => {
    render(<EventModal event={mockEvent} onClose={() => {}} />);
    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<EventModal event={mockEvent} onClose={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
