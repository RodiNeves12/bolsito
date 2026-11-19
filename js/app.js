/**
 * Ponto de Entrada, Orquestração da Renderização Seletiva e Inicialização do Bolsito.
 * 100% ES Modules nativo, offline-first, sem dependências externas.
 */

import {
  calculateCardProjection,
  calculateRangeSummary,
  calculateYearSummary
} from './calculator.js';
import { calculateAllCaixinhas } from './cdiEngine.js';
import { bindCaixinhasEvents } from './controllers/caixinhasController.js';
import { bindFinanceEvents } from './controllers/financeController.js';
import { bindSettingsAndNavEvents, setupPWA } from './controllers/settingsController.js';
import {
  bindTransportEvents,
  resetCustomHolidayForm,
  resetFareFormToDefaults
} from './controllers/transportController.js';
import {
  calculateConsolidatedNetWorth,
  calculateFinance12Months,
  calculateFinanceMonth
} from './financeEngine.js';
import {
  populateCategorySelects,
  renderBoxDetailModal,
  renderCaixinhasView,
  renderDashboardView,
  renderFlowView
} from './financeUI.js';
import { getTodayStr, getYearMonthKey } from './holidays.js';
import { closeModal, initModalManager } from './modalManager.js';
import { getAppState, setRenderCallback, uiState } from './store.js';
import {
  applyPrivacyMode,
  applyTheme,
  populateMonthYearSelectors,
  renderAnnualView,
  renderBackupView,
  renderCalendarGrid,
  renderCalendarInteractionState,
  renderCardBalance,
  renderFaresView,
  renderHolidaysView,
  renderMonthlySummary,
  setActiveView
} from './ui.js';

// ============================================================
// Renderização Seletiva por Visão Ativa
// ============================================================

function renderAll() {
  const appState = getAppState();
  const holidayYearCache = new Map();
  const nationalHolidayCache = new Map();
  uiState.lastRenderedDateStr = getTodayStr();

  // 1. Shell global: tema, paleta, privacidade e navegação/cabeçalho
  applyTheme(appState.theme, appState.palette);
  applyPrivacyMode(appState.privacyMode);
  setActiveView(uiState.activeView);

  // 2. Renderização seletiva apenas da visão ativa
  switch (uiState.activeView) {
    case 'dashboard': {
      const financeMonth = calculateFinanceMonth(uiState.selectedYear, uiState.selectedMonth, appState, {
        holidayYearCache
      });
      const finance12m = calculateFinance12Months(
        uiState.selectedYear,
        uiState.selectedMonth,
        appState,
        holidayYearCache
      );
      const caixinhasSummary = calculateAllCaixinhas(appState, {
        nationalHolidayCache,
        targetYM: financeMonth.ym
      });
      const netWorth = calculateConsolidatedNetWorth(financeMonth, caixinhasSummary);

      uiState.lastFinanceMonth = financeMonth;
      uiState.lastCaixinhasSummary = caixinhasSummary;
      uiState.lastDashboardBundle = { financeMonth, finance12m, caixinhasSummary, netWorth };

      renderDashboardView(financeMonth, finance12m, caixinhasSummary, uiState, netWorth);
      break;
    }

    case 'flow': {
      const financeMonth = calculateFinanceMonth(uiState.selectedYear, uiState.selectedMonth, appState, {
        holidayYearCache
      });
      uiState.lastFinanceMonth = financeMonth;
      renderFlowView(financeMonth, uiState);
      break;
    }

    case 'caixinhas': {
      const targetYM = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
      const caixinhasSummary = calculateAllCaixinhas(appState, {
        nationalHolidayCache,
        targetYM
      });
      uiState.lastCaixinhasSummary = caixinhasSummary;
      renderCaixinhasView(caixinhasSummary);
      break;
    }

    case 'monthly': {
      const cardProjection = calculateCardProjection(appState, holidayYearCache);
      renderCardBalance(cardProjection, appState);

      populateMonthYearSelectors(uiState.selectedYear, uiState.selectedMonth);
      const selectedYearSummary = calculateYearSummary(
        uiState.selectedYear,
        appState,
        holidayYearCache
      );
      const monthData = selectedYearSummary.months[uiState.selectedMonth - 1];
      const rangeSummary =
        uiState.rangeStart && uiState.rangeEnd
          ? calculateRangeSummary(uiState.rangeStart, uiState.rangeEnd, appState, holidayYearCache)
          : null;

      renderCalendarInteractionState(uiState, rangeSummary);
      renderCalendarGrid(monthData, uiState);
      renderMonthlySummary(monthData, selectedYearSummary, cardProjection);
      break;
    }

    case 'annual': {
      const annualSummary = calculateYearSummary(uiState.annualYear, appState, holidayYearCache);
      renderAnnualView(annualSummary);
      break;
    }

    case 'fares': {
      renderFaresView(appState);
      break;
    }

    case 'holidays': {
      renderHolidaysView(uiState.holidaysYear, appState);
      break;
    }

    case 'backup': {
      renderBackupView(appState);
      break;
    }

    default:
      break;
  }

  // Atualiza o modal de detalhes da caixinha caso permaneça aberto
  if (uiState.activeBoxDetailId) {
    const summary =
      uiState.activeView === 'caixinhas' || uiState.activeView === 'dashboard'
        ? uiState.lastCaixinhasSummary
        : calculateAllCaixinhas(appState, {
            nationalHolidayCache,
            targetYM: getYearMonthKey(uiState.selectedYear, uiState.selectedMonth)
          });
    uiState.lastCaixinhasSummary = summary;
    const activeBoxPerf = summary?.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (activeBoxPerf) {
      renderBoxDetailModal(activeBoxPerf, summary.cdiAnnualRate, uiState.boxSimMonthlyCents);
    } else {
      uiState.activeBoxDetailId = null;
      closeModal('caixinha-detail-modal');
    }
  }
}

// ============================================================
// Inicialização
// ============================================================

function init() {
  initModalManager();
  setRenderCallback(renderAll);
  populateCategorySelects();

  bindSettingsAndNavEvents({
    onAfterStateReplace: () => {
      resetFareFormToDefaults();
      resetCustomHolidayForm();
    }
  });
  bindTransportEvents();
  bindFinanceEvents();
  bindCaixinhasEvents();

  resetFareFormToDefaults();
  renderAll();
  setupPWA();
}

init();
