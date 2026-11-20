# GitHub Pages

Per publicar la web via Actions (alternativa al [hosting compartit](SHARED_HOSTING.md)):

1. **Settings → Pages**
2. A **Build and deployment → Source**, tria **GitHub Actions**
3. **Settings → Secrets** → afegeix `BICING_TOKEN` (opcional; sense token usa GBFS)
4. Ves a **Actions → Bicing** (o Deploy GitHub Pages) → **Run workflow** si cal

URL final: https://oscarsanchezdm.github.io/on-son-les-bicis/

El `base` de Vite per defecte és `/on-son-les-bicis/` (adequat a GitHub Pages). En un domini propi usa `npm run build:root`.
