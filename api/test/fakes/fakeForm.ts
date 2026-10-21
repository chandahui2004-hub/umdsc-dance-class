import { FormPort, FormInstancePort, FormQuestionPort } from '../../src/ports';

export class FakeFormInstance implements FormInstancePort {
  id: string;
  accepting: boolean = true;
  closedMessage: string = '';
  questions: Map<string, FormQuestionPort> = new Map();

  constructor(id: string) {
    this.id = id;
  }

  getId(): string {
    return this.id;
  }

  isAcceptingResponses(): boolean {
    return this.accepting;
  }

  setAcceptingResponses(enabled: boolean): void {
    this.accepting = enabled;
  }

  setCustomClosedFormMessage(message: string): void {
    this.closedMessage = message;
  }

  getCustomClosedFormMessage(): string {
    return this.closedMessage;
  }

  addQuestion(q: FormQuestionPort): void {
    this.questions.set(q.id, { ...q, choices: [...q.choices] });
  }

  getStyleQuestion(searchKeywords: string[] = ['class', 'style', 'dance', 'workshop']): FormQuestionPort | null {
    for (const q of this.questions.values()) {
      const lower = q.title.toLowerCase();
      if (searchKeywords.some(kw => lower.includes(kw))) {
        return { ...q, choices: [...q.choices] };
      }
    }
    // Fallback: return the first question with choices if any
    for (const q of this.questions.values()) {
      if (q.choices && q.choices.length > 0) {
        return { ...q, choices: [...q.choices] };
      }
    }
    return null;
  }

  setChoices(questionId: string, choices: string[], helpText?: string): void {
    const q = this.questions.get(questionId);
    if (q) {
      q.choices = [...choices];
      if (helpText !== undefined) {
        q.helpText = helpText;
      }
    }
  }
}

export class FakeFormPort implements FormPort {
  forms: Map<string, FakeFormInstance> = new Map();
  sheetFormUrls: Map<string, string> = new Map();

  setLinkedForm(spreadsheetId: string, formUrl: string): void {
    this.sheetFormUrls.set(spreadsheetId, formUrl);
  }

  createForm(id: string): FakeFormInstance {
    const form = new FakeFormInstance(id);
    this.forms.set(id, form);
    return form;
  }

  getFormUrl(spreadsheetId: string): string | null {
    return this.sheetFormUrls.get(spreadsheetId) || null;
  }

  openForm(idOrUrl: string): FormInstancePort | null {
    if (!idOrUrl) return null;
    for (const [id, form] of this.forms.entries()) {
      if (id === idOrUrl || idOrUrl.includes(id)) {
        return form;
      }
    }
    return null;
  }
}
