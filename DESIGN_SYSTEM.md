# Design System — Bolsito (Finanças Pessoais)

Guia técnico de referência baseado nos tokens, classes e padrões ativos em `css/styles.css`, `index.html`, `js/ui.js` e `js/financeUI.js`. Qualquer nova tela ou componente deve seguir este contrato.

---

## 1. Arquitetura de Temas (`data-theme` × `data-palette` × `data-privacy`)

Luminosidade, paleta e privacidade são **desacopladas** no elemento `<html>` e aplicadas por `applyTheme(themePref, palettePref)` e `applyPrivacyMode(enabled)` em `js/ui.js`:

- `data-theme`: `"light"` | `"dark"` (persistido em `appState.theme` como `'auto' | 'light' | 'dark'`).
- `data-palette`: `"floresta"` (padrão) | `"editorial"` | `"ardosia"` | `"cafe"` | `"ameixa"` (persistido em `appState.palette` e validado por `VALID_PALETTES` em `js/state.js`).
- `data-privacy`: `"on"` | `"off"` (persistido em `appState.privacyMode`, alternado pelo botão de olho na sidebar ou tecla `P`). Quando `"on"`, aplica `filter: blur(7px); user-select: none;` em `.money`, `.day-value`, `.privacy-mask` e inputs monetários desfocados.
- A tag `<meta name="theme-color">` acompanha automaticamente o mapa `PALETTE_THEME_COLORS[palette][effectiveTheme]`.

> **Regra estrita:** Nunca use cores hex/rgb hardcoded em novos componentes ou estilos inline (exceção única: swatches estáticos de prévia no seletor `.palette-swatches`). Use sempre as variáveis CSS abaixo.

### Variáveis CSS Disponíveis (`css/styles.css`)

| Categoria | Variáveis |
| :--- | :--- |
| **Superfícies** | `--bg-app`, `--bg-surface`, `--bg-sub`, `--bg-hover`, `--bg-input`, `--bg-input-elevated` |
| **Sidebar** | `--sidebar-bg`, `--sidebar-border`, `--sidebar-text`, `--sidebar-text-muted`, `--sidebar-hover`, `--sidebar-pill-bg`, `--sidebar-pill-text`, `--sidebar-width` (`230px`) |
| **Bordas & Foco** | `--border`, `--border-strong`, `--border-dashed`, `--focus-ring` |
| **Tipografia** | `--text-primary`, `--text-secondary`, `--text-muted`, `--font-serif`, `--font-sans` |
| **CTA Primário** | `--cta-bg`, `--cta-hover`, `--cta-text` |
| **Destaque / Accent** | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-border`, `--accent-text`, `--accent-contrast` |
| **Semântica** | `--success` (`-soft`, `-border`, `-text`), `--warning` (`-soft`, `-border`, `-text`), `--danger` (`-hover`, `-soft`, `-border`, `-text`), `--holiday` (`-soft`, `-border`, `-text`), `--custom` (`-soft`, `-border`, `-text`) |
| **Categorias Financeiras** | `--cat-transporte`, `--cat-alimentacao`, `--cat-assinaturas`, `--cat-moradia`, `--cat-lazer`, `--cat-saude`, `--cat-educacao`, `--cat-compras`, `--cat-dividas`, `--cat-outros` (derivadas dinamicamente dos tokens da paleta ativa) |
| **Calendário & Gráfico** | `--day-normal-bg`, `--day-normal-hover`, `--zero-bg`, `--zero-text`, `--range-bg`, `--range-border`, `--chart-predicted` |
| **Sombras & Brilho** | `--shadow-rgb`, `--card-highlight`, `--shadow-xs`, `--shadow-card`, `--shadow-card-hover`, `--shadow-pill-active`, `--shadow-md`, `--shadow-lg` |
| **Raios & Movimento** | `--radius-sm` (`10px`), `--radius-md` (`14px`), `--radius-lg` (`18px`), `--radius-full` (`999px`), `--ease-fluid`, `--dur` (`180ms`) |

---

## 2. Tipografia & Renderização

### Fontes Locais (100% Offline)
Declaradas via `@font-face` com Variable Fonts em `assets/fonts/` (pré-cacheadas no `sw.js`):
- **Títulos editoriais (`--font-serif`):** `Lora` (`lora-latin.woff2`, `lora-latin-ext.woff2`, pesos nativos `500–700`).
- **UI e dados (`--font-sans`):** `Inter` (`inter-latin.woff2`, `inter-latin-ext.woff2`, pesos nativos `400–700`).

### Regras Tipográficas
- **Pesos permitidos:** estritamente `400`, `500`, `600` e `700`. Proibido usar pesos sintéticos (`< 400`, `650`, `750`, `>= 800`).
- **Suavização global:** aplicada em `*, *::before, *::after` (`-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, `text-rendering: optimizeLegibility`).
- **Alinhamento numérico:** aplicar a classe `.money` (`font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1;`) em todo valor monetário, data tabular, contador ou métrica comparativa.
- **Hierarquia:** `.editorial-title` (H1 da visão), `.serif-heading` (`1.38rem`), `.serif-heading-sm` (`1.15rem`), `.micro-label` (`0.6875rem`, uppercase, `letter-spacing: 0.09em`, peso `600`).

---

## 3. Anatomia de Páginas e Componentes Reutilizáveis

### Layout Shell & Cabeçalho Padronizado
- Desktop (`>= 960px`): `.app-shell` com `.app-sidebar` fixa (`230px`), identidade `Bolsito / Finanças Pessoais` com ícone `assets/icon-bolsito.png` (`40×40px`, `border-radius: 10px`, borda `1px solid rgba(255,255,255,0.12)`), navegação agrupada em 3 blocos (`FINANCEIRO`, `TRANSPORTE`, `SISTEMA`) e `.app-content` (`margin-left: var(--sidebar-width)`).
- Mobile (`< 960px`): `.app-sidebar` vira header sticky superior e `.main-nav` vira *bottom nav* fixa de 5 alvos (`Início`, `Fluxo`, `Caixinhas`, `Passagens`, `Mais`) com alvos de toque `>= 44px` (`min-height: 48px`) e *sheet* `.mobile-more-sheet` para as visões secundárias.
- Toda visão em `VIEW_HEADERS` (`js/ui.js`) atualiza o cabeçalho único `.editorial-header` com kicker numerado (`01 / VISÃO GERAL`, `02 / FLUXO MENSAL`, `03 / RESERVAS`, `04 / CONTROLE DIÁRIO`, `05 / PANORAMA ANUAL`, `06 / VIGÊNCIAS`, `07 / CALENDÁRIO OFICIAL`, `08 / SISTEMA`), título serifado e botão global `+ Novo Gasto` (atalho `N`).

```html
<section id="view-exemplo" class="view-section" aria-label="Título da Visão">
  <div class="section-header-bar">
    <p class="section-lead">Descrição curta do objetivo da visão.</p>
    <!-- Controle opcional alinhado à direita (ex.: .year-switcher) -->
  </div>
  <div class="two-col-layout">
    <section class="card">
      <div class="card-header-row">
        <div>
          <span class="micro-label">SEÇÃO</span>
          <h3 class="card-title serif-heading-sm">Título do Card</h3>
        </div>
        <span class="pill pill-info">Status</span>
      </div>
      <!-- Conteúdo -->
    </section>
  </div>
</section>
```

### Bento Grid, Gráficos SVG & Cards
- **Grids existentes:** `.monthly-layout` (`1.68fr / 1fr`), `.two-col-layout` (`1fr / 1fr`), `.dashboard-charts-grid` (`1fr / 1.35fr`), `.annual-kpi-grid` (`4` colunas), `.flow-summary-strip` (`4` colunas), `.balance-metrics-grid` (`3` colunas), `.caixinhas-grid` (`auto-fill minmax(300px, 1fr)`), `.stack-col` (`gap: 18px`).
- **Gráficos 100% offline (SVG / CSS):** Donut SVG (`.donut-layout`, `.donut-segment`), barras agrupadas 12 meses (`.css-bar-chart`, `.bar-trio`, `.bar-tooltip`) e curva/área suave SVG para projeção CDI (`.area-svg`, `.proj-mini-strip`).
- **Superfícies:** `.card` usa `background: var(--bg-surface)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-lg)` e `box-shadow: var(--shadow-card)` (2 camadas tingidas por `--shadow-rgb` + brilho superior `--card-highlight`). Sub-blocos internos usam `background: var(--bg-sub)` sem bordas pesadas.
- **Bilhete de Saldo:** `.card.balance-strip.ticket-card` dividido por `.ticket-perforation` (linha tracejada + recortes semicirculares aparados por `overflow: hidden`), com `.ticket-stub` à esquerda e `.ticket-body` à direita.
- **Linhas financeiras e status:** `.finance-row` (com `.finance-row-auto` para a linha integrada automática de Passagens), `.pending-row` e `.pill-toggle` (`.is-paid` / `.is-pending`).

### Controles Interativos

```html
<!-- Botões -->
<button type="button" class="btn btn-primary">Ação principal</button>
<button type="button" class="btn btn-outline btn-sm">Secundário</button>
<button type="button" class="btn btn-ghost btn-sm">Sutil</button>
<button type="button" class="btn btn-ghost btn-danger-ghost btn-sm">Excluir</button>
<button type="button" class="btn btn-danger">Ação destrutiva</button>

<!-- Segmented Control (.mode-group ou .theme-segmented) -->
<div class="theme-segmented" role="group" aria-label="Opções">
  <button type="button" class="theme-seg-btn is-active" aria-pressed="true">Opção A</button>
  <button type="button" class="theme-seg-btn" aria-pressed="false">Opção B</button>
</div>

<!-- Pills -->
<span class="pill pill-info">Info</span>
<span class="pill pill-success">Positivo</span>
<span class="pill pill-active-fare">Vigente hoje</span>
<span class="pill pill-warning">Alerta</span>
<span class="pill pill-holiday">Feriado</span>
<span class="pill pill-muted">Neutro</span>

<!-- Switch -->
<label class="switch">
  <input type="checkbox" />
  <span class="switch-slider"></span>
</label>
```

### Formulários, Tabelas, Zona de Perigo e Modais
- **Formulários:** `.stacked-form` (`gap: 14px`), `.form-row-2` (2 colunas), `.form-field`, `.input-prefix-group` (com `.input-prefix` para `R$`) e `.form-actions`. Em valores monetários no bilhete, usar `.input-prefix-ticket`.
- **Linhas de dados / métricas:** usar divisórias limpas (`1px solid var(--border)`) como em `.kpi-row`, `.metric-item`, `.holiday-row` e `.setting-row` — sem caixas aninhadas desnecessárias. Barras de progresso finas usam `.progress-track` + `.progress-fill` (`.is-warning` para alerta).
- **Tabelas:** `.card.table-card` > `.table-responsive` > `table.data-table` (colunas numéricas com `.num.money`).
- **Zona de perigo:** `.backup-block.danger-zone.danger-zone-box` (`--danger-soft` + `--danger-border`).
- **Modais:** `.modal-backdrop` (`backdrop-filter: blur(6px)`) > `.modal-dialog` (ou `.modal-sm`) com `.modal-header`, `.modal-body` e `.modal-footer`. Fechamento por backdrop, botão X SVG e tecla `Escape`.
- **Notificações:** `showToast(message, 'default' | 'success' | 'error')` em `#toast-container`.

---

## 4. Fluidez e Micro-interações

- **Curva padrão:** `var(--ease-fluid)` = `cubic-bezier(0.16, 1, 0.3, 1)` com duração base `var(--dur)` = `180ms`.
- **Elevação no hover:** cards interativos (`.annual-kpi-card`, `.balance-metric-tile`, `.palette-card`, `.day-cell`) e `.btn-primary` / `.btn-danger` elevam `transform: translateY(-2px)` com `--shadow-card-hover` / `--shadow-md`.
- **Feedback tátil:** botões e células aplicam `transform: scale(0.98)` no `:active`.
- **Acessibilidade de movimento:** `@media (prefers-reduced-motion: reduce)` zera animações e transições automaticamente.

---

## 5. Anti-padrões Proibidos

1. **Sem emojis na UI:** nunca usar emojis (`🌙`, `☀️`, `📝`, etc.) como ícones. Usar exclusivamente SVGs inline estilo Lucide (`fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`, `stroke-linecap="round"`, `stroke-linejoin="round"`).
2. **Sem CDNs externas:** proibido carregar fontes, ícones ou scripts de URLs externas. Tudo deve ser local e listado em `STATIC_ASSETS` no `sw.js`.
3. **Sem cores hardcoded:** proibido escrever hex/rgb direto em novos componentes ou retornar a tons frios genéricos fora das paletas definidas.
4. **Sem caixas dentro de caixas:** em listas de métricas, configurações e feriados, prefira linhas separadas por `1px solid var(--border)` em vez de cards empilhados dentro de cards.
5. **Sem regressão mobile:** todo controle interativo mobile deve respeitar área de toque `>= 44px`, não pode sobrepor a *bottom nav* e não pode gerar overflow horizontal involuntário.
