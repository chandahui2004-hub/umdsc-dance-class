import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeartsBar } from './HeartsBar';

describe('HeartsBar component', () => {
  it('renders 4 hearts, 3 filled with aria-label "3 of 4 classes attended"', () => {
    render(<HeartsBar attended={3} total={4} />);

    const container = screen.getByLabelText('3 of 4 classes attended');
    expect(container).toBeInTheDocument();

    const filledHearts = container.querySelectorAll('[data-filled="true"]');
    expect(filledHearts.length).toBe(3);

    const emptyHearts = container.querySelectorAll('[data-filled="false"]');
    expect(emptyHearts.length).toBe(1);
  });
});
