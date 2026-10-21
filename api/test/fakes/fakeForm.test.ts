import { describe, it, expect } from 'vitest';
import { FakeFormPort } from './fakeForm';

describe('FakeFormPort and FakeFormInstance', () => {
  it('creates form, manages questions, choices, and accepting state', () => {
    const port = new FakeFormPort();
    const form = port.createForm('form_123');

    form.addQuestion({
      id: 'q1',
      title: 'Which dance class / style are you registering for?',
      choices: ['Hip Hop', 'Popping', 'Locking', 'Latin'],
      helpText: 'Select one or more styles'
    });

    port.setLinkedForm('sheet_abc', 'https://docs.google.com/forms/d/form_123/edit');

    expect(port.getFormUrl('sheet_abc')).toBe('https://docs.google.com/forms/d/form_123/edit');
    expect(port.getFormUrl('nonexistent')).toBeNull();

    const opened = port.openForm('https://docs.google.com/forms/d/form_123/edit');
    expect(opened).not.toBeNull();
    expect(opened!.getId()).toBe('form_123');
    expect(opened!.isAcceptingResponses()).toBe(true);

    const styleQ = opened!.getStyleQuestion();
    expect(styleQ).not.toBeNull();
    expect(styleQ!.choices).toEqual(['Hip Hop', 'Popping', 'Locking', 'Latin']);

    // Remove full choice and set warning
    opened!.setChoices(styleQ!.id, ['Popping', 'Locking', 'Latin'], '⚠️ Note: [Hip Hop] is full.');

    const updatedQ = opened!.getStyleQuestion();
    expect(updatedQ!.choices).toEqual(['Popping', 'Locking', 'Latin']);
    expect(updatedQ!.helpText).toBe('⚠️ Note: [Hip Hop] is full.');

    // Close form on full house
    opened!.setAcceptingResponses(false);
    opened!.setCustomClosedFormMessage('Sorry, we have reached FULL HOUSE!');

    expect(opened!.isAcceptingResponses()).toBe(false);
    expect(opened!.getCustomClosedFormMessage()).toBe('Sorry, we have reached FULL HOUSE!');
  });
});
