/**
 * Helpers de abertura, preenchimento e fechamento dos modais financeiros,
 * integrados ao `modalManager.js` (focus trap, restauração de foco e bloqueio de scroll).
 */

import { EXPENSE_CATEGORIES } from '../constants.js';
import { getTodayStr } from '../holidays.js';
import { closeModals, openModal } from '../modalManager.js';
import { centsToInputValue, formatBRL } from '../state.js';
import { escapeHtml } from '../ui.js';
import { renderBoxDetailModal } from './caixinhasView.js';

const FINANCE_MODAL_IDS = [
  'quick-expense-modal',
  'extra-income-modal',
  'fixed-expense-modal',
  'installment-modal',
  'caixinha-modal',
  'caixinha-adjust-modal',
  'caixinha-tx-modal',
  'caixinha-detail-modal',
  'credit-card-bill-modal'
];

/**
 * Popula todos os <select> de categoria financeira da interface.
 */
export function populateCategorySelects() {
  const selectIds = [
    'input-quick-expense-category',
    'input-fixed-category',
    'input-installment-category',
    'filter-variable-category'
  ];

  for (const id of selectIds) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    const isFilter = id === 'filter-variable-category';
    const currentValue = sel.value;

    const options = [];
    if (isFilter) {
      options.push('<option value="all">Todas as categorias</option>');
    }

    for (const cat of EXPENSE_CATEGORIES) {
      options.push(`<option value="${cat.id}">${escapeHtml(cat.label)}</option>`);
    }

    sel.innerHTML = options.join('');
    if (isFilter) {
      sel.value = 'all';
      sel.selectedIndex = 0;
    } else if (currentValue && [...sel.options].some((o) => o.value === currentValue)) {
      sel.value = currentValue;
    } else if (id === 'input-installment-category') {
      sel.value = 'compras';
    } else {
      sel.value = 'alimentacao';
    }
  }
}

export function openQuickExpenseModal(editingItem = null) {
  const modal = document.getElementById('quick-expense-modal');
  if (!modal) return;
  document.getElementById('input-quick-expense-id').value = editingItem ? editingItem.id : '';
  document.getElementById('quick-expense-modal-title').textContent = editingItem
    ? 'Editar Gasto Avulso'
    : 'Novo Gasto Rápido';
  const amountInput = document.getElementById('input-quick-expense-amount');
  amountInput.value = editingItem ? centsToInputValue(editingItem.amount) : '';
  document.getElementById('input-quick-expense-desc').value = editingItem ? editingItem.description : '';
  document.getElementById('input-quick-expense-category').value = editingItem
    ? editingItem.category
    : 'alimentacao';
  document.getElementById('input-quick-expense-date').value = editingItem
    ? editingItem.date
    : getTodayStr();

  openModal('quick-expense-modal', { focusEl: amountInput });
}

export function openExtraIncomeModal(editingItem = null, defaultDate = null) {
  const modal = document.getElementById('extra-income-modal');
  if (!modal) return;
  document.getElementById('input-extra-income-id').value = editingItem ? editingItem.id : '';
  document.getElementById('extra-income-modal-title').textContent = editingItem
    ? 'Editar Renda Extra'
    : 'Nova Renda Extra';
  const amountInput = document.getElementById('input-extra-income-amount');
  amountInput.value = editingItem ? centsToInputValue(editingItem.amount) : '';
  document.getElementById('input-extra-income-desc').value = editingItem ? editingItem.description : '';
  document.getElementById('input-extra-income-date').value = editingItem
    ? editingItem.date
    : defaultDate || getTodayStr();
  document.getElementById('chk-extra-income-received').checked = editingItem
    ? editingItem.received !== false
    : true;

  openModal('extra-income-modal', { focusEl: amountInput });
}

export function openFixedExpenseModal(editingItem = null, defaultStartMonth = null) {
  const modal = document.getElementById('fixed-expense-modal');
  if (!modal) return;
  document.getElementById('input-fixed-id').value = editingItem ? editingItem.id : '';
  document.getElementById('fixed-expense-modal-title').textContent = editingItem
    ? 'Editar Conta Fixa'
    : 'Nova Conta Fixa';
  const nameInput = document.getElementById('input-fixed-name');
  nameInput.value = editingItem ? editingItem.name : '';
  document.getElementById('input-fixed-amount').value = editingItem
    ? centsToInputValue(editingItem.amount)
    : '';
  document.getElementById('input-fixed-dueday').value = editingItem ? String(editingItem.dueDay) : '10';
  document.getElementById('input-fixed-category').value = editingItem ? editingItem.category : 'moradia';
  document.getElementById('input-fixed-start-month').value = editingItem
    ? editingItem.startMonth
    : defaultStartMonth || getTodayStr().slice(0, 7);

  openModal('fixed-expense-modal', { focusEl: nameInput });
}

export function openInstallmentModal(editingItem = null, defaultStartMonth = null) {
  const modal = document.getElementById('installment-modal');
  if (!modal) return;
  document.getElementById('input-installment-id').value = editingItem ? editingItem.id : '';
  document.getElementById('installment-modal-title').textContent = editingItem
    ? 'Editar Parcelamento'
    : 'Novo Parcelamento / Dívida';
  const nameInput = document.getElementById('input-installment-name');
  nameInput.value = editingItem ? editingItem.name : '';
  document.getElementById('input-installment-amount').value = editingItem
    ? centsToInputValue(editingItem.installmentAmount)
    : '';
  document.getElementById('input-installment-count').value = editingItem
    ? String(editingItem.totalInstallments)
    : '6';
  document.getElementById('input-installment-start-month').value = editingItem
    ? editingItem.startMonth
    : defaultStartMonth || getTodayStr().slice(0, 7);
  document.getElementById('input-installment-dueday').value = editingItem
    ? String(editingItem.dueDay)
    : '10';
  document.getElementById('input-installment-category').value = editingItem
    ? editingItem.category
    : 'compras';

  openModal('installment-modal', { focusEl: nameInput });
}

export function setCaixinhaKindSelection(kind) {
  const safeKind = kind === 'daily' ? 'daily' : 'reserve';
  const hiddenInput = document.getElementById('input-box-kind');
  if (hiddenInput) hiddenInput.value = safeKind;
  document.querySelectorAll('[data-box-kind-choice]').forEach((btn) => {
    const isActive = btn.dataset.boxKindChoice === safeKind;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

export function openCaixinhaModal(editingBox = null) {
  const modal = document.getElementById('caixinha-modal');
  if (!modal) return;
  document.getElementById('input-box-id').value = editingBox ? editingBox.id : '';
  document.getElementById('caixinha-modal-title').textContent = editingBox
    ? 'Editar Caixinha'
    : 'Nova Caixinha CDI';
  setCaixinhaKindSelection(editingBox?.kind === 'daily' ? 'daily' : 'reserve');
  const nameInput = document.getElementById('input-box-name');
  nameInput.value = editingBox ? editingBox.name : '';
  document.getElementById('input-box-cdi-percent').value = editingBox
    ? String(editingBox.cdiPercent).replace('.', ',')
    : '100';
  document.getElementById('input-box-goal').value =
    editingBox && editingBox.goalAmount ? centsToInputValue(editingBox.goalAmount) : '';

  openModal('caixinha-modal', { focusEl: nameInput });
}

export function openCaixinhaAdjustModal(boxPerf) {
  const modal = document.getElementById('caixinha-adjust-modal');
  if (!modal || !boxPerf) return;
  document.getElementById('input-adjust-box-id').value = boxPerf.id;
  document.getElementById('adjust-box-modal-subtitle').textContent = boxPerf.name;
  document.getElementById('adjust-box-current-balance').textContent = formatBRL(
    boxPerf.currentBalanceCents
  );
  const input = document.getElementById('input-adjust-box-balance');
  if (input) {
    input.value = centsToInputValue(boxPerf.currentBalanceCents);
  }
  openModal('caixinha-adjust-modal', { focusEl: input });
  input?.select();
}

export function openCaixinhaTxModal(box, type = 'deposit') {
  const modal = document.getElementById('caixinha-tx-modal');
  if (!modal || !box) return;
  const isDeposit = type === 'deposit';
  document.getElementById('input-box-tx-box-id').value = box.id;
  document.getElementById('input-box-tx-type').value = isDeposit ? 'deposit' : 'withdraw';
  document.getElementById('caixinha-tx-modal-title').textContent = isDeposit
    ? `Aporte em ${box.name}`
    : `Resgate de ${box.name}`;
  document.getElementById('btn-box-tx-submit').textContent = isDeposit
    ? 'Registrar aporte'
    : 'Registrar resgate';
  const amountInput = document.getElementById('input-box-tx-amount');
  amountInput.value = '';
  document.getElementById('input-box-tx-date').value = getTodayStr();
  document.getElementById('input-box-tx-note').value = '';

  openModal('caixinha-tx-modal', { focusEl: amountInput });
}

export function openCaixinhaDetailModal(boxPerf, cdiAnnualRate, simulatedMonthlyCents = 0, onClose = null) {
  const modal = document.getElementById('caixinha-detail-modal');
  if (!modal || !boxPerf) return;
  renderBoxDetailModal(boxPerf, cdiAnnualRate, simulatedMonthlyCents);
  openModal('caixinha-detail-modal', { onClose });
}

export function openCreditCardBillModal(creditCardBill, monthLabel = '') {
  const modal = document.getElementById('credit-card-bill-modal');
  if (!modal || !creditCardBill) return;
  const subEl = document.getElementById('card-bill-modal-subtitle');
  const clearBtn = document.getElementById('btn-clear-card-bill');

  if (subEl) subEl.textContent = monthLabel ? `Competência atual: ${monthLabel}` : '';
  document.getElementById('input-card-bill-original-month').value = creditCardBill.ym;
  const amountInput = document.getElementById('input-card-bill-amount');
  amountInput.value = creditCardBill.hasBill ? centsToInputValue(creditCardBill.amount) : '';
  document.getElementById('input-card-bill-duedate').value = creditCardBill.dueDate;
  document.getElementById('input-card-bill-name').value =
    creditCardBill.cardName && creditCardBill.cardName !== 'Cartão de Crédito'
      ? creditCardBill.cardName
      : '';

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !creditCardBill.hasBill);
  }

  openModal('credit-card-bill-modal', { focusEl: amountInput });
}

export function closeAllFinanceModals() {
  closeModals(FINANCE_MODAL_IDS);
}
