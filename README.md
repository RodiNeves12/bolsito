<div align="center">
  <img src="./assets/banner-bolsito.png" alt="Bolsito: Finanças Pessoais" width="100%" />

  <br />
  <br />

  **Aplicativo web de finanças pessoais, reservas em CDI e controle diário de passagens. Funciona 100% offline, sem backend e instalável como PWA.**

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

O **Bolsito** nasceu como uma calculadora de gastos diários com passagens de transporte e evoluiu para um hub pessoal de controle financeiro, reunindo orçamento mensal, acompanhamento de caixinhas com rendimento em CDI e previsão de transporte em uma única interface.

> **Nota de escopo:** este projeto foi concebido para uso pessoal do autor e reflete uma rotina específica (como o calendário de feriados do Rio de Janeiro, cálculo bruto de CDI sem IR e um controle simplificado de fatura de cartão). Por esse motivo, pode não atender às necessidades de todos os públicos. O repositório permanece aberto para quem desejar experimentar, adaptar para o próprio fluxo ou usar como referência.

Todos os dados permanecem armazenados localmente no navegador (`localStorage`), sem servidores externos, autenticação ou telemetria. A portabilidade entre dispositivos é feita por exportação e importação completa em arquivo `.json`.

## Funcionalidades

- **Dashboard e patrimônio disponível:** exibe o total líquido consolidado (`Caixinhas + Rendas a receber - Pendências`), indicadores do mês, distribuição de despesas por categoria (Donut SVG), evolução de 12 meses (receita, despesa e aportes líquidos) e lista acionável de contas pendentes.
- **Despesas e Rendas:** organiza renda mensal fixa (com dia padrão de pagamento que alterna automaticamente para `Recebida`, mantendo override manual por mês), rendas extras, contas recorrentes, parcelamentos com acompanhamento de progresso, gastos avulsos com lançamento rápido (`N`) e fatura do cartão de crédito roteada diretamente pela data de vencimento.
- **Caixinhas CDI (252 dias úteis/ano):** simula o rendimento composto diário usando um calendário offline de feriados bancários nacionais. Diferencia caixinhas de **Reserva / Meta** e **Conta / Uso Diário** (com ajuste rápido de saldo sem distorcer os gráficos de aporte) e projeta cenários de 1, 6 e 12 meses.
- **Passagens integradas:** calendário mensal com histórico de tarifas por vigência, registro rápido de exceções (`Não gastei`, `Meia viagem`, valor personalizado e intervalos), gestão de feriados offline, autonomia estimada do saldo do cartão de transporte e consolidação automática na categoria `Transporte`.
- **Privacidade e personalização:** Modo Privacidade instantâneo (atalho `P` ou botão na sidebar), 5 paletas de cores independentes do tema claro/escuro, fontes locais e backup `.json` com migração automática entre versões (`v1` e `v2`).

## Como usar

### Acesso online ou instalação como PWA
1. Acesse **[rodineves12.github.io/bolsito](https://rodineves12.github.io/bolsito/)**.
2. No **Android (Chrome)**, abra o menu (`⋮`) e selecione **Instalar aplicativo**. No **iOS (Safari)**, toque em **Compartilhar → Adicionar à Tela de Início**.
3. Após o primeiro carregamento, o Service Worker armazena os ativos estáticos em cache para operação integralmente offline.

### Execução local
O projeto utiliza ES Modules nativos, sem etapa de build ou instalação de dependências. Basta servir a pasta raiz com qualquer servidor estático:

```bash
git clone https://github.com/RodiNeves12/bolsito.git
cd bolsito
npx serve .
# ou: python -m http.server 8000
```

### Testes
Os motores de cálculo e a camada de validação de estado contam com testes unitários nativos em Node.js (`node:test`), sem pacotes externos:

```bash
node --test tests/*.test.mjs
```

## Arquitetura

| Camada | Implementação |
| :--- | :--- |
| **Interface** | HTML5 semântico, CSS3 baseado em tokens (`data-theme` e `data-palette`) e gráficos em SVG puro |
| **Aplicação** | JavaScript Vanilla modular (ES Modules) organizado em motores puros, store, views e controladores |
| **Persistência** | `localStorage` com validação de schema e backup/restauração em `.json` |
| **Offline** | Service Worker (`sw.js`) com pré-cache dos módulos, ícones e fontes locais |

## Documentação

A documentação técnica acompanha o repositório para preservar a consistência visual e estrutural em futuras alterações:

- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md): tokens de cor, tipografia, grid, componentes reutilizáveis e padrões de interface.
- [`AGENTS.md`](./AGENTS.md): checklist operacional de arquitetura, retrocompatibilidade de dados, temas e versionamento do cache offline.

## Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](./LICENSE) para mais detalhes.
