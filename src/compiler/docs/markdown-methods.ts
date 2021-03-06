import * as d from '../../declarations';
import { getMemberDocumentation } from './docs-util';


export class MarkdownMethods {
  private rows: Row[] = [];

  addRow(memberName: string, memberMeta: d.MemberMeta) {
    this.rows.push(new Row(memberName, memberMeta));
  }

  toMarkdown() {
    const content: string[] = [];
    if (!this.rows.length) {
      return content;
    }

    content.push(`## Methods`);
    content.push(``);

    this.rows = this.rows.sort((a, b) => {
      if (a.memberName < b.memberName) return -1;
      if (a.memberName > b.memberName) return 1;
      return 0;
    });

    this.rows.forEach(row => {
      content.push(...row.toMarkdown());
    });

    return content;
  }
}


class Row {

  constructor(public memberName: string, private memberMeta: d.MemberMeta) {}

  toMarkdown() {
    const content: string[] = [];

    content.push(`#### ${this.memberName}()`);
    content.push(``);

    const doc = getMemberDocumentation(this.memberMeta.jsdoc);
    if (doc) {
      content.push(doc);
      content.push(``);
    }

    content.push(``);

    return content;
  }
}
