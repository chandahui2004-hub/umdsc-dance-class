import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from './Panel';

const body = () => screen.getByTestId('panel-body');

describe('Panel spacing', () => {
  it('puts a space-y class on the content area, where the fields are, not on the frame', () => {
    const { container } = render(
      <Panel title="EDIT" className="px-corners space-y-5">
        <div>Full name</div>
        <div>Contact</div>
      </Panel>
    );

    expect(body().className).toContain('space-y-5');
    expect((container.firstChild as HTMLElement).className).not.toContain('space-y-5');
  });

  it('spaces the content by default when no spacing is given', () => {
    render(
      <Panel title="FILTER">
        <div>a</div>
        <div>b</div>
      </Panel>
    );

    expect(body().className).toContain('space-y-4');
  });

  it('keeps other classes such as background on the frame', () => {
    const { container } = render(
      <Panel className="bg-[var(--night-2)] sm:space-y-6">
        <div>a</div>
      </Panel>
    );

    expect((container.firstChild as HTMLElement).className).toContain('bg-[var(--night-2)]');
    expect(body().className).toContain('sm:space-y-6');
    expect(body().className).not.toContain('space-y-4');
  });
});
