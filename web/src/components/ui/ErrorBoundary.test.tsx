import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const Broken = () => {
  throw new Error('dayVideos.filter is not a function');
};

describe('ErrorBoundary', () => {
  it('shows a message and a RELOAD button instead of a blank screen when a page crashes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Something went wrong on this page/);
    expect(screen.getByRole('button', { name: /RELOAD/ })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders the page normally when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});
