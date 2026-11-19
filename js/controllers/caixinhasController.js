/**
 * Controlador de Caixinhas CDI:
 * Criação/edição/exclusão de caixinhas, ajuste rápido de saldo,
 * aportes/resgates e simulador no modal de detalhes.
 */

import {
  closeAllFinanceModals,
  openCaixinhaAdjustModal,
  openCaixinhaDetailModal,
  openCaixinhaModal,
  openCaixinhaTxModal,
  renderBoxDetailModal,
  setCaixinhaKindSelection
} from '../financeUI.js';
import { getTodayStr, isValidDateStr } from '../holidays.js';
import { closeModal, confirmDialog } from '../modalManager.js';
import {
  formatBRL,
  generateId,
  parseCurrencyToCents,
  parsePercentageRate
} from '../state.js';
import { getAppState, persistAndRender, requestRender, uiState } from '../store.js';
import { showToast } from '../ui.js';

export function bindCaixinhasEvents() {
  document.getElementById('btn-goto-cdi-config')?.addEventListener('click', () => {
    uiState.activeView = 'backup';
    requestRender();
    setTimeout(() => document.getElementById('input-config-cdi-rate')?.focus(), 60);
  });

  document.getElementById('btn-new-caixinha')?.addEventListener('click', () => {
    openCaixinhaModal();
  });

  document.querySelectorAll('[data-box-kind-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setCaixinhaKindSelection(btn.dataset.boxKindChoice);
    });
  });

  document.getElementById('caixinhas-grid')?.addEventListener('click', (e) => {
    if (e.target.closest('#btn-empty-new-box')) {
      openCaixinhaModal();
      return;
    }

    const adjustBtn = e.target.closest('[data-box-adjust]');
    if (adjustBtn) {
      const boxId = adjustBtn.dataset.boxAdjust;
      const perf = uiState.lastCaixinhasSummary?.boxes.find((b) => b.id === boxId);
      if (perf) openCaixinhaAdjustModal(perf);
      return;
    }

    const txBtn = e.target.closest('[data-box-tx-type]');
    if (txBtn) {
      const box = getAppState().finance.caixinhas.boxes.find((b) => b.id === txBtn.dataset.boxId);
      if (box) openCaixinhaTxModal(box, txBtn.dataset.boxTxType);
      return;
    }

    const detailBtn = e.target.closest('[data-box-details]');
    if (detailBtn) {
      const boxId = detailBtn.dataset.boxDetails;
      const perf = uiState.lastCaixinhasSummary?.boxes.find((b) => b.id === boxId);
      if (perf) {
        uiState.activeBoxDetailId = boxId;
        uiState.boxSimMonthlyCents = 0;
        openCaixinhaDetailModal(perf, uiState.lastCaixinhasSummary.cdiAnnualRate, 0, () => {
          uiState.activeBoxDetailId = null;
        });
      }
    }
  });

  // Nova / Editar Caixinha
  document.getElementById('form-caixinha')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const appState = getAppState();
    const editingId = document.getElementById('input-box-id').value.trim();
    const kind = document.getElementById('input-box-kind')?.value === 'daily' ? 'daily' : 'reserve';
    const name = document.getElementById('input-box-name').value.trim();
    const cdiPercent = parsePercentageRate(document.getElementById('input-box-cdi-percent').value, {
      min: 0,
      max: 500
    });
    const rawGoal = document.getElementById('input-box-goal').value.trim();
    const goalAmount = rawGoal ? parseCurrencyToCents(rawGoal) : null;

    if (!name || cdiPercent === null) {
      showToast('Informe o nome e o percentual do CDI (ex.: 100).', 'error');
      return;
    }
    if (rawGoal && (goalAmount === null || goalAmount <= 0)) {
      showToast('Valor de meta inválido.', 'error');
      return;
    }

    if (editingId) {
      const idx = appState.finance.caixinhas.boxes.findIndex((b) => b.id === editingId);
      if (idx !== -1) {
        appState.finance.caixinhas.boxes[idx] = {
          ...appState.finance.caixinhas.boxes[idx],
          name: name.slice(0, 80),
          kind,
          cdiPercent,
          goalAmount: goalAmount || null
        };
      }
      showToast('Caixinha atualizada!', 'success');
    } else {
      appState.finance.caixinhas.boxes.push({
        id: generateId('box'),
        name: name.slice(0, 80),
        kind,
        cdiPercent,
        goalAmount: goalAmount || null,
        transactions: []
      });
      showToast('Caixinha criada!', 'success');
    }

    closeModal('caixinha-modal');
    persistAndRender();
  });

  // Ajuste Rápido de Saldo (Conta / Uso Diário)
  document.getElementById('form-caixinha-adjust')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const boxId = document.getElementById('input-adjust-box-id').value;
    const balanceInput = document.getElementById('input-adjust-box-balance');
    const newBalanceCents = parseCurrencyToCents(balanceInput.value);

    const box = getAppState().finance.caixinhas.boxes.find((b) => b.id === boxId);
    const boxPerf = uiState.lastCaixinhasSummary?.boxes.find((b) => b.id === boxId);
    if (!box || !boxPerf) return;

    if (newBalanceCents === null || newBalanceCents < 0) {
      showToast('Informe um saldo válido em reais (ex.: 1.240,50).', 'error');
      balanceInput.focus();
      return;
    }

    const diff = newBalanceCents - boxPerf.currentBalanceCents;
    if (diff === 0) {
      closeModal('caixinha-adjust-modal');
      showToast('O saldo informado já coincide com o saldo atual.');
      return;
    }

    box.transactions.push({
      id: generateId('tx'),
      date: getTodayStr(),
      type: diff > 0 ? 'deposit' : 'withdraw',
      amount: Math.abs(diff),
      isAdjustment: true,
      note: 'Ajuste rápido de saldo'
    });

    closeModal('caixinha-adjust-modal');
    showToast(`Saldo de "${box.name}" atualizado para ${formatBRL(newBalanceCents)}!`, 'success');
    persistAndRender();
  });

  // Aporte / Resgate na Caixinha
  document.getElementById('form-caixinha-tx')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const boxId = document.getElementById('input-box-tx-box-id').value;
    const type = document.getElementById('input-box-tx-type').value === 'withdraw' ? 'withdraw' : 'deposit';
    const amountInput = document.getElementById('input-box-tx-amount');
    const amount = parseCurrencyToCents(amountInput.value);
    const date = document.getElementById('input-box-tx-date').value;
    const note = document.getElementById('input-box-tx-note').value.trim().slice(0, 120);

    const box = getAppState().finance.caixinhas.boxes.find((b) => b.id === boxId);
    if (!box) return;
    if (amount === null || amount <= 0 || !isValidDateStr(date)) {
      showToast('Informe um valor maior que zero e uma data válida.', 'error');
      amountInput.focus();
      return;
    }

    const tx = { id: generateId('tx'), date, type, amount };
    if (note) tx.note = note;
    box.transactions.push(tx);

    closeModal('caixinha-tx-modal');
    showToast(
      type === 'deposit'
        ? `Aporte de ${formatBRL(amount)} registrado!`
        : `Resgate de ${formatBRL(amount)} registrado!`,
      'success'
    );
    persistAndRender();
  });

  // Ações dentro do Modal de Detalhes
  document.getElementById('input-box-sim-monthly')?.addEventListener('input', (e) => {
    const raw = e.target.value.trim();
    const parsed = raw ? parseCurrencyToCents(raw) : 0;
    uiState.boxSimMonthlyCents = parsed !== null ? parsed : 0;
    if (uiState.activeBoxDetailId && uiState.lastCaixinhasSummary) {
      const perf = uiState.lastCaixinhasSummary.boxes.find((b) => b.id === uiState.activeBoxDetailId);
      if (perf) {
        renderBoxDetailModal(perf, uiState.lastCaixinhasSummary.cdiAnnualRate, uiState.boxSimMonthlyCents);
      }
    }
  });

  document.getElementById('btn-detail-deposit')?.addEventListener('click', () => {
    const box = getAppState().finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (box) openCaixinhaTxModal(box, 'deposit');
  });

  document.getElementById('btn-detail-withdraw')?.addEventListener('click', () => {
    const box = getAppState().finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (box) openCaixinhaTxModal(box, 'withdraw');
  });

  document.getElementById('btn-detail-edit-box')?.addEventListener('click', () => {
    const box = getAppState().finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (box) {
      uiState.activeBoxDetailId = null;
      closeAllFinanceModals();
      openCaixinhaModal(box);
    }
  });

  document.getElementById('btn-detail-delete-box')?.addEventListener('click', async () => {
    const appState = getAppState();
    const box = appState.finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (!box) return;
    const ok = await confirmDialog({
      kicker: 'CAIXINHAS CDI',
      title: 'Excluir caixinha',
      message: `Excluir a caixinha "${box.name}" e todo o histórico de movimentações?`,
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return;
    appState.finance.caixinhas.boxes = appState.finance.caixinhas.boxes.filter((b) => b.id !== box.id);
    uiState.activeBoxDetailId = null;
    closeAllFinanceModals();
    showToast('Caixinha removida.');
    persistAndRender();
  });

  document.getElementById('box-detail-history')?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-delete-box-tx]');
    if (!delBtn) return;
    const boxId = delBtn.dataset.boxId;
    const txId = delBtn.dataset.deleteBoxTx;
    const box = getAppState().finance.caixinhas.boxes.find((b) => b.id === boxId);
    if (!box) return;
    const ok = await confirmDialog({
      kicker: 'MOVIMENTAÇÕES',
      title: 'Excluir movimentação',
      message: 'Excluir esta movimentação da caixinha?',
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return;
    box.transactions = box.transactions.filter((tx) => tx.id !== txId);
    showToast('Movimentação removida.');
    persistAndRender();
  });
}
