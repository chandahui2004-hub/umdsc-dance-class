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
    let bestCandidate: { item: GoogleAppsScript.Forms.Item; choices: string[]; helpText: string } | null = null;

    for (const item of items) {
      const type = item.getType();
      if (type === FormApp.ItemType.CHECKBOX) {
        const cb = item.asCheckboxItem();
        const title = cb.getTitle().toLowerCase();
        const choices = cb.getChoices().map(c => c.getValue());
        const helpText = cb.getHelpText();

        if (searchKeywords.some(kw => title.includes(kw))) {
          return { id: String(item.getId()), title: cb.getTitle(), choices, helpText };
        }
        if (!bestCandidate && choices.length > 0) {
          bestCandidate = { item, choices, helpText };
        }
      } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
        const mc = item.asMultipleChoiceItem();
        const title = mc.getTitle().toLowerCase();
        const choices = mc.getChoices().map(c => c.getValue());
        const helpText = mc.getHelpText();

        if (searchKeywords.some(kw => title.includes(kw))) {
          return { id: String(item.getId()), title: mc.getTitle(), choices, helpText };
        }
        if (!bestCandidate && choices.length > 0) {
          bestCandidate = { item, choices, helpText };
        }
      }
    }

    if (bestCandidate) {
      return {
        id: String(bestCandidate.item.getId()),
        title: bestCandidate.item.getTitle(),
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
      if (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) {
        form = FormApp.openByUrl(idOrUrl);
      } else {
        form = FormApp.openById(idOrUrl);
      }
      return form ? new GasFormInstance(form) : null;
    } catch (err) {
      console.warn(`[GasFormAdapter] Failed to open form ${idOrUrl}:`, err);
      return null;
    }
  }
}
