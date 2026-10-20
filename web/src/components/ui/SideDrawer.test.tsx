// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SideDrawer } from './SideDrawer';

describe('SideDrawer', () => {
  it('does not render when isOpen is false', () => {
    render(
      <SideDrawer isOpen={false} onClose={vi.fn()} title="Test Drawer">
        <div>Drawer Content</div>
      </SideDrawer>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders at right edge with title and content when isOpen is true', () => {
    render(
      <SideDrawer isOpen={true} onClose={vi.fn()} title="WED 15 OCT 2026" subtitle="2 classes scheduled">
        <div>Class Details Here</div>
      </SideDrawer>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('WED 15 OCT 2026')).toBeInTheDocument();
    expect(screen.getByText('2 classes scheduled')).toBeInTheDocument();
    expect(screen.getByText('Class Details Here')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <SideDrawer isOpen={true} onClose={handleClose} title="Test Drawer">
        <div>Content</div>
      </SideDrawer>
    );

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const handleClose = vi.fn();
    render(
      <SideDrawer isOpen={true} onClose={handleClose} title="Test Drawer">
        <div>Content</div>
      </SideDrawer>
    );

    const backdrop = screen.getByTestId('side-drawer-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <SideDrawer isOpen={true} onClose={handleClose} title="Test Drawer">
        <div>Content</div>
      </SideDrawer>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
