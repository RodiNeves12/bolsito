/**
 * 02 / Fluxo Mensal — Despesas & Rendas:
 * Resumo 4 KPIs, Renda base + extras, Contas Fixas + Passagens automático +
 * Fatura do Cartão, Parcelamentos e Gastos Avulsos filtrados.
 */

import { getCategoryMeta } from '../financeEngine.js';
import { formatDisplayDate, getTodayStr } from '../holidays.js';
import { centsToInputValue, formatBRL } from '../state.js';
import { escapeHtml } from '../ui.js';

export function renderFlowView(financeMonth, uiState) {
  const monthLabelEl = document.getElementById('flow-month-label');
  if (monthLabelEl) {
    monthLabelEl.textContent = `${financeMonth.monthName} ${financeMonth.year}`;
  }

  const summaryStrip = document.getElementById('flow-summary-strip');
  if (summaryStrip) {
    const isPos = financeMonth.freeBalanceCents >= 0;
    const paidPct =
      financeMonth.totalExpensesCents > 0
        ? Math.min(100, Math.round((financeMonth.paidExpensesCents / financeMonth.totalExpensesCents) * 100))
        : 100;

    summaryStrip.innerHTML = `
      <div class="flow-summary-tile">
        <span class="tile-kicker">01 / RENDA TOTAL</span>
        <strong class="tile-value money">${formatBRL(financeMonth.totalIncomeCents)}</strong>
      </div>
      <div class="flow-summary-tile">
        <span class="tile-kicker">02 / TOTAL DESPESAS</span>
        <strong class="tile-value money">${formatBRL(financeMonth.totalExpensesCents)}</strong>
      </div>
      <div class="flow-summary-tile">
        <span class="tile-kicker">03 / PAGO VS. PENDENTE</span>
        <strong class="tile-value money text-success">${formatBRL(financeMonth.paidExpensesCents)}</strong>
        <div class="tile-sub-row">
          <span class="tile-sub-text ${financeMonth.pendingExpensesCents > 0 ? 'text-warning' : 'text-success'}">
            ${
              financeMonth.pendingExpensesCents > 0
                ? `Pendente: <span class="money">${formatBRL(financeMonth.pendingExpensesCents)}</span>`
                : 'Tudo quitado'
            }
          </span>
          <span class="tile-sub-pct money">${paidPct}%</span>
        </div>
        <div class="progress-track progress-track-xs" aria-hidden="true">
          <div class="progress-fill" style="width: ${paidPct}%;"></div>
        </div>
      </div>
      <div class="flow-summary-tile ${isPos ? 'kpi-tone-success' : 'kpi-tone-danger'}">
        <span class="tile-kicker">04 / SALDO LIVRE</span>
        <strong class="tile-value money ${isPos ? 'text-success' : 'text-danger'}">${formatBRL(financeMonth.freeBalanceCents)}</strong>
      </div>
    `;
  }

  // Card de Rendas
  const baseInput = document.getElementById('input-flow-base-income');
  if (baseInput && document.activeElement !== baseInput) {
    baseInput.value = centsToInputValue(financeMonth.baseMonthlyCents);
  }

  const payDayInput = document.getElementById('input-flow-pay-day');
  if (payDayInput && document.activeElement !== payDayInput) {
    payDayInput.value = String(financeMonth.basePayDay || 5);
  }

  const baseStatusBtn = document.getElementById('btn-toggle-base-income-received');
  if (baseStatusBtn) {
    const isBaseRec = Boolean(financeMonth.baseReceived);
    baseStatusBtn.textContent = isBaseRec ? 'Recebida' : 'A receber';
    baseStatusBtn.classList.toggle('is-paid', isBaseRec);
    baseStatusBtn.classList.toggle('is-pending', !isBaseRec);
    baseStatusBtn.setAttribute('aria-pressed', String(isBaseRec));
  }

  const autoNoteEl = document.getElementById('flow-base-income-auto-note');
  if (autoNoteEl) {
    const isAuto = Boolean(financeMonth.baseReceivedAuto);
    autoNoteEl.textContent = `Auto • Dia ${financeMonth.basePayDay || 5}`;
    autoNoteEl.classList.toggle('hidden', !isAuto);
  }

  const extrasListEl = document.getElementById('flow-extras-list');
  const extrasTotalEl = document.getElementById('flow-extras-total');
  if (extrasTotalEl) {
    extrasTotalEl.textContent = formatBRL(financeMonth.extrasTotalCents);
  }
  if (extrasListEl) {
    if (financeMonth.extras.length === 0) {
      extrasListEl.innerHTML =
        '<p class="muted-text">Nenhuma renda extra lançada neste mês.</p>';
    } else {
      extrasListEl.innerHTML = financeMonth.extras
        .map(
          (item) => `
          <div class="finance-row">
            <div class="finance-row-main">
              <strong>${escapeHtml(item.description)}</strong>
              <span class="finance-row-sub money">${formatDisplayDate(item.date)}</span>
            </div>
            <div class="finance-row-right">
              <span class="finance-row-amount money text-success">+ ${formatBRL(item.amount)}</span>
              <button
                type="button"
                class="pill-toggle ${item.received ? 'is-paid' : 'is-pending'}"
                data-toggle-extra-received="${escapeHtml(item.id)}"
                aria-pressed="${String(item.received)}"
              >
                ${item.received ? 'Recebida' : 'A receber'}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-edit-extra-income="${escapeHtml(item.id)}">Editar</button>
              <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-extra-income="${escapeHtml(item.id)}">Excluir</button>
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  // Abas de filtro de bloco
  const activeTab = uiState.flowTab || 'all';
  document.querySelectorAll('[data-flow-tab]').forEach((btn) => {
    const isActive = btn.dataset.flowTab === activeTab;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  const blockFixed = document.getElementById('flow-block-fixed');
  const blockInst = document.getElementById('flow-block-installments');
  const blockVar = document.getElementById('flow-block-variable');
  if (blockFixed) blockFixed.classList.toggle('hidden', activeTab !== 'all' && activeTab !== 'fixed');
  if (blockInst) blockInst.classList.toggle('hidden', activeTab !== 'all' && activeTab !== 'installments');
  if (blockVar) blockVar.classList.toggle('hidden', activeTab !== 'all' && activeTab !== 'variable');

  // 1. Contas Fixas + Passagens Automático + Fatura do Cartão
  const fixedListEl = document.getElementById('flow-fixed-list');
  const fixedTotalBadge = document.getElementById('flow-fixed-total');
  const fixedBlockTotal =
    financeMonth.fixedExpensesCents +
    financeMonth.transportExpensesCents +
    financeMonth.creditCardExpensesCents;
  if (fixedTotalBadge) {
    fixedTotalBadge.textContent = formatBRL(fixedBlockTotal);
  }
  if (fixedListEl) {
    const tItem = financeMonth.transportItem;
    const transportRowHtml = `
      <div class="finance-row finance-row-auto">
        <div class="finance-row-main">
          <div class="finance-row-title-line">
            <span class="cat-dot" style="background: var(--cat-transporte);" aria-hidden="true"></span>
            <strong>${escapeHtml(tItem.name)}</strong>
            <span class="pill pill-info">Automático • Passagens</span>
          </div>
          <span class="finance-row-sub">
            Categoria: Transporte • ${tItem.activeDaysCount} ${tItem.activeDaysCount === 1 ? 'dia ativo' : 'dias ativos'} no calendário
          </span>
        </div>
        <div class="finance-row-right">
          <strong class="finance-row-amount money">${formatBRL(tItem.amount)}</strong>
          <button type="button" class="btn btn-outline btn-sm" data-goto-view="monthly">
            Abrir Passagens
          </button>
        </div>
      </div>
    `;

    const bill = financeMonth.creditCardBill;
    const todayStr = getTodayStr();
    const isCardOverdue = bill.hasBill && !bill.paid && Boolean(bill.dueDate) && todayStr > bill.dueDate;
    const cardOverdueBadge = isCardOverdue ? '<span class="pill pill-overdue">Vencida</span>' : '';

    const cardBillRowHtml = `
      <div class="finance-row finance-row-card-bill ${bill.hasBill && bill.paid ? 'is-paid' : ''}">
        <div class="finance-row-main">
          <div class="finance-row-title-line">
            <span class="cat-dot" style="background: var(--cat-cartao);" aria-hidden="true"></span>
            <strong>${escapeHtml(bill.cardName || 'Cartão de Crédito')}</strong>
            <span class="pill pill-card-bill">Fatura do Cartão</span>
            ${cardOverdueBadge}
          </div>
          <span class="finance-row-sub">
            ${
              bill.hasBill
                ? `Vencimento: ${formatDisplayDate(bill.dueDate)} • Categoria: Cartão de Crédito`
                : `Vencimento sugerido: ${formatDisplayDate(bill.dueDate)} • Informe o total atual/fechado sem lançar gasto por gasto`
            }
          </span>
        </div>
        <div class="finance-row-right">
          <strong class="finance-row-amount money ${bill.hasBill ? '' : 'muted-text'}">${formatBRL(bill.amount)}</strong>
          ${
            bill.hasBill
              ? `
            <button
              type="button"
              class="pill-toggle ${bill.paid ? 'is-paid' : 'is-pending'}"
              data-toggle-paid-kind="credit_card"
              data-toggle-paid-id="${escapeHtml(financeMonth.ym)}"
              aria-pressed="${String(bill.paid)}"
            >
              ${bill.paid ? 'Pago' : 'Pendente'}
            </button>
          `
              : ''
          }
          <button type="button" class="btn btn-outline btn-sm" data-open-card-bill>
            ${bill.hasBill ? 'Atualizar fatura' : 'Informar fatura'}
          </button>
        </div>
      </div>
    `;

    const fixedRowsHtml = financeMonth.fixedItems
      .map((item) => {
        const cat = getCategoryMeta(item.category);
        return `
          <div class="finance-row ${item.paid ? 'is-paid' : ''}">
            <div class="finance-row-main">
              <div class="finance-row-title-line">
                <span class="cat-dot" style="background: ${cat.colorVar};" aria-hidden="true"></span>
                <strong>${escapeHtml(item.name)}</strong>
                <span class="pill pill-muted">${escapeHtml(cat.label)}</span>
              </div>
              <span class="finance-row-sub">Vencimento: Dia ${String(item.dueDay).padStart(2, '0')}</span>
            </div>
            <div class="finance-row-right">
              <strong class="finance-row-amount money">${formatBRL(item.amount)}</strong>
              <button
                type="button"
                class="pill-toggle ${item.paid ? 'is-paid' : 'is-pending'}"
                data-toggle-paid-kind="fixed"
                data-toggle-paid-id="${escapeHtml(item.id)}"
                aria-pressed="${String(item.paid)}"
              >
                ${item.paid ? 'Pago' : 'Pendente'}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-edit-fixed="${escapeHtml(item.id)}">Editar</button>
              <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-fixed="${escapeHtml(item.id)}">Excluir</button>
            </div>
          </div>
        `;
      })
      .join('');

    fixedListEl.innerHTML =
      transportRowHtml +
      cardBillRowHtml +
      (fixedRowsHtml || '<p class="muted-text mt-12">Nenhuma conta fixa recorrente cadastrada ainda.</p>');
  }

  // 2. Dívidas e Parcelamentos (consumindo paidInstallmentsCount / paidProgressPct do motor)
  const instListEl = document.getElementById('flow-installments-list');
  const instTotalBadge = document.getElementById('flow-installments-total');
  if (instTotalBadge) {
    instTotalBadge.textContent = formatBRL(financeMonth.installmentsExpensesCents);
  }
  if (instListEl) {
    if (financeMonth.installmentItems.length === 0) {
      instListEl.innerHTML =
        '<p class="muted-text">Nenhum parcelamento ou dívida ativa neste mês.</p>';
    } else {
      instListEl.innerHTML = financeMonth.installmentItems
        .map((item) => {
          const cat = getCategoryMeta(item.category);
          const paidInstallmentsCount = item.paidInstallmentsCount ?? 0;
          const paidProgressPct = item.paidProgressPct ?? 0;

          return `
            <div class="finance-row finance-row-installment ${item.paid ? 'is-paid' : ''}">
              <div class="finance-row-main">
                <div class="finance-row-title-line">
                  <span class="cat-dot" style="background: ${cat.colorVar};" aria-hidden="true"></span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="pill pill-info money">Parcela ${item.currentNumber}/${item.totalInstallments}</span>
                  <span class="pill pill-muted">${escapeHtml(cat.label)}</span>
                </div>
                <span class="finance-row-sub">
                  Venc. Dia ${String(item.dueDay).padStart(2, '0')} • Restante: <strong class="money">${formatBRL(item.remainingAmountCents)}</strong> (${item.remainingInstallments} ${item.remainingInstallments === 1 ? 'parcela' : 'parcelas'}) • ${paidInstallmentsCount}/${item.totalInstallments} ${paidInstallmentsCount === 1 ? 'paga' : 'pagas'}
                </span>
                <div class="progress-track progress-track-sm mt-6" aria-hidden="true">
                  <div class="progress-fill" style="width: ${paidProgressPct}%;"></div>
                </div>
              </div>
              <div class="finance-row-right">
                <strong class="finance-row-amount money">${formatBRL(item.installmentAmount)}</strong>
                <button
                  type="button"
                  class="pill-toggle ${item.paid ? 'is-paid' : 'is-pending'}"
                  data-toggle-paid-kind="installment"
                  data-toggle-paid-id="${escapeHtml(item.id)}"
                  aria-pressed="${String(item.paid)}"
                >
                  ${item.paid ? 'Pago' : 'Pendente'}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-edit-installment="${escapeHtml(item.id)}">Editar</button>
                <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-installment="${escapeHtml(item.id)}">Excluir</button>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  // 3. Gastos Avulsos (com filtro por categoria e busca)
  const varListEl = document.getElementById('flow-variable-list');
  const varTotalBadge = document.getElementById('flow-variable-total');
  const filterCat = uiState.variableFilterCategory || 'all';
  const filterCatSel = document.getElementById('filter-variable-category');
  if (filterCatSel && filterCatSel.value !== filterCat) {
    filterCatSel.value = filterCat;
  }
  const filterQuery = (uiState.variableSearchQuery || '').trim().toLowerCase();

  const filteredVars = financeMonth.variableItems.filter((item) => {
    if (filterCat !== 'all' && item.category !== filterCat) return false;
    if (filterQuery && !item.description.toLowerCase().includes(filterQuery)) return false;
    return true;
  });

  const filteredTotalCents = filteredVars.reduce((acc, item) => acc + item.amount, 0);
  if (varTotalBadge) {
    varTotalBadge.textContent = formatBRL(filteredTotalCents);
  }

  if (varListEl) {
    if (financeMonth.variableItems.length === 0) {
      varListEl.innerHTML =
        '<p class="muted-text">Nenhum gasto avulso registrado neste mês. Use "+ Novo Gasto" ou pressione a tecla N.</p>';
    } else if (filteredVars.length === 0) {
      varListEl.innerHTML =
        '<p class="muted-text">Nenhum gasto avulso corresponde aos filtros aplicados.</p>';
    } else {
      varListEl.innerHTML = filteredVars
        .map((item) => {
          const cat = getCategoryMeta(item.category);
          return `
            <div class="finance-row">
              <div class="finance-row-main">
                <div class="finance-row-title-line">
                  <span class="cat-dot" style="background: ${cat.colorVar};" aria-hidden="true"></span>
                  <strong>${escapeHtml(item.description)}</strong>
                  <span class="pill pill-muted">${escapeHtml(cat.label)}</span>
                </div>
                <span class="finance-row-sub money">${formatDisplayDate(item.date)}</span>
              </div>
              <div class="finance-row-right">
                <strong class="finance-row-amount money">${formatBRL(item.amount)}</strong>
                <button type="button" class="btn btn-ghost btn-sm" data-edit-variable="${escapeHtml(item.id)}">Editar</button>
                <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-variable="${escapeHtml(item.id)}">Excluir</button>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }
}
