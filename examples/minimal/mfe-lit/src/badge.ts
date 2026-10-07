import { css, html, LitElement } from "lit";

// Plain static properties rather than decorators keeps the example's tsconfig
// free of experimentalDecorators.
export class MfkitLitBadge extends LitElement {
  static override properties = { basePath: { type: String } };
  static override styles = css`
    .lit-card {
      padding: 10px;
      border: 2px dashed #324fff;
      border-radius: 8px;
    }
  `;

  declare basePath: string;

  constructor() {
    super();
    this.basePath = "";
  }

  override render() {
    return html`<div class="lit-card">
      <p>I am a federated Lit MFE mounted at <code>${this.basePath}</code>.</p>
    </div>`;
  }
}

export const TAG = "mfkit-lit-badge";
