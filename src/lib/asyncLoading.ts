/** Petit indicador d'espera per càrregues diferides. */
export function asyncLoadingHtml(className = "async-loading"): string {
  return `<p class="${className}">Carregant dades…</p>`;
}
