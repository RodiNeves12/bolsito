/**
 * Fachada (barrel) da camada de renderização financeira do Bolsito.
 * Re-exporta os módulos especializados em `js/views/`.
 */

export { renderDashboardView } from './views/dashboardView.js';
export { renderFlowView } from './views/flowView.js';
export { renderBoxDetailModal, renderCaixinhasView } from './views/caixinhasView.js';
export {
  closeAllFinanceModals,
  openCaixinhaAdjustModal,
  openCaixinhaDetailModal,
  openCaixinhaModal,
  openCaixinhaTxModal,
  openCreditCardBillModal,
  openExtraIncomeModal,
  openFixedExpenseModal,
  openInstallmentModal,
  openQuickExpenseModal,
  populateCategorySelects,
  setCaixinhaKindSelection
} from './views/financeModals.js';
