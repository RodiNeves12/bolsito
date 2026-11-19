/**
 * Store centralizado de estado persistente (`appState`) e estado efêmero da UI (`uiState`).
 * Concentra leitura, persistência com aviso de erro e disparo da renderização seletiva.
 */

import { getTodayStr, splitDateStr } from './holidays.js';
import { loadState, resetState, saveState } from './state.js';
import { showToast } from './ui.js';

let appState = loadState();
let renderCallback = null;

const todayParts = splitDateStr(getTodayStr());

export const uiState = {
  activeView: 'dashboard', // 'dashboard' | 'flow' | 'caixinhas' | 'monthly' | 'annual' | 'fares' | 'holidays' | 'backup'
  selectedYear: todayParts.year,
  selectedMonth: todayParts.month, // 1..12
  annualYear: todayParts.year,
  holidaysYear: todayParts.year,
  clickMode: 'popover', // 'popover' | 'nao_gastei' | 'meia_viagem' | 'normal'
  rangeMode: false,
  rangeStart: null, // 'YYYY-MM-DD'
  rangeEnd: null, // 'YYYY-MM-DD'
  activeModalDate: null, // 'YYYY-MM-DD'
  flowTab: 'all', // 'all' | 'fixed' | 'installments' | 'variable'
  variableFilterCategory: 'all',
  variableSearchQuery: '',
  evolutionSeries: {
    income: true,
    expenses: true,
    contributions: true
  },
  projectionIncludeDaily: false,
  activeBoxDetailId: null,
  boxSimMonthlyCents: 0,
  lastCaixinhasSummary: null,
  lastFinanceMonth: null,
  lastDashboardBundle: null,
  lastRenderedDateStr: getTodayStr(),
  pendingImportState: null,
  deferredInstallPrompt: null
};

export function getAppState() {
  return appState;
}

export function replaceAppState(nextState) {
  appState = nextState;
}

export function resetAppState() {
  appState = resetState();
  return appState;
}

export function setRenderCallback(fn) {
  renderCallback = fn;
}

export function requestRender() {
  if (typeof renderCallback === 'function') {
    renderCallback();
  }
}

export function persistStateOrWarn() {
  const ok = saveState(appState);
  if (!ok) {
    showToast(
      'Atenção: não foi possível salvar no navegador (armazenamento cheio ou restrito). Exporte um backup JSON.',
      'error'
    );
  }
  return ok;
}

export function persistAndRender() {
  persistStateOrWarn();
  requestRender();
}

export function goToMonth(year, month) {
  let y = year;
  let m = month;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  uiState.selectedYear = y;
  uiState.selectedMonth = m;
  requestRender();
}
