import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_OMNISEARCH_VAULT = "omnisearch-vault-view";

export class OmnisearchVaultView extends ItemView {
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
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h4", { text: "Omnisearch Vault View" });
  }

  async onClose() {
  }
}
