import { FormPort, FormInstancePort, FormQuestionPort } from '../ports';

export class GasFormInstance implements FormInstancePort {
  private form: GoogleAppsScript.Forms.Form;

  constructor(form: GoogleAppsScript.Forms.Form) {
    this.form = form;
  }

  getId(): string {
    return this.form.getId();
  }

  isAcceptingResponses(): boolean {
    return this.form.isAcceptingResponses();
  }

  setAcceptingResponses(enabled: boolean): void {
    this.form.setAcceptingResponses(enabled);
  }

  setCustomClosedFormMessage(message: string): void {
    this.form.setCustomClosedFormMessage(message);
  }

  getCustomClosedFormMessage(): string {
    return this.form.getCustomClosedFormMessage();
  }

  getStyleQuestion(searchKeywords: string[] = ['class', 'style', 'dance', 'workshop']): FormQuestionPort | null {
    const items = this.form.getItems();
    const danceTerms = [
      'hip hop', 'hiphop', 'popping', 'pop', 'locking', 'lock', 'choreo',
      'choreography', 'kpop', 'k-pop', 'waacking', 'breaking', 'bboy',
      'urban', 'latin', 'ballroom', 'salsa', 'bachata', 'open choreo', 'girls'
    ];

    let bestCandidate: { id: string; title: string; choices: string[]; helpText: string; score: number } | null = null;

    for (const item of items) {
      const type = item.getType();
      let title = '';
      let choices: string[] = [];
      let helpText = '';

      if (type === FormApp.ItemType.CHECKBOX) {
        const cb = item.asCheckboxItem();
        title = cb.getTitle();
        choices = cb.getChoices().map(c => c.getValue());
        helpText = cb.getHelpText();
      } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
        const mc = item.asMultipleChoiceItem();
        title = mc.getTitle();
        choices = mc.getChoices().map(c => c.getValue());
        helpText = mc.getHelpText();
      } else {
        continue;
      }

      if (choices.length === 0) continue;

      const titleLower = title.toLowerCase();
      let score = 0;

      // Title matches keywords
      if (searchKeywords.some(kw => titleLower.includes(kw))) {
        score += 15;
      }

      // Choices match dance terminology
      const choicesLower = choices.map(c => c.toLowerCase());
      for (const term of danceTerms) {
        if (choicesLower.some(c => c === term || c.includes(term))) {
          score += 10;
        }
      }

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { id: String(item.getId()), title, choices, helpText, score };
      }
    }

    if (bestCandidate && bestCandidate.score > 0) {
      return {
        id: bestCandidate.id,
        title: bestCandidate.title,
        choices: bestCandidate.choices,
        helpText: bestCandidate.helpText
      };
    }

    return null;
  }

  setChoices(questionId: string, choices: string[], helpText?: string): void {
    const items = this.form.getItems();
    for (const item of items) {
      if (String(item.getId()) === questionId) {
        const type = item.getType();
        if (type === FormApp.ItemType.CHECKBOX) {
          const cb = item.asCheckboxItem();
          if (choices.length > 0) {
            cb.setChoiceValues(choices);
          }
          if (helpText !== undefined) {
            cb.setHelpText(helpText);
          }
        } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
          const mc = item.asMultipleChoiceItem();
          if (choices.length > 0) {
            mc.setChoiceValues(choices);
          }
          if (helpText !== undefined) {
            mc.setHelpText(helpText);
          }
        }
        break;
      }
    }
  }
}

export class GasFormAdapter implements FormPort {
  getFormUrl(spreadsheetId: string): string | null {
    try {
      if (typeof SpreadsheetApp === 'undefined') return null;
      const ss = SpreadsheetApp.openById(spreadsheetId);
      return ss.getFormUrl();
    } catch (err) {
      console.warn(`[GasFormAdapter] Failed to get form URL for spreadsheet ${spreadsheetId}:`, err);
      return null;
    }
  }

  openForm(idOrUrl: string): FormInstancePort | null {
    try {
      if (typeof FormApp === 'undefined') return null;
      let form: GoogleAppsScript.Forms.Form | null = null;
      // Extract form ID from URL if provided (handles edit links, view links, etc.)
      const match = idOrUrl.match(/\/forms\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
      const formId = match ? match[1] : idOrUrl;
      try {
        form = FormApp.openById(formId);
      } catch (idErr) {
        if (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) {
          form = FormApp.openByUrl(idOrUrl);
        } else {
          throw idErr;
        }
      }
      return form ? new GasFormInstance(form) : null;
    } catch (err) {
      console.warn(`[GasFormAdapter] Failed to open form ${idOrUrl}:`, err);
      return null;
    }
  }
}
