/**
 * Controlador Financeiro (Dashboard, Fluxo Mensal, Fatura do Cartão,
 * Rendas, Contas Fixas, Parcelamentos e Gastos Avulsos).
 */

import { parseYM, resolveBaseIncomeStatus } from '../financeEngine.js';
import {
  closeAllFinanceModals,
  openCreditCardBillModal,
  openExtraIncomeModal,
  openFixedExpenseModal,
  openInstallmentModal,
  openQuickExpenseModal,
  renderDashboardView,
  renderFlowView
} from '../financeUI.js';
import {
  formatDisplayDate,
  getTodayStr,
  getYearMonthKey,
  isValidDateStr,
  MONTH_NAMES
} from '../holidays.js';
import { closeModal, confirmDialog } from '../modalManager.js';
import { formatBRL, generateId, parseCurrencyToCents } from '../state.js';
import {
  getAppState,
  goToMonth,
  persistAndRender,
  requestRender,
  uiState
} from '../store.js';
import { showToast } from '../ui.js';

const SEARCH_DEBOUNCE_MS = 150;

function togglePaidStatus(kind, id) {
  const appState = getAppState();
  const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);

  if (kind === 'credit_card') {
    const billKey = id || ym;
    const bills = appState.finance.expenses.creditCardBills;
    if (!bills || !bills[billKey]) return;
    const nextVal = !Boolean(bills[billKey].paid);
    bills[billKey].paid = nextVal;
    const label = bills[billKey].cardName || 'Fatura do Cartão de Crédito';
    showToast(
      nextVal ? `"${label}" marcada como paga.` : `"${label}" marcada como pendente.`,
      nextVal ? 'success' : 'default'
    );
    persistAndRender();
    return;
  }

  const list =
    kind === 'fixed'
      ? appState.finance.expenses.fixed
      : kind === 'installment'
        ? appState.finance.expenses.installments
        : null;
  if (!list) return;

  const target = list.find((item) => item.id === id);
  if (!target) return;
  if (!target.paidByMonth || typeof target.paidByMonth !== 'object') {
    target.paidByMonth = {};
  }
  const nextVal = !Boolean(target.paidByMonth[ym]);
  target.paidByMonth[ym] = nextVal;
  showToast(
    nextVal ? `"${target.name}" marcada como paga.` : `"${target.name}" marcada como pendente.`,
    nextVal ? 'success' : 'default'
  );
  persistAndRender();
}

export function bindFinanceEvents() {
  // Botão global "+ Novo Gasto"
  document.getElementById('btn-quick-new-expense')?.addEventListener('click', () => {
    openQuickExpenseModal();
  });

  // Delegação global para botões rápidos [data-open-quick-expense], [data-goto-view] e fechamento de modais financeiros
  document.addEventListener('click', (e) => {
    const quickBtn = e.target.closest('[data-open-quick-expense]');
    if (quickBtn) {
      openQuickExpenseModal();
      return;
    }

    const gotoBtn = e.target.closest('[data-goto-view]');
    if (gotoBtn) {
      uiState.activeView = gotoBtn.dataset.gotoView;
      const scrollTargetId = gotoBtn.dataset.scrollTarget;
      requestRender();
      if (scrollTargetId) {
        requestAnimationFrame(() => {
          document.getElementById(scrollTargetId)?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        });
      }
      return;
    }

    const closeFinBtn = e.target.closest('[data-close-finance-modal]');
    if (closeFinBtn) {
      const targetModal = closeFinBtn.closest('.modal-backdrop');
      if (targetModal) {
        closeModal(targetModal.id);
        if (targetModal.id === 'caixinha-detail-modal') {
          uiState.activeBoxDetailId = null;
        }
      } else {
        closeAllFinanceModals();
        uiState.activeBoxDetailId = null;
      }
      return;
    }

    if (
      e.target.classList.contains('modal-backdrop') &&
      e.target.id !== 'day-modal-backdrop' &&
      e.target.id !== 'builtin-holiday-modal' &&
      e.target.id !== 'confirm-dialog-modal'
    ) {
      closeModal(e.target.id);
      if (e.target.id === 'caixinha-detail-modal') {
        uiState.activeBoxDetailId = null;
      }
    }
  });

  // Troca de mês sincronizada em Dashboard e Fluxo Mensal
  document.getElementById('btn-dash-prev-month')?.addEventListener('click', () => {
    goToMonth(uiState.selectedYear, uiState.selectedMonth - 1);
  });
  document.getElementById('btn-dash-next-month')?.addEventListener('click', () => {
    goToMonth(uiState.selectedYear, uiState.selectedMonth + 1);
  });
  document.getElementById('btn-flow-prev-month')?.addEventListener('click', () => {
    goToMonth(uiState.selectedYear, uiState.selectedMonth - 1);
  });
  document.getElementById('btn-flow-next-month')?.addEventListener('click', () => {
    goToMonth(uiState.selectedYear, uiState.selectedMonth + 1);
  });

  // Chips da legenda do gráfico 12m (caminho rápido sem recalcular motores)
  document.querySelectorAll('.legend-chip[data-toggle-series]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.toggleSeries;
      if (!(key in uiState.evolutionSeries)) return;
      const activeCount = Object.values(uiState.evolutionSeries).filter(Boolean).length;
      if (uiState.evolutionSeries[key] && activeCount <= 1) {
        showToast('Mantenha ao menos uma série ativa no gráfico.');
        return;
      }
      uiState.evolutionSeries[key] = !uiState.evolutionSeries[key];
      if (uiState.activeView === 'dashboard' && uiState.lastDashboardBundle) {
        const { financeMonth, finance12m, caixinhasSummary, netWorth } = uiState.lastDashboardBundle;
        renderDashboardView(financeMonth, finance12m, caixinhasSummary, uiState, netWorth);
      } else {
        requestRender();
      }
    });
  });

  // Clique em coluna do gráfico 12m abre o mês selecionado
  document.getElementById('dashboard-evolution-chart')?.addEventListener('click', (e) => {
    const col = e.target.closest('[data-select-finance-ym]');
    if (!col) return;
    const parsed = parseYM(col.dataset.selectFinanceYm);
    if (parsed) {
      goToMonth(parsed.year, parsed.month);
    }
  });

  // Toggle "Incluir conta diária" na Projeção 12m das Caixinhas (caminho rápido)
  document.getElementById('chk-proj-include-daily')?.addEventListener('change', (e) => {
    uiState.projectionIncludeDaily = Boolean(e.target.checked);
    if (uiState.activeView === 'dashboard' && uiState.lastDashboardBundle) {
      const { financeMonth, finance12m, caixinhasSummary, netWorth } = uiState.lastDashboardBundle;
      renderDashboardView(financeMonth, finance12m, caixinhasSummary, uiState, netWorth);
    } else {
      requestRender();
    }
  });

  // Toggle "A receber / Recebida" da Renda Mensal Fixa (override manual sobre o status efetivo atual)
  document.getElementById('btn-toggle-base-income-received')?.addEventListener('click', () => {
    const appState = getAppState();
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    if (
      !appState.finance.income.baseReceivedByMonth ||
      typeof appState.finance.income.baseReceivedByMonth !== 'object'
    ) {
      appState.finance.income.baseReceivedByMonth = {};
    }
    const currentStatus = resolveBaseIncomeStatus(ym, appState.finance.income);
    const nextVal = !currentStatus.received;
    appState.finance.income.baseReceivedByMonth[ym] = nextVal;
    showToast(
      nextVal ? 'Renda mensal fixa marcada como recebida.' : 'Renda mensal fixa marcada como a receber.',
      nextVal ? 'success' : 'default'
    );
    persistAndRender();
  });

  // Toggle rápido de pendências no Dashboard
  document.getElementById('dashboard-pending-list')?.addEventListener('change', (e) => {
    const chk = e.target.closest('[data-toggle-paid-kind]');
    if (!chk) return;
    togglePaidStatus(chk.dataset.togglePaidKind, chk.dataset.togglePaidId);
  });

  // Renda mensal fixa + dia padrão de pagamento no Fluxo Mensal
  document.getElementById('form-flow-base-income')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-flow-base-income');
    const payDayInput = document.getElementById('input-flow-pay-day');
    const cents = parseCurrencyToCents(input.value || '0');
    if (cents === null) {
      showToast('Digite um valor válido em reais.', 'error');
      input.focus();
      return;
    }
    const rawPayDay = Number(payDayInput?.value);
    if (!Number.isInteger(rawPayDay) || rawPayDay < 1 || rawPayDay > 31) {
      showToast('Informe um dia de pagamento válido (entre 1 e 31).', 'error');
      payDayInput?.focus();
      return;
    }
    const appState = getAppState();
    appState.finance.income.baseMonthly = cents;
    appState.finance.income.payDay = rawPayDay;
    showToast(`Renda mensal fixa salva: ${formatBRL(cents)} (dia ${rawPayDay}).`, 'success');
    persistAndRender();
  });

  // Abas internas e filtros do Fluxo Mensal (re-render local sem recalcular motores)
  const renderFlowFast = () => {
    if (uiState.activeView === 'flow' && uiState.lastFinanceMonth) {
      renderFlowView(uiState.lastFinanceMonth, uiState);
    } else {
      requestRender();
    }
  };

  document.querySelectorAll('[data-flow-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.flowTab = btn.dataset.flowTab;
      renderFlowFast();
    });
  });

  document.getElementById('filter-variable-category')?.addEventListener('change', (e) => {
    uiState.variableFilterCategory = e.target.value;
    renderFlowFast();
  });

  let variableSearchTimer = null;
  document.getElementById('input-variable-search')?.addEventListener('input', (e) => {
    uiState.variableSearchQuery = e.target.value;
    if (variableSearchTimer) clearTimeout(variableSearchTimer);
    variableSearchTimer = setTimeout(() => {
      variableSearchTimer = null;
      renderFlowFast();
    }, SEARCH_DEBOUNCE_MS);
  });

  // Botões de cadastro no Fluxo Mensal
  document.getElementById('btn-add-extra-income')?.addEventListener('click', () => {
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    const today = getTodayStr();
    const defaultDate = today.startsWith(`${ym}-`) ? today : `${ym}-01`;
    openExtraIncomeModal(null, defaultDate);
  });

  document.getElementById('btn-add-fixed')?.addEventListener('click', () => {
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    openFixedExpenseModal(null, ym);
  });

  document.getElementById('btn-add-installment')?.addEventListener('click', () => {
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    openInstallmentModal(null, ym);
  });

  // Delegação de ações nas listas do Fluxo Mensal
  document.getElementById('view-flow')?.addEventListener('click', async (e) => {
    const appState = getAppState();

    const openCardBtn = e.target.closest('[data-open-card-bill]');
    if (openCardBtn && uiState.lastFinanceMonth) {
      openCreditCardBillModal(
        uiState.lastFinanceMonth.creditCardBill,
        `${uiState.lastFinanceMonth.monthName} ${uiState.lastFinanceMonth.year}`
      );
      return;
    }

    const paidBtn = e.target.closest('[data-toggle-paid-kind]');
    if (paidBtn) {
      togglePaidStatus(paidBtn.dataset.togglePaidKind, paidBtn.dataset.togglePaidId);
      return;
    }

    const toggleExtraRec = e.target.closest('[data-toggle-extra-received]');
    if (toggleExtraRec) {
      const id = toggleExtraRec.dataset.toggleExtraReceived;
      const item = appState.finance.income.extras.find((x) => x.id === id);
      if (item) {
        item.received = !(item.received !== false);
        showToast(
          item.received
            ? `"${item.description}" marcada como recebida.`
            : `"${item.description}" marcada como a receber.`,
          item.received ? 'success' : 'default'
        );
        persistAndRender();
      }
      return;
    }

    const editExtra = e.target.closest('[data-edit-extra-income]');
    if (editExtra) {
      const item = appState.finance.income.extras.find((x) => x.id === editExtra.dataset.editExtraIncome);
      if (item) openExtraIncomeModal(item);
      return;
    }

    const delExtra = e.target.closest('[data-delete-extra-income]');
    if (delExtra) {
      const id = delExtra.dataset.deleteExtraIncome;
      const item = appState.finance.income.extras.find((x) => x.id === id);
      if (!item) return;
      const ok = await confirmDialog({
        kicker: 'RENDAS EXTRAS',
        title: 'Excluir renda extra',
        message: `Excluir renda extra "${item.description}"?`,
        confirmLabel: 'Excluir',
        danger: true
      });
      if (!ok) return;
      appState.finance.income.extras = appState.finance.income.extras.filter((x) => x.id !== id);
      showToast('Renda extra removida.');
      persistAndRender();
      return;
    }

    const editFixed = e.target.closest('[data-edit-fixed]');
    if (editFixed) {
      const item = appState.finance.expenses.fixed.find((x) => x.id === editFixed.dataset.editFixed);
      if (item) openFixedExpenseModal(item);
      return;
    }

    const delFixed = e.target.closest('[data-delete-fixed]');
    if (delFixed) {
      const id = delFixed.dataset.deleteFixed;
      const item = appState.finance.expenses.fixed.find((x) => x.id === id);
      if (!item) return;
      const ok = await confirmDialog({
        kicker: 'CONTAS FIXAS',
        title: 'Excluir conta fixa',
        message: `Excluir conta fixa "${item.name}"?`,
        confirmLabel: 'Excluir',
        danger: true
      });
      if (!ok) return;
      appState.finance.expenses.fixed = appState.finance.expenses.fixed.filter((x) => x.id !== id);
      showToast('Conta fixa removida.');
      persistAndRender();
      return;
    }

    const editInst = e.target.closest('[data-edit-installment]');
    if (editInst) {
      const item = appState.finance.expenses.installments.find((x) => x.id === editInst.dataset.editInstallment);
      if (item) openInstallmentModal(item);
      return;
    }

    const delInst = e.target.closest('[data-delete-installment]');
    if (delInst) {
      const id = delInst.dataset.deleteInstallment;
      const item = appState.finance.expenses.installments.find((x) => x.id === id);
      if (!item) return;
      const ok = await confirmDialog({
        kicker: 'PARCELAMENTOS',
        title: 'Excluir parcelamento',
        message: `Excluir parcelamento "${item.name}"?`,
        confirmLabel: 'Excluir',
        danger: true
      });
      if (!ok) return;
      appState.finance.expenses.installments = appState.finance.expenses.installments.filter((x) => x.id !== id);
      showToast('Parcelamento removido.');
      persistAndRender();
      return;
    }

    const editVar = e.target.closest('[data-edit-variable]');
    if (editVar) {
      const item = appState.finance.expenses.variable.find((x) => x.id === editVar.dataset.editVariable);
      if (item) openQuickExpenseModal(item);
      return;
    }

    const delVar = e.target.closest('[data-delete-variable]');
    if (delVar) {
      const id = delVar.dataset.deleteVariable;
      const item = appState.finance.expenses.variable.find((x) => x.id === id);
      if (!item) return;
      const ok = await confirmDialog({
        kicker: 'GASTOS AVULSOS',
        title: 'Excluir gasto',
        message: `Excluir gasto "${item.description}"?`,
        confirmLabel: 'Excluir',
        danger: true
      });
      if (!ok) return;
      appState.finance.expenses.variable = appState.finance.expenses.variable.filter((x) => x.id !== id);
      showToast('Gasto avulso removido.');
      persistAndRender();
    }
  });

  // Fatura Rápida do Cartão de Crédito (data única: competência derivada diretamente de dueDate)
  document.getElementById('form-credit-card-bill')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const appState = getAppState();
    const currentYM = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    const originalYM =
      document.getElementById('input-card-bill-original-month')?.value || currentYM;
    const amountInput = document.getElementById('input-card-bill-amount');
    const dueDateInput = document.getElementById('input-card-bill-duedate');
    const amount = parseCurrencyToCents(amountInput.value || '0');
    const dueDate = dueDateInput?.value || '';
    const rawName = document.getElementById('input-card-bill-name').value.trim().slice(0, 60);
    const cardName = rawName || 'Cartão de Crédito';

    if (amount === null) {
      showToast('Informe um valor válido em reais (ex.: 324,34).', 'error');
      amountInput.focus();
      return;
    }
    if (!isValidDateStr(dueDate)) {
      showToast('Informe uma data de vencimento válida.', 'error');
      dueDateInput?.focus();
      return;
    }

    const targetYM = dueDate.slice(0, 7);
    const parsedTargetYM = parseYM(targetYM);
    if (!parsedTargetYM) {
      showToast('Informe uma data de vencimento válida.', 'error');
      dueDateInput?.focus();
      return;
    }

    const dueDay = Number(dueDate.slice(8, 10));

    if (!appState.finance.expenses.creditCardBills || typeof appState.finance.expenses.creditCardBills !== 'object') {
      appState.finance.expenses.creditCardBills = {};
    }

    const movedMonth = targetYM !== originalYM;
    const existingTarget = appState.finance.expenses.creditCardBills[targetYM];
    const existingOriginal = appState.finance.expenses.creditCardBills[originalYM];

    if (movedMonth && amount > 0 && existingTarget && existingTarget.amount > 0) {
      const destLabel = `${MONTH_NAMES[parsedTargetYM.month - 1]} ${parsedTargetYM.year}`;
      const confirmOverwrite = await confirmDialog({
        kicker: 'FATURA DO CARTÃO',
        title: 'Substituir fatura existente',
        message: `Já existe uma fatura de ${formatBRL(existingTarget.amount)} cadastrada em ${destLabel}. Deseja substituí-la por ${formatBRL(amount)}?`,
        confirmLabel: 'Substituir',
        danger: true
      });
      if (!confirmOverwrite) return;
    }

    appState.finance.expenses.creditCardDefaults = {
      dueDay,
      cardName
    };

    if (amount === 0) {
      delete appState.finance.expenses.creditCardBills[targetYM];
      if (movedMonth) {
        delete appState.finance.expenses.creditCardBills[originalYM];
      }
      showToast('Fatura do cartão zerada.');
    } else {
      const preservedPaid = movedMonth
        ? Boolean(existingOriginal?.paid)
        : Boolean(existingTarget?.paid);

      if (movedMonth && existingOriginal) {
        delete appState.finance.expenses.creditCardBills[originalYM];
      }

      appState.finance.expenses.creditCardBills[targetYM] = {
        amount,
        dueDate,
        dueDay,
        paid: preservedPaid,
        cardName
      };

      if (movedMonth) {
        const destLabel = `${MONTH_NAMES[parsedTargetYM.month - 1]} ${parsedTargetYM.year}`;
        showToast(`Fatura salva em ${destLabel}`, 'success');
      } else {
        showToast(
          `Fatura de ${formatBRL(amount)} salva (vence em ${formatDisplayDate(dueDate)})!`,
          'success'
        );
      }
    }

    closeModal('credit-card-bill-modal');
    persistAndRender();
  });

  document.getElementById('btn-clear-card-bill')?.addEventListener('click', () => {
    const appState = getAppState();
    const ym =
      document.getElementById('input-card-bill-original-month')?.value ||
      getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    if (appState.finance.expenses.creditCardBills) {
      delete appState.finance.expenses.creditCardBills[ym];
    }
    closeModal('credit-card-bill-modal');
    showToast('Fatura do cartão removida deste mês.');
    persistAndRender();
  });

  // Submissão: Gasto Avulso
  document.getElementById('form-quick-expense')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const appState = getAppState();
    const editingId = document.getElementById('input-quick-expense-id').value.trim();
    const amountInput = document.getElementById('input-quick-expense-amount');
    const amount = parseCurrencyToCents(amountInput.value);
    const description = document.getElementById('input-quick-expense-desc').value.trim();
    const category = document.getElementById('input-quick-expense-category').value;
    const date = document.getElementById('input-quick-expense-date').value;

    if (amount === null || amount <= 0) {
      showToast('Informe um valor maior que zero.', 'error');
      amountInput.focus();
      return;
    }
    if (!description || !isValidDateStr(date)) {
      showToast('Preencha a descrição e uma data válida.', 'error');
      return;
    }

    if (editingId) {
      const idx = appState.finance.expenses.variable.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        appState.finance.expenses.variable[idx] = {
          ...appState.finance.expenses.variable[idx],
          amount,
          description: description.slice(0, 100),
          category,
          date
        };
      }
      showToast('Gasto atualizado!', 'success');
    } else {
      appState.finance.expenses.variable.push({
        id: generateId('var'),
        date,
        description: description.slice(0, 100),
        amount,
        category
      });
      showToast(`Gasto de ${formatBRL(amount)} registrado!`, 'success');
    }

    closeModal('quick-expense-modal');
    persistAndRender();
  });

  // Submissão: Renda Extra
  document.getElementById('form-extra-income')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const appState = getAppState();
    const editingId = document.getElementById('input-extra-income-id').value.trim();
    const amountInput = document.getElementById('input-extra-income-amount');
    const amount = parseCurrencyToCents(amountInput.value);
    const description = document.getElementById('input-extra-income-desc').value.trim();
    const date = document.getElementById('input-extra-income-date').value;
    const received = Boolean(document.getElementById('chk-extra-income-received')?.checked);

    if (amount === null || amount <= 0) {
      showToast('Informe um valor válido.', 'error');
      amountInput.focus();
      return;
    }
    if (!description || !isValidDateStr(date)) {
      showToast('Preencha descrição e data.', 'error');
      return;
    }

    if (editingId) {
      const idx = appState.finance.income.extras.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        appState.finance.income.extras[idx] = {
          ...appState.finance.income.extras[idx],
          amount,
          description: description.slice(0, 100),
          date,
          received
        };
      }
      showToast('Renda extra atualizada!', 'success');
    } else {
      appState.finance.income.extras.push({
        id: generateId('inc'),
        date,
        description: description.slice(0, 100),
        amount,
        received
      });
      showToast(`Renda extra de ${formatBRL(amount)} adicionada!`, 'success');
    }

    closeModal('extra-income-modal');
    persistAndRender();
  });

  // Submissão: Conta Fixa
  document.getElementById('form-fixed-expense')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const appState = getAppState();
    const editingId = document.getElementById('input-fixed-id').value.trim();
    const name = document.getElementById('input-fixed-name').value.trim();
    const amountInput = document.getElementById('input-fixed-amount');
    const amount = parseCurrencyToCents(amountInput.value);
    const dueDay = Math.min(31, Math.max(1, Math.round(Number(document.getElementById('input-fixed-dueday').value) || 10)));
    const category = document.getElementById('input-fixed-category').value;
    const startMonth = document.getElementById('input-fixed-start-month').value;

    if (!name || amount === null || amount <= 0 || !parseYM(startMonth)) {
      showToast('Verifique nome, valor e mês de início da conta fixa.', 'error');
      return;
    }

    if (editingId) {
      const idx = appState.finance.expenses.fixed.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        appState.finance.expenses.fixed[idx] = {
          ...appState.finance.expenses.fixed[idx],
          name: name.slice(0, 80),
          amount,
          dueDay,
          category,
          startMonth
        };
      }
      showToast('Conta fixa atualizada!', 'success');
    } else {
      appState.finance.expenses.fixed.push({
        id: generateId('fix'),
        name: name.slice(0, 80),
        amount,
        dueDay,
        category,
        active: true,
        startMonth,
        paidByMonth: {}
      });
      showToast('Conta fixa cadastrada!', 'success');
    }

    closeModal('fixed-expense-modal');
    persistAndRender();
  });

  // Submissão: Parcelamento / Dívida
  document.getElementById('form-installment')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const appState = getAppState();
    const editingId = document.getElementById('input-installment-id').value.trim();
    const name = document.getElementById('input-installment-name').value.trim();
    const amountInput = document.getElementById('input-installment-amount');
    const installmentAmount = parseCurrencyToCents(amountInput.value);
    const totalInstallments = Math.min(
      360,
      Math.max(1, Math.round(Number(document.getElementById('input-installment-count').value) || 1))
    );
    const startMonth = document.getElementById('input-installment-start-month').value;
    const dueDay = Math.min(
      31,
      Math.max(1, Math.round(Number(document.getElementById('input-installment-dueday').value) || 10))
    );
    const category = document.getElementById('input-installment-category').value;

    if (!name || installmentAmount === null || installmentAmount <= 0 || !parseYM(startMonth)) {
      showToast('Verifique os dados do parcelamento.', 'error');
      return;
    }

    const totalAmount = installmentAmount * totalInstallments;

    if (editingId) {
      const idx = appState.finance.expenses.installments.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        appState.finance.expenses.installments[idx] = {
          ...appState.finance.expenses.installments[idx],
          name: name.slice(0, 80),
          installmentAmount,
          totalInstallments,
          totalAmount,
          startMonth,
          dueDay,
          category
        };
      }
      showToast('Parcelamento atualizado!', 'success');
    } else {
      appState.finance.expenses.installments.push({
        id: generateId('inst'),
        name: name.slice(0, 80),
        totalAmount,
        installmentAmount,
        totalInstallments,
        startMonth,
        dueDay,
        category,
        paidByMonth: {}
      });
      showToast('Parcelamento cadastrado!', 'success');
    }

    closeModal('installment-modal');
    persistAndRender();
  });
}
