import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../../src/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders Genehmigt label for approved status', () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByText('Genehmigt')).toBeInTheDocument();
  });

  it('renders Ausstehend label for pending status', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('Ausstehend')).toBeInTheDocument();
  });

  it('renders Entwurf label for draft status', () => {
    render(<StatusBadge status="draft" />);
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
  });

  it('applies draft modifier class for draft status', () => {
    const { container } = render(<StatusBadge status="draft" />);
    expect(container.querySelector('.status-badge--draft')).toBeInTheDocument();
  });

  it('falls back to pending label for unknown status', () => {
    render(<StatusBadge status="something-else" />);
    expect(screen.getByText('Ausstehend')).toBeInTheDocument();
  });
});
