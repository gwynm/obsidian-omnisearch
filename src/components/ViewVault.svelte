<script lang="ts">
  import { MarkdownView, Notice, TFile } from 'obsidian'
  import { onDestroy, onMount, tick } from 'svelte'
  import InputSearch from './InputSearch.svelte'
  import ModalContainer from './ModalContainer.svelte'
  import { eventBus, EventNames, indexingStep, IndexingStepType, type ResultNote, } from 'src/globals'
  import { createNote, openNote } from 'src/tools/notes'
  import { getCtrlKeyLabel, getExtension, isFilePDF, loopIndex, } from 'src/tools/utils'
  import { OmnisearchInFileModal, type OmnisearchVaultModal, } from 'src/components/modals'
  import ResultItemVault from './ResultItemVault.svelte'
  import { Query } from 'src/search/query'
  import { settings, sortByDate } from '../settings'
  import * as NotesIndex from '../notes-index'
  import { cacheManager } from '../cache-manager'
  import { searchEngine } from 'src/search/omnisearch'

  export let previousQuery: string | undefined
  let selectedIndex = 0
  let historySearchIndex = 0
  let searchQuery: string | undefined
  let resultNotes: ResultNote[] = []
  let query: Query
  let indexingStepDesc = ''
  let searching = true

  $: selectedNote = resultNotes[selectedIndex]
  $: searchQuery = searchQuery ?? previousQuery
  $: {
    resultNotes = []
    searching = true
    updateResults(searchQuery).then(() => {
      searching = false
    })
  }
  $: {
    switch ($indexingStep) {
      case IndexingStepType.LoadingCache:
        indexingStepDesc = 'Loading cache...'
        break
      case IndexingStepType.ReadingFiles:
        indexingStepDesc = 'Reading files...'
        break
      case IndexingStepType.IndexingFiles:
        indexingStepDesc = 'Indexing files...'
        break
      case IndexingStepType.WritingCache:
        updateResults(searchQuery)
        indexingStepDesc = 'Updating cache...'
        break
      default:
        updateResults(searchQuery)
        indexingStepDesc = ''
        break
    }
  }

  onMount(async () => {
    eventBus.enable('vault')
    eventBus.on('vault', 'enter', openNoteAndCloseModal)
    eventBus.on('vault', 'create-note', createNoteAndCloseModal)
    eventBus.on('vault', 'open-in-new-pane', openNoteInNewPane)
    eventBus.on('vault', 'insert-link', insertLink)
    eventBus.on('vault', 'tab', switchToInFileModal)
    eventBus.on('vault', 'arrow-up', () => moveIndex(-1))
    eventBus.on('vault', 'arrow-down', () => moveIndex(1))
    eventBus.on('vault', 'prev-search-history', prevSearchHistory)
    eventBus.on('vault', 'next-search-history', nextSearchHistory)
    eventBus.on('vault', EventNames.ToggleSort, () => updateResults(searchQuery));
    eventBus.on('vault', 'refresh', () => updateResults(searchQuery));

    await NotesIndex.refreshIndex()
    if (settings.showPreviousQueryResults) {
      previousQuery = (await cacheManager.getSearchHistory())[0]
    }
  })

  onDestroy(() => {
    eventBus.disable('vault')
  })

  async function prevSearchHistory() {
    // Filter out the empty string, if it's there
    const history = (await cacheManager.getSearchHistory()).filter(s => s)
    if (++historySearchIndex >= history.length) {
      historySearchIndex = 0
    }
    previousQuery = history[historySearchIndex]
  }

  export function focusSearch() {
    const el = document.querySelector('.omnisearch-input-field input') as HTMLInputElement;
    el.focus();
    el.select();
  }

  async function nextSearchHistory() {
    const history = (await cacheManager.getSearchHistory()).filter(s => s)
    if (--historySearchIndex < 0) {
      historySearchIndex = history.length ? history.length - 1 : 0
    }
    previousQuery = history[historySearchIndex]
  }

  async function updateResults(q) {
    query = new Query(q || '')
    resultNotes = (await searchEngine.getSuggestions(query)).sort(
      (a, b) => b.score - a.score
    )
    selectedIndex = 0
    if (resultNotes.length > 0) {
      // openSearchResult(resultNotes[selectedIndex]) // When results change, move to top of list and open it
      await scrollIntoView()
    }
  }

  function onClick(evt?: MouseEvent | KeyboardEvent) {
    if (!selectedNote) return
    if (evt?.ctrlKey) {
      openNoteInNewPane()
    } else {
      openNoteAndCloseModal()
    }
  }

  function openNoteAndCloseModal(): void {
    if (!selectedNote) return
    openSearchResult(selectedNote)
  }

  function openNoteInNewPane(): void {
    if (!selectedNote) return
    openSearchResult(selectedNote, true)
  }

  function saveCurrentQuery() {
    if (searchQuery) {
      cacheManager.addToSearchHistory(searchQuery)
    }
  }

  function openSearchResult(note: ResultNote, newPane = false) {
    saveCurrentQuery()
    openNote(note, newPane)
  }

  async function onClickCreateNote(_e: MouseEvent) {
    await createNoteAndCloseModal()
  }

  async function createNoteAndCloseModal(opt?: {
    newLeaf: boolean
  }): Promise<void> {
    if (searchQuery) {
      try {
        await createNote(searchQuery, opt?.newLeaf)
      } catch (e) {
        new Notice((e as Error).message)
        return
      }
    }
  }

  function insertLink(): void {
    if (!selectedNote) return
    const file = app.vault
      .getMarkdownFiles()
      .find(f => f.path === selectedNote.path)
    const active = app.workspace.getActiveFile()
    const view = app.workspace.getActiveViewOfType(MarkdownView)
    if (!view?.editor) {
      new Notice('Omnisearch - Error - No active editor', 3000)
      return
    }

    // Generate link
    let link: string
    if (file && active) {
      link = app.fileManager.generateMarkdownLink(file, active.path)
    } else {
      link = `[[${selectedNote.basename}.${getExtension(selectedNote.path)}]]`
    }

    // Inject link
    const cursor = view.editor.getCursor()
    view.editor.replaceRange(link, cursor, cursor)
    cursor.ch += link.length
    view.editor.setCursor(cursor)

  }

  function switchToInFileModal(): void {
    // Do nothing if the selectedNote is a PDF,
    // or if there is 0 match (e.g indexing in progress)
    if (selectedNote && (isFilePDF(selectedNote?.path) || !selectedNote?.matches.length)) {
      return
    }

    saveCurrentQuery()

    if (selectedNote) {
      // Open in-file modal for selected search result
      const file = app.vault.getAbstractFileByPath(selectedNote.path)
      if (file && file instanceof TFile) {
        new OmnisearchInFileModal(app, file, searchQuery).open()
      }
    } else {
      // Open in-file modal for active file
      const view = app.workspace.getActiveViewOfType(MarkdownView)
      if (view) {
        new OmnisearchInFileModal(app, view.file, searchQuery).open()
      }
    }
  }

  function moveIndex(dir: 1 | -1): void {
    selectedIndex = loopIndex(selectedIndex + dir, resultNotes.length)
    scrollIntoView()
    openSearchResult(resultNotes[selectedIndex])
  }

  async function scrollIntoView(): Promise<void> {
    await tick()
    if (selectedNote) {
      const elem = document.querySelector(
        `[data-result-id="${selectedNote.path}"]`
      )
      elem?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    }
  }
</script>

<div style='display:flex;height:100%;flex-direction:column'>
  <div style='flex:0 0'>
    <InputSearch
      initialValue="{searchQuery}"
      on:input="{e => (searchQuery = e.detail)}"
      placeholder="Omnisearch - Vault">
      {#if settings.showCreateButton}
        <button on:click="{onClickCreateNote}">Create note</button>
      {/if}
    </InputSearch>

    {#if indexingStepDesc}
      <div style="text-align: center; color: var(--text-accent); margin-top: 10px">
        ⏳ Work in progress: {indexingStepDesc}
      </div>
    {/if}
  </div>
  <div style='flex:1 0;overflow:auto'>
    <ModalContainer>
      {#each resultNotes as result, i}
        <ResultItemVault
          selected="{i === selectedIndex}"
          note="{result}"
          on:mousemove="{_ => (selectedIndex = i)}"
          on:click="{onClick}" />
      {/each}
      <div style="text-align: center;">
        {#if !resultNotes.length && searchQuery && !searching}
          No results.
        {:else if searching}
          Searching...
        {/if}
      </div>
    </ModalContainer>

    <div class="prompt-instructions">
      <div class="prompt-instruction">
        <span class="prompt-instruction-command">ctrl+j / ctrl+k</span><span>to navigate</span>
      </div>
      <div class="prompt-instruction">
        <span class="prompt-instruction-command">ctrl ↵</span>
        <span>create</span>
      </div>
      <div class="prompt-instruction">
        <span class="prompt-instruction-command">ctrl+h</span>
        <span>toggle excerpts</span>
      </div>
      <div class="prompt-instruction">
        <span class="prompt-instruction-command">ctrl+d</span>
        <span>delete</span>
      </div>
      <div class="prompt-instruction">
        <span class="prompt-instruction-command">ctrl+g</span>
        <span>
          {#if $sortByDate}
            switch to relevance
          {:else}
            switch to date
          {/if}
        </span>
      </div>
    </div>
  </div>
</div>
