<div align="center">
  <img src="./assets/banner-bolsito.png" alt="Bolsito — Finanças Pessoais" width="100%" />

  <br />
  <br />

  **Hub pessoal de finanças, reservas em CDI e controle diário de passagens — 100% offline, sem backend e instalável como PWA.**

  <p>
    <a href="https://rodineves12.github.io/bolsito/"><strong>Acessar o Bolsito (GitHub Pages) →</strong></a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/PWA-100%25%20Offline-263529?style=flat-square" alt="PWA 100% Offline" />
    <img src="https://img.shields.io/badge/Stack-HTML%20%E2%80%A2%20CSS%20%E2%80%A2%20ES%20Modules-3D6B4F?style=flat-square" alt="HTML CSS ES Modules" />
    <img src="https://img.shields.io/badge/Dependencies-Zero-B45A2D?style=flat-square" alt="Zero Dependencies" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-6B7280?style=flat-square" alt="Licença MIT" /></a>
  </p>
</div>

---

## Sobre o projeto

O **Bolsito** nasceu como uma calculadora de passagens de transporte e evoluiu para um hub completo de organização financeira pessoal focado em privacidade, velocidade no dia a dia e estética editorial tátil.

Todos os dados ficam salvos localmente no navegador (`localStorage`), sem servidores externos, login ou rastreamento — com exportação e restauração completa em arquivo `.json`.

## Funcionalidades principais

- **Dashboard & Total Líquido Universal:** Visão consolidada do patrimônio real (`Caixinhas + Rendas a Receber − Pendências`), indicadores do mês, distribuição por categoria (Donut SVG), evolução de 12 meses com séries filtráveis e lista de vencimentos acionável.
- **Fluxo Mensal (Despesas & Rendas):** Controle de renda fixa e extras (com status `A receber / Recebida`), contas recorrentes, dívidas/parcelamentos com projeção automática, gastos avulsos com lançamento rápido (`N`) e **Fatura Rápida de Cartão de Crédito** com separação entre *mês equivalente* e *data de vencimento real*.
- **Caixinhas CDI (252 d.u./ano):** Simulação composta por dias úteis reais reutilizando o motor offline de feriados nacionais. Diferencia caixinhas de **Reserva / Meta** e **Conta / Uso Diário** (com botão de ajuste rápido de saldo sem distorcer gráficos de aporte) e projeta rendimentos em 1, 6 e 12 meses.
- **Módulo de Passagens Integrado:** Calendário interativo com histórico de tarifas por vigência, exceções diárias (`Meia`, `Não gastei`, intervalos), feriados offline, projeção de saldo do cartão de transporte e integração automática na categoria `Transporte`.
- **Experiência & Privacidade:** Modo Privacidade instantâneo (atalho `P` ou ícone de olho), 5 paletas de cores desacopladas de Modo Claro/Escuro, fontes locais e backup `.json` com migração automática de schema (`v1 → v2`).

## Como usar

### Online / Instalar no celular (PWA)
1. Acesse **[rodineves12.github.io/bolsito](https://rodineves12.github.io/bolsito/)**.
2. No **Android (Chrome)**, abra o menu (`⋮`) e toque em **Instalar aplicativo**. No **iOS (Safari)**, toque em **Compartilhar → Adicionar à Tela de Início**.
3. Após o primeiro carregamento, o Service Worker armazena todos os assets em cache para uso totalmente offline.

### Rodar localmente
Como o projeto utiliza ES Modules nativos e zero build steps, basta servir a pasta com qualquer servidor estático:

```bash
git clone https://github.com/RodiNeves12/bolsito.git
cd bolsito
npx serve .
# ou: python -m http.server 8000
```

## Arquitetura

| Camada | Implementação |
| :--- | :--- |
| **Interface** | HTML5 semântico + CSS3 com tokens (`data-theme` + `data-palette`) + SVG puro |
| **Lógica** | JavaScript Vanilla modular (ES Modules), sem frameworks nem CDNs |
| **Persistência** | `localStorage` com versionamento de schema e backup/restore `.json` |
| **Offline** | Service Worker (`sw.js`) com pré-cache de assets e fontes locais |

## Desenvolvimento guiado por especificação e IA

O Bolsito foi desenvolvido em um fluxo iterativo e **spec-driven assistido por IA**, combinando definição de regras de negócio, auditorias visuais sucessivas (desktop e mobile) e documentação viva versionada no próprio repositório:

- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) — Especificação dos tokens de cor, tipografia, grid, componentes reutilizáveis e anti-padrões proibidos.
- [`AGENTS.md`](./AGENTS.md) — Diretrizes operacionais e checklists técnicos (preservação de hooks JS, compatibilidade de temas, migração de dados e versionamento de cache) para manter consistência em futuras evoluções.

## Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](./LICENSE) para mais detalhes.