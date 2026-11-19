<div align="center">
  <img src="./assets/banner-bolsito.png" alt="Bolsito: Finanças Pessoais" width="100%" />

  <br />
  <br />

  **Um aplicativo simples de finanças pessoais, reservas em CDI e controle diário de passagens. Funciona 100% offline, sem backend e pode ser instalado como PWA.**

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

O **Bolsito** é um projeto feito sob medida para a minha própria rotina. Ele começou como uma calculadora simples para controlar meus gastos diários com passagens de transporte e acabou crescendo até virar o lugar onde acompanho minhas contas, rendas e caixinhas com rendimento em CDI.

Justamente por ter sido pensado para o meu uso pessoal, ele faz algumas escolhas bem específicas (como o calendário de feriados do Rio de Janeiro, o cálculo bruto de CDI sem descontar IR e um fluxo bem enxuto de fatura de cartão). Por isso, pode não ser útil nem fazer sentido para todo mundo. Ainda assim, deixei o código aberto caso alguém queira testar, adaptar para a própria realidade ou usar como referência.

Todos os dados ficam salvos apenas no navegador (`localStorage`), sem servidor, login ou rastreamento. Quando preciso trocar de aparelho ou guardar uma cópia, exporto e importo tudo em um arquivo `.json`.

## O que ele faz hoje

- **Dashboard e patrimônio disponível:** mostra o total líquido consolidado (`Caixinhas + Rendas a receber - Pendências`), resumo do mês, gastos por categoria em gráfico Donut SVG, evolução de 12 meses (receita, despesa e aportes líquidos) e lista rápida de contas pendentes.
- **Despesas e Rendas:** controla renda mensal fixa (com dia padrão de pagamento que marca como recebida automaticamente, mas permite alterar na mão quando precisar), rendas extras, contas recorrentes, parcelamentos com progresso de pagamento, gastos avulsos com atalho rápido (`N`) e fatura do cartão de crédito guiada apenas pela data de vencimento.
- **Caixinhas CDI (252 dias úteis/ano):** acompanha o rendimento composto dia a dia usando feriados bancários nacionais offline. Separa caixinhas de **Reserva / Meta** e **Conta / Uso Diário** (com ajuste rápido de saldo que não distorce os gráficos de aporte) e projeta cenários de 1, 6 e 12 meses.
- **Passagens integradas:** calendário mensal com histórico de tarifas por data de vigência, marcação rápida de exceções (`Não gastei`, `Meia viagem`, valor personalizado e intervalos), feriados offline, autonomia estimada do saldo do cartão de transporte e soma automática na categoria `Transporte`.
- **Privacidade e visual:** Modo Privacidade em um clique (ou tecla `P`) para borrar valores na tela, 5 paletas de cores combinadas com tema claro/escuro, fontes locais e backup `.json` compatível entre versões (`v1` e `v2`).

## Como usar

### Pelo navegador ou instalado no celular (PWA)
1. Acesse **[rodineves12.github.io/bolsito](https://rodineves12.github.io/bolsito/)**.
2. No **Android (Chrome)**, abra o menu (`⋮`) e toque em **Instalar aplicativo**. No **iOS (Safari)**, toque em **Compartilhar → Adicionar à Tela de Início**.
3. Depois do primeiro carregamento, o Service Worker guarda os arquivos em cache para funcionar mesmo sem internet.

### Rodar localmente
Como o app usa ES Modules nativos e não tem etapa de build, basta servir a pasta com qualquer servidor estático:

```bash
git clone https://github.com/RodiNeves12/bolsito.git
cd bolsito
npx serve .
# ou: python -m http.server 8000
```

Para rodar a suíte de testes unitários dos motores de cálculo (requer apenas Node.js, sem instalar pacotes):

```bash
node --test tests/*.test.mjs
```

## Arquitetura

| Camada | Como funciona |
| :--- | :--- |
| **Interface** | HTML5 semântico, CSS3 com tokens (`data-theme` e `data-palette`) e gráficos em SVG puro |
| **Lógica** | JavaScript Vanilla modular (ES Modules), dividido entre motores puros, store, views e controladores |
| **Persistência** | `localStorage` com validação de schema e exportação/importação em `.json` |
| **Offline** | Service Worker (`sw.js`) com pré-cache dos módulos, ícones e fontes locais |

## Documentação interna

O projeto foi evoluindo de forma iterativa com apoio de IA e documentação mantida junto ao código para preservar a consistência visual e técnica:

- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md): tokens de cor, tipografia, grid, componentes reutilizáveis e regras de interface.
- [`AGENTS.md`](./AGENTS.md): checklist técnico de arquitetura, migração de dados, compatibilidade entre temas e versionamento do cache offline.

## Licença

Distribuído sob a licença **MIT**. Veja o arquivo [`LICENSE`](./LICENSE) para mais detalhes.
