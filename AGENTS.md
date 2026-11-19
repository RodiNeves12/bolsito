# AGENTS.md — Regras do Projeto Bolsito (Finanças Pessoais + Passagens)

Este projeto é um aplicativo web **100% offline-first** em HTML5, CSS3 e JavaScript ES Modules nativo (sem frameworks, sem bundler e sem dependências externas), combinando finanças pessoais (`Dashboard`, `Despesas & Rendas`, `Caixinhas CDI`) com o módulo completo de `Passagens`. Siga rigorosamente este checklist em toda alteração futura.

---

## Checklist Obrigatório de Execução

1. **Ler `DESIGN_SYSTEM.md` antes de qualquer alteração de UI**
   - Consultar os tokens CSS, tipografia, componentes e anti-padrões documentados em `DESIGN_SYSTEM.md` antes de criar ou editar qualquer tela.

2. **Reutilizar classes e variáveis CSS existentes**
   - Não criar estilos duplicados quando já existir um padrão em `css/styles.css` (`.card`, `.btn-*`, `.pill-*`, `.pill-toggle`, `.switch`, `.theme-segmented`, `.mode-group`, `.stacked-form`, `.data-table`, `.modal-*`, `.finance-row`, `.donut-layout`, `.css-bar-chart`).
   - Nunca usar cores hex/rgb hardcoded em novos componentes; usar exclusivamente as variáveis CSS (`var(--bg-surface)`, `var(--accent)`, `var(--cat-*)`, `var(--border)`, etc.).
   - Usar apenas pesos de fonte nativos (`400`, `500`, `600`, `700`) e ícones SVG inline estilo Lucide (`stroke-width="1.75"`), nunca emojis.

3. **Garantir compatibilidade visual completa (Tema × Paleta × Privacidade × Responsivo)**
   - Toda nova UI deve funcionar com contraste legível em:
     - `data-theme="light"` e `data-theme="dark"`;
     - todas as 5 paletas (`floresta`, `editorial`, `ardosia`, `cafe`, `ameixa`);
     - `data-privacy="on"` (todos os valores monetários com `.money` ou `.privacy-mask` borrados);
     - desktop (`>= 960px`, sidebar fixa de `230px` agrupada em `FINANCEIRO`, `TRANSPORTE`, `SISTEMA`) e mobile (`< 960px`, header sticky + *bottom nav* fixa de 5 alvos `>= 44px` + *sheet* `Mais`).
   - Se adicionar uma nova visão de navegação, atualizar `VIEW_HEADERS` em `js/ui.js` com o kicker numerado (`0X / ...`) e o título correspondente.

4. **Preservar hooks do DOM e arquitetura de módulos**
   - Antes de editar `index.html`, mapear todos os `id`, `data-*` e classes dinâmicas consumidas por `js/app.js`, `js/ui.js` e `js/financeUI.js`.
   - Manter a separação de responsabilidades:
     - cálculos puros em `js/calculator.js` (Passagens), `js/holidays.js` (Feriados RJ/Brasil + dias úteis nacionais CDI), `js/financeEngine.js` (orçamento mensal e 12m integrando Passagens em modo somente-leitura) e `js/cdiEngine.js` (rendimento composto CDI em 252 d.u./ano);
     - persistência, migração `v1 -> v2` e validação em `js/state.js`;
     - renderização em `js/ui.js` (Passagens + tema/privacidade/config) e `js/financeUI.js` (Dashboard, Fluxo Mensal, Caixinhas CDI e modais financeiros);
     - coordenação de eventos e atalhos (`P`, `N`, `Escape`) em `js/app.js`.
   - Nunca usar valores de ponto flutuante para moeda armazenada: todos os campos monetários devem permanecer em centavos inteiros.

5. **Manter 100% offline-first e atualizar o Service Worker (`sw.js`)**
   - Proibido introduzir CDNs ou dependências remotas (fontes, ícones, bibliotecas).
   - Sempre que adicionar, renomear ou modificar arquivos estáticos (HTML, CSS, JS, fontes, ícones, `manifest.json`), atualizar o array `STATIC_ASSETS` (se houver arquivo novo) e **incrementar `CACHE_NAME`** em `sw.js` (ex.: `bolsito-cache-v6` → `v7`).

6. **Preservar retrocompatibilidade com `localStorage` e Backup JSON (`v1` e `v2`)**
   - A chave de armazenamento é `calc_passagens_v1` (`js/state.js`, `SCHEMA_VERSION = 2`).
   - Ao adicionar novos campos ao estado em `createDefaultState()` / `createDefaultFinanceState()`, incluir validação com **fallback seguro** em `validateAndSanitizeState(raw)` para que dados `v1`/`v2` já salvos no navegador e arquivos `.json` de backups antigos continuem importando sem erro nem perda de dados.

7. **Verificação antes de concluir**
   - Validar sintaxe dos módulos JS e do `sw.js` (`node --check`).
   - Confirmar que todos os arquivos listados em `STATIC_ASSETS` no `sw.js` existem no disco e que nenhum `id`/`data-*` esperado pelo JS foi removido de `index.html`.
