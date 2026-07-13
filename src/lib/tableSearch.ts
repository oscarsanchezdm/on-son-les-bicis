export type TableSearchState = {
  query: string;
  open: boolean;
  placeholder: string;
};

export type TableSearchHandlers = {
  onQueryChange: (query: string) => void;
  onToggle: () => void;
};

export function tableSearchIconHtml(): string {
  return `<svg class="table-search-toggle__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
}

export function mountTableSearch(host: HTMLElement, handlers: TableSearchHandlers): void {
  if (host.dataset.mounted === "1") return;

  host.innerHTML = `
    <div class="table-search-toolbar">
      <button type="button" class="table-search-toggle" aria-label="Cercar" aria-expanded="false">
        ${tableSearchIconHtml()}
      </button>
      <input type="search" class="table-search__input" autocomplete="off" spellcheck="false" />
    </div>`;

  const toggle = host.querySelector<HTMLButtonElement>(".table-search-toggle")!;
  const input = host.querySelector<HTMLInputElement>(".table-search__input")!;

  toggle.addEventListener("click", () => {
    handlers.onToggle();
    if (host.querySelector(".table-search-toolbar")?.classList.contains("is-open")) {
      input.focus();
    }
  });

  input.addEventListener("input", () => handlers.onQueryChange(input.value));

  host.dataset.mounted = "1";
}

export function syncTableSearch(host: HTMLElement, state: TableSearchState, forceValue = false): void {
  const toolbar = host.querySelector<HTMLElement>(".table-search-toolbar");
  const input = host.querySelector<HTMLInputElement>(".table-search__input");
  const toggle = host.querySelector<HTMLButtonElement>(".table-search-toggle");
  if (!toolbar || !input || !toggle) return;

  const isOpen = state.open || state.query.trim().length > 0;
  toolbar.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  input.placeholder = state.placeholder;

  if (forceValue || document.activeElement !== input) {
    input.value = state.query;
  }
}
