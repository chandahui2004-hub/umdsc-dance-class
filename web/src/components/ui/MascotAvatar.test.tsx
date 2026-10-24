// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MascotAvatar } from './MascotAvatar';

describe('MascotAvatar', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders with idle animation by default', () => {
    render(<MascotAvatar />);
    const avatar = screen.getByTestId('mascot-avatar');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('data-animation', 'idle');
    expect(avatar).toHaveAttribute('data-testid', 'mascot-avatar');
  });

  it('switches animation to dance routine when prop changes', () => {
    const { rerender } = render(<MascotAvatar animation="dance_1" />);
    expect(screen.getByTestId('mascot-avatar')).toHaveAttribute('data-animation', 'dance_1');

    rerender(<MascotAvatar animation="dance_2" />);
    expect(screen.getByTestId('mascot-avatar')).toHaveAttribute('data-animation', 'dance_2');

    rerender(<MascotAvatar animation="dance_3" />);
    expect(screen.getByTestId('mascot-avatar')).toHaveAttribute('data-animation', 'dance_3');
  });

  it('renders unread count badge when alertCount > 0', () => {
    render(<MascotAvatar alertCount={5} />);
    const badge = screen.getByTestId('mascot-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('5');
  });

  it('does not render badge when alertCount is 0 or undefined', () => {
    const { rerender } = render(<MascotAvatar alertCount={0} />);
    expect(screen.queryByTestId('mascot-badge')).not.toBeInTheDocument();

    rerender(<MascotAvatar />);
    expect(screen.queryByTestId('mascot-badge')).not.toBeInTheDocument();
  });

  it('caps unread badge count at 99+', () => {
    render(<MascotAvatar alertCount={120} />);
    expect(screen.getByTestId('mascot-badge')).toHaveTextContent('99+');
  });

  it('applies error styling when hasErrors is true', () => {
    render(<MascotAvatar alertCount={2} hasErrors />);
    const badge = screen.getByTestId('mascot-badge');
    expect(badge.className).toContain('bg-[var(--neon-red)]');

    const shadow = screen.getByTestId('mascot-ground-shadow');
    expect(shadow.className).toContain('border-[var(--neon-red)]');
  });
});
