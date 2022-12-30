import { ItemView, WorkspaceLeaf } from "obsidian";
import ViewVault from './ViewVault.svelte'

export const VIEW_TYPE_OMNISEARCH_VAULT = "omnisearch-vault-view";

export class OmnisearchVaultView extends ItemView {
  private component: ViewVault | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_OMNISEARCH_VAULT;
  }

  getDisplayText() {
    return "Omnisearch Vault view";
  }

  async onOpen() {
    this.component = new ViewVault({
      target: this.containerEl.children[1],
      props: {
        previousQuery: '',
      },
    })
  }

  focusSearch() {
    if (this.component) {
      this.component.focusSearch();
    }
  }

  async onClose() {
    if (this.component) { this.component.$destroy() };
  }
}
