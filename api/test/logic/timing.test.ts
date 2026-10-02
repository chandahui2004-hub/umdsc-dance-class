import { describe, it, expect } from 'vitest';
import { createTimer } from '../../src/logic/timing';

describe('createTimer', () => {
  it('reports the ms since the previous mark under each label', () => {
    const clock = [0, 5, 12];
    let i = 0;
    const timer = createTimer(() => clock[i++]);

    timer.mark('a');
    timer.mark('b');

    expect(timer.result()).toEqual({ a: 5, b: 7 });
  });

  it('adds up time when a label is marked more than once', () => {
    const clock = [0, 4, 10];
    let i = 0;
    const timer = createTimer(() => clock[i++]);

    timer.mark('sheet');
    timer.mark('sheet');

    expect(timer.result()).toEqual({ sheet: 10 });
  });
});
