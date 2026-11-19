/**
 * Ponto de Entrada, Inicialização e Coordenação de Eventos da Aplicação.
 * 100% ES Modules nativo, offline-first, sem dependências externas.
 */

import {
  calculateCardProjection,
  calculateDay,
  calculateMonth,
  calculateRangeSummary,
  calculateYearSummary,
  getActiveFareSchedule
} from './calculator.js';
import { calculateAllCaixinhas } from './cdiEngine.js';
import {
  calculateConsolidatedNetWorth,
  calculateFinance12Months,
  calculateFinanceMonth,
  parseYM
} from './financeEngine.js';
import {
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
  renderBoxDetailModal,
  renderCaixinhasView,
  renderDashboardView,
  renderFlowView,
  setCaixinhaKindSelection
} from './financeUI.js';
import {
  buildDateForYearMonth,
  formatDisplayDate,
  getBuiltInHolidaysForYear,
  getCurrentDateTimeLabel,
  getTodayStr,
  getYearMonthKey,
  isValidDateStr,
  MONTH_NAMES,
  splitDateStr
} from './holidays.js';
import {
  centsToInputValue,
  exportStateAsJSON,
  formatBRL,
  generateId,
  loadState,
  parseCurrencyToCents,
  parsePercentageRate,
  resetState,
  saveState,
  sortFareSchedules,
  VALID_PALETTES,
  validateAndSanitizeState
} from './state.js';
import {
  applyPrivacyMode,
  applyTheme,
  closeBuiltInHolidayModal,
  closeDayModal,
  escapeHtml,
  openBuiltInHolidayModal,
  openDayModal,
  populateMonthYearSelectors,
  renderAnnualView,
  renderBackupView,
  renderCalendarGrid,
  renderCalendarInteractionState,
  renderCardBalance,
  renderFaresView,
  renderHolidaysView,
  renderMonthlySummary,
  setActiveView,
  showToast
} from './ui.js';

// ============================================================
// Estado Persistente + Estado Efêmero da Interface
// ============================================================

let appState = loadState();

const todayParts = splitDateStr(getTodayStr());

const uiState = {
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
  pendingImportState: null,
  deferredInstallPrompt: null
};

// ============================================================
// Renderização Centralizada
// ============================================================

function persistAndRender() {
  saveState(appState);
  renderAll();
}

function renderAll() {
  const holidayYearCache = new Map();
  const nationalHolidayCache = new Map();

  // 1. Tema, paleta, privacidade e navegação
  applyTheme(appState.theme, appState.palette);
  applyPrivacyMode(appState.privacyMode);
  setActiveView(uiState.activeView);

  // 2. Projeção do Saldo do Cartão (sempre atualizada na visão mensal)
  const cardProjection = calculateCardProjection(appState, holidayYearCache);
  renderCardBalance(cardProjection, appState);

  // 3. Visão Mensal (Passagens)
  populateMonthYearSelectors(uiState.selectedYear, uiState.selectedMonth);
  const monthData = calculateMonth(
    uiState.selectedYear,
    uiState.selectedMonth,
    appState,
    holidayYearCache
  );
  const selectedYearSummary = calculateYearSummary(
    uiState.selectedYear,
    appState,
    holidayYearCache
  );
  const rangeSummary =
    uiState.rangeStart && uiState.rangeEnd
      ? calculateRangeSummary(uiState.rangeStart, uiState.rangeEnd, appState, holidayYearCache)
      : null;

  renderCalendarInteractionState(uiState, rangeSummary);
  renderCalendarGrid(monthData, uiState);
  renderMonthlySummary(monthData, selectedYearSummary, cardProjection);

  // 4. Visão Anual (Passagens)
  const annualSummary =
    uiState.annualYear === uiState.selectedYear
      ? selectedYearSummary
      : calculateYearSummary(uiState.annualYear, appState, holidayYearCache);
  renderAnnualView(annualSummary);

  // 5. Domínio Financeiro Bolsito (Dashboard, Fluxo Mensal e Caixinhas CDI)
  const financeMonth = calculateFinanceMonth(uiState.selectedYear, uiState.selectedMonth, appState, {
    holidayYearCache,
    transportMonth: monthData
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
  uiState.lastCaixinhasSummary = caixinhasSummary;
  uiState.lastFinanceMonth = financeMonth;

  renderDashboardView(financeMonth, finance12m, caixinhasSummary, uiState, netWorth);
  renderFlowView(financeMonth, uiState);
  renderCaixinhasView(caixinhasSummary);

  // Atualiza o modal de detalhes da caixinha se estiver aberto
  if (uiState.activeBoxDetailId) {
    const activeBoxPerf = caixinhasSummary.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (activeBoxPerf) {
      renderBoxDetailModal(activeBoxPerf, caixinhasSummary.cdiAnnualRate, uiState.boxSimMonthlyCents);
    } else {
      uiState.activeBoxDetailId = null;
      document.getElementById('caixinha-detail-modal')?.classList.add('hidden');
    }
  }

  // 6. Tarifas, Feriados e Backup
  renderFaresView(appState);
  renderHolidaysView(uiState.holidaysYear, appState);
  renderBackupView(appState);
}

// ============================================================
// Ações de Navegação e Tema
// ============================================================

function goToMonth(year, month) {
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
  renderAll();
}

function toggleTheme() {
  const currentEffective = document.documentElement.getAttribute('data-theme');
  appState.theme = currentEffective === 'dark' ? 'light' : 'dark';
  persistAndRender();
}

function togglePrivacyMode() {
  appState.privacyMode = !appState.privacyMode;
  saveState(appState);
  applyPrivacyMode(appState.privacyMode);
  showToast(
    appState.privacyMode ? 'Modo Privacidade ativado (valores ocultos).' : 'Modo Privacidade desativado.'
  );
}

function isTypingElement(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function setMobileMoreSheetOpen(isOpen) {
  const sheet = document.getElementById('mobile-more-sheet');
  const backdrop = document.getElementById('mobile-more-backdrop');
  const trigger = document.getElementById('btn-mobile-more-nav');
  if (!sheet || !backdrop) return;
  sheet.classList.toggle('hidden', !isOpen);
  backdrop.classList.toggle('hidden', !isOpen);
  if (trigger) {
    trigger.setAttribute('aria-expanded', String(isOpen));
  }
}

// ============================================================
// Interação com Dias do Calendário e Modal
// ============================================================

function handleCalendarDayClick(dateStr) {
  if (!isValidDateStr(dateStr)) return;

  // Modo de seleção de intervalo personalizado
  if (uiState.rangeMode) {
    if (!uiState.rangeStart || (uiState.rangeStart && uiState.rangeEnd)) {
      uiState.rangeStart = dateStr;
      uiState.rangeEnd = null;
    } else if (dateStr < uiState.rangeStart) {
      uiState.rangeEnd = uiState.rangeStart;
      uiState.rangeStart = dateStr;
    } else {
      uiState.rangeEnd = dateStr;
    }
    renderAll();
    return;
  }

  // Modo Clique Rápido (1 clique direto na célula)
  if (uiState.clickMode !== 'popover') {
    const dayCalc = calculateDay(dateStr, appState);
    const existing = appState.exceptions[dateStr];
    const preservedNote = existing?.note;

    if (uiState.clickMode === 'nao_gastei') {
      if (existing?.type === 'nao_gastei') {
        delete appState.exceptions[dateStr];
        showToast(`${formatDisplayDate(dateStr)} restaurado.`);
      } else {
        appState.exceptions[dateStr] = preservedNote
          ? { type: 'nao_gastei', note: preservedNote }
          : { type: 'nao_gastei' };
        showToast(`${formatDisplayDate(dateStr)} marcado como Não gastei.`, 'success');
      }
    } else if (uiState.clickMode === 'meia_viagem') {
      if (existing?.type === 'meia_viagem') {
        delete appState.exceptions[dateStr];
        showToast(`${formatDisplayDate(dateStr)} restaurado.`);
      } else {
        appState.exceptions[dateStr] = preservedNote
          ? { type: 'meia_viagem', note: preservedNote }
          : { type: 'meia_viagem' };
        showToast(`${formatDisplayDate(dateStr)} marcado como Meia viagem (50%).`, 'success');
      }
    } else if (uiState.clickMode === 'normal') {
      if (dayCalc.holiday) {
        if (existing?.type === 'forcar_normal') {
          delete appState.exceptions[dateStr];
          showToast(`${formatDisplayDate(dateStr)} voltou a ser feriado.`);
        } else {
          appState.exceptions[dateStr] = preservedNote
            ? { type: 'forcar_normal', note: preservedNote }
            : { type: 'forcar_normal' };
          showToast(`${formatDisplayDate(dateStr)}: tarifa normal forçada no feriado.`, 'success');
        }
      } else {
        delete appState.exceptions[dateStr];
        showToast(`${formatDisplayDate(dateStr)} restaurado para Normal.`);
      }
    }

    persistAndRender();
    return;
  }

  // Modo Popover/Modal padrão
  uiState.activeModalDate = dateStr;
  const dayCalc = calculateDay(dateStr, appState);
  openDayModal(dayCalc);
}

function applyDayQuickAction(actionType) {
  const dateStr = uiState.activeModalDate;
  if (!dateStr) return;

  const dayCalc = calculateDay(dateStr, appState);
  const noteInput = document.getElementById('input-day-note');
  const note = noteInput ? noteInput.value.trim().slice(0, 120) : '';

  if (actionType === 'normal') {
    if (dayCalc.holiday) {
      appState.exceptions[dateStr] = note
        ? { type: 'forcar_normal', note }
        : { type: 'forcar_normal' };
      showToast('Tarifa normal forçada neste feriado.', 'success');
    } else if (note) {
      appState.exceptions[dateStr] = { type: 'forcar_normal', note };
      showToast('Dia mantido como normal com nota salva.', 'success');
    } else {
      delete appState.exceptions[dateStr];
      showToast('Dia restaurado para Normal.');
    }
  } else if (actionType === 'nao_gastei') {
    appState.exceptions[dateStr] = note
      ? { type: 'nao_gastei', note }
      : { type: 'nao_gastei' };
    showToast('Marcado como Não gastei (R$ 0,00).', 'success');
  } else if (actionType === 'meia_viagem') {
    appState.exceptions[dateStr] = note
      ? { type: 'meia_viagem', note }
      : { type: 'meia_viagem' };
    showToast('Marcado como Meia viagem (50%).', 'success');
  }

  closeDayModal();
  uiState.activeModalDate = null;
  persistAndRender();
}

function saveDayNoteOnly() {
  const dateStr = uiState.activeModalDate;
  if (!dateStr) return;

  const noteInput = document.getElementById('input-day-note');
  const note = noteInput ? noteInput.value.trim().slice(0, 120) : '';
  const existing = appState.exceptions[dateStr];

  if (existing) {
    if (note) {
      existing.note = note;
    } else {
      delete existing.note;
      // Se só existia forcar_normal em dia comum apenas para segurar nota, limpa
      const dayCalc = calculateDay(dateStr, appState);
      if (existing.type === 'forcar_normal' && !dayCalc.holiday) {
        delete appState.exceptions[dateStr];
      }
    }
  } else if (note) {
    // Cria exceção preservando exatamente o valor efetivo atual do dia
    const dayCalc = calculateDay(dateStr, appState);
    if (dayCalc.holiday) {
      const preservedType = dayCalc.holiday.effect === 'meia_viagem' ? 'meia_viagem' : 'nao_gastei';
      appState.exceptions[dateStr] = { type: preservedType, note };
    } else {
      appState.exceptions[dateStr] = { type: 'forcar_normal', note };
    }
  }

  closeDayModal();
  uiState.activeModalDate = null;
  showToast('Nota atualizada.', 'success');
  persistAndRender();
}

function handleDayCustomSubmit(event) {
  event.preventDefault();
  const dateStr = uiState.activeModalDate;
  if (!dateStr) return;

  const valInput = document.getElementById('input-day-custom-value');
  const noteInput = document.getElementById('input-day-note');
  const cents = parseCurrencyToCents(valInput.value);

  if (cents === null) {
    showToast('Digite um valor válido em reais (ex.: 14,10).', 'error');
    valInput.focus();
    return;
  }

  const note = noteInput.value.trim().slice(0, 120);
  appState.exceptions[dateStr] = note
    ? { type: 'valor_personalizado', customCents: cents, note }
    : { type: 'valor_personalizado', customCents: cents };

  closeDayModal();
  uiState.activeModalDate = null;
  showToast(`Valor personalizado (${formatBRL(cents)}) aplicado.`, 'success');
  persistAndRender();
}

// ============================================================
// Formulário de Tarifas e Histórico de Vigências
// ============================================================

function resetFareFormToDefaults() {
  const todayStr = getTodayStr();
  const activeToday = getActiveFareSchedule(todayStr, appState.fareSchedules);

  document.getElementById('input-fare-id').value = '';
  document.getElementById('fare-form-title').textContent = 'Nova Vigência / Reajuste';
  document.getElementById('btn-cancel-fare-edit').classList.add('hidden');
  document.getElementById('input-fare-label').value = '';
  document.getElementById('input-fare-date').value = todayStr;

  const baseWeekdays = activeToday ? activeToday.weekdays : [0, 940, 940, 940, 940, 940, 0];
  for (let d = 0; d < 7; d++) {
    const input = document.getElementById(`fare-day-${d}`);
    if (input) input.value = centsToInputValue(baseWeekdays[d]);
  }
}

function startEditFareSchedule(id) {
  const sched = appState.fareSchedules.find((s) => s.id === id);
  if (!sched) return;

  document.getElementById('input-fare-id').value = sched.id;
  document.getElementById('fare-form-title').textContent = `Editando: ${sched.label}`;
  document.getElementById('btn-cancel-fare-edit').classList.remove('hidden');
  document.getElementById('input-fare-label').value = sched.label;
  document.getElementById('input-fare-date').value = sched.effectiveDate;

  for (let d = 0; d < 7; d++) {
    const input = document.getElementById(`fare-day-${d}`);
    if (input) input.value = centsToInputValue(sched.weekdays[d]);
  }

  document.getElementById('input-fare-label').focus();
}

function handleFareFormSubmit(event) {
  event.preventDefault();

  const editingId = document.getElementById('input-fare-id').value.trim();
  const label = document.getElementById('input-fare-label').value.trim();
  const effectiveDate = document.getElementById('input-fare-date').value;

  if (!label) {
    showToast('Informe uma descrição para a vigência.', 'error');
    return;
  }
  if (!isValidDateStr(effectiveDate)) {
    showToast('Informe uma data de início de vigência válida.', 'error');
    return;
  }

  // Impede duplicidade de data de vigência
  const duplicate = appState.fareSchedules.find(
    (s) => s.effectiveDate === effectiveDate && s.id !== editingId
  );
  if (duplicate) {
    showToast(
      `Já existe uma vigência iniciando em ${formatDisplayDate(effectiveDate)}. Edite a existente ou escolha outra data.`,
      'error'
    );
    return;
  }

  const weekdays = [];
  for (let d = 0; d < 7; d++) {
    const input = document.getElementById(`fare-day-${d}`);
    const cents = parseCurrencyToCents(input.value);
    if (cents === null) {
      showToast('Verifique os valores dos dias da semana (use formato ex.: 9,40).', 'error');
      input.focus();
      return;
    }
    weekdays[d] = cents;
  }

  if (editingId) {
    const idx = appState.fareSchedules.findIndex((s) => s.id === editingId);
    if (idx !== -1) {
      appState.fareSchedules[idx] = {
        ...appState.fareSchedules[idx],
        label: label.slice(0, 80),
        effectiveDate,
        weekdays
      };
    }
    showToast('Vigência atualizada com sucesso!', 'success');
  } else {
    appState.fareSchedules.push({
      id: generateId('sched'),
      label: label.slice(0, 80),
      effectiveDate,
      weekdays
    });
    showToast('Nova vigência de tarifa cadastrada!', 'success');
  }

  appState.fareSchedules = sortFareSchedules(appState.fareSchedules);
  resetFareFormToDefaults();
  persistAndRender();
}

function deleteFareSchedule(id) {
  if (appState.fareSchedules.length <= 1) {
    showToast('É necessário manter pelo menos uma tabela de tarifas ativa.', 'error');
    return;
  }
  const target = appState.fareSchedules.find((s) => s.id === id);
  if (!target) return;

  if (!window.confirm(`Excluir a vigência "${target.label}" (${formatDisplayDate(target.effectiveDate)})?`)) {
    return;
  }

  appState.fareSchedules = appState.fareSchedules.filter((s) => s.id !== id);
  resetFareFormToDefaults();
  showToast('Vigência removida.');
  persistAndRender();
}

// ============================================================
// Gestão de Feriados (Embutidos e Manuais)
// ============================================================

function resetCustomHolidayForm() {
  document.getElementById('input-custom-holiday-id').value = '';
  document.getElementById('custom-holiday-form-title').textContent =
    'Adicionar Feriado, Emenda ou Férias';
  document.getElementById('btn-cancel-holiday-edit').classList.add('hidden');
  document.getElementById('input-custom-holiday-name').value = '';
  document.getElementById('input-custom-holiday-start').value = '';
  document.getElementById('input-custom-holiday-end').value = '';
  document.getElementById('select-custom-holiday-category').value = 'Emenda';
  document.getElementById('select-custom-holiday-effect').value = 'zero';
}

function startEditCustomHoliday(id) {
  const item = appState.customHolidays.find((h) => h.id === id);
  if (!item) return;

  document.getElementById('input-custom-holiday-id').value = item.id;
  document.getElementById('custom-holiday-form-title').textContent = `Editando: ${item.name}`;
  document.getElementById('btn-cancel-holiday-edit').classList.remove('hidden');
  document.getElementById('input-custom-holiday-name').value = item.name;
  document.getElementById('input-custom-holiday-start').value = item.startDate;
  document.getElementById('input-custom-holiday-end').value =
    item.endDate && item.endDate !== item.startDate ? item.endDate : '';
  document.getElementById('select-custom-holiday-category').value = item.category || 'Manual';
  document.getElementById('select-custom-holiday-effect').value = item.effect || 'zero';
  document.getElementById('input-custom-holiday-name').focus();
}

function handleCustomHolidaySubmit(event) {
  event.preventDefault();

  const editingId = document.getElementById('input-custom-holiday-id').value.trim();
  const name = document.getElementById('input-custom-holiday-name').value.trim();
  const startDate = document.getElementById('input-custom-holiday-start').value;
  const rawEndDate = document.getElementById('input-custom-holiday-end').value;
  const category = document.getElementById('select-custom-holiday-category').value;
  const effect = document.getElementById('select-custom-holiday-effect').value;

  if (!name || !isValidDateStr(startDate)) {
    showToast('Preencha o nome e uma data inicial válida.', 'error');
    return;
  }

  let endDate = startDate;
  if (rawEndDate) {
    if (!isValidDateStr(rawEndDate)) {
      showToast('Data final inválida.', 'error');
      return;
    }
    if (rawEndDate < startDate) {
      showToast('A data final não pode ser anterior à data inicial.', 'error');
      return;
    }
    endDate = rawEndDate;
  }

  if (editingId) {
    const idx = appState.customHolidays.findIndex((h) => h.id === editingId);
    if (idx !== -1) {
      appState.customHolidays[idx] = {
        ...appState.customHolidays[idx],
        name: name.slice(0, 80),
        startDate,
        endDate,
        category,
        effect
      };
    }
    showToast('Evento atualizado!', 'success');
  } else {
    appState.customHolidays.push({
      id: generateId('hol'),
      name: name.slice(0, 80),
      startDate,
      endDate,
      enabled: true,
      category,
      effect
    });
    showToast('Feriado/recesso adicionado!', 'success');
  }

  resetCustomHolidayForm();
  persistAndRender();
}

// ============================================================
// Importação de Backup JSON com Validação e Confirmação
// ============================================================

async function handleImportFileSelected(event) {
  const file = event.target.files?.[0];
  const previewBox = document.getElementById('import-preview-box');
  if (!file || !previewBox) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const validation = validateAndSanitizeState(parsed);

    if (!validation.valid) {
      uiState.pendingImportState = null;
      previewBox.classList.remove('hidden');
      previewBox.innerHTML = `
        <strong class="text-danger">Arquivo inválido:</strong>
        <p class="helper-text">${escapeHtml(validation.error)}</p>
      `;
      showToast('Erro na validação do arquivo de backup.', 'error');
      return;
    }

    const s = validation.sanitized;
    uiState.pendingImportState = s;
    const fin = s.finance || {};
    const migrationNote = validation.migratedFromV1
      ? '<br />• <strong>Backup v1 detectado:</strong> será migrado automaticamente para o formato v2 (Bolsito) sem perda.'
      : '';

    previewBox.classList.remove('hidden');
    previewBox.innerHTML = `
      <strong>Backup validado (${escapeHtml(file.name)}):</strong>
      <p class="helper-text">
        • Passagens: ${s.fareSchedules.length} vigência(s), ${Object.keys(s.exceptions).length} exceção(ões), ${Object.keys(s.monthlyRecharges).length} recarga(s), ${s.customHolidays.length} feriado(s) manual(is)<br />
        • Financeiro: ${(fin.expenses?.fixed || []).length} conta(s) fixa(s), ${(fin.expenses?.installments || []).length} parcelamento(s), ${(fin.expenses?.variable || []).length} gasto(s) avulso(s), ${(fin.caixinhas?.boxes || []).length} caixinha(s)<br />
        • Saldo do cartão: <strong class="money">${formatBRL(s.cardBalance.cents)}</strong>${migrationNote}
      </p>
      <div class="import-preview-actions">
        <button type="button" id="btn-confirm-import" class="btn btn-primary btn-sm">
          Confirmar e sobrescrever dados
        </button>
        <button type="button" id="btn-cancel-import" class="btn btn-ghost btn-sm">
          Cancelar
        </button>
      </div>
    `;
  } catch {
    uiState.pendingImportState = null;
    previewBox.classList.remove('hidden');
    previewBox.innerHTML =
      '<strong class="text-danger">Não foi possível ler o arquivo JSON.</strong><p class="helper-text">Verifique se o arquivo não está corrompido.</p>';
    showToast('Arquivo JSON inválido.', 'error');
  } finally {
    // Permite selecionar o mesmo arquivo novamente se necessário
    event.target.value = '';
  }
}

// ============================================================
// Registro de Eventos
// ============================================================

function bindEvents() {
  // Navegação principal por abas (sidebar desktop + bottom nav mobile)
  document.querySelectorAll('.nav-tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      uiState.activeView = tab.dataset.view;
      setMobileMoreSheetOpen(false);
      renderAll();
    });
  });

  // Menu mobile "Mais" (acesso às visões secundárias em < 960px)
  document.getElementById('btn-mobile-more-nav')?.addEventListener('click', () => {
    const sheet = document.getElementById('mobile-more-sheet');
    const willOpen = sheet ? sheet.classList.contains('hidden') : false;
    setMobileMoreSheetOpen(willOpen);
  });

  document.getElementById('btn-close-mobile-more')?.addEventListener('click', () => {
    setMobileMoreSheetOpen(false);
  });

  document.getElementById('mobile-more-backdrop')?.addEventListener('click', () => {
    setMobileMoreSheetOpen(false);
  });

  document.querySelectorAll('.mobile-more-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.activeView = btn.dataset.view;
      setMobileMoreSheetOpen(false);
      renderAll();
    });
  });

  // Botão "Hoje" global
  document.getElementById('btn-today-global')?.addEventListener('click', () => {
    const now = splitDateStr(getTodayStr());
    uiState.selectedYear = now.year;
    uiState.selectedMonth = now.month;
    renderAll();
  });

  // Modo Privacidade (botão na sidebar)
  document.getElementById('btn-privacy-toggle')?.addEventListener('click', togglePrivacyMode);

  // Alternar tema claro/escuro e paleta de cores
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('select-theme-pref')?.addEventListener('change', (e) => {
    appState.theme = e.target.value;
    persistAndRender();
  });

  document.querySelectorAll('[data-theme-pref]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTheme = btn.dataset.themePref;
      if (['light', 'dark', 'auto'].includes(nextTheme)) {
        appState.theme = nextTheme;
        persistAndRender();
      }
    });
  });

  document.querySelectorAll('[data-palette-choice]').forEach((card) => {
    card.addEventListener('click', () => {
      const nextPalette = card.dataset.paletteChoice;
      if (VALID_PALETTES.includes(nextPalette)) {
        appState.palette = nextPalette;
        persistAndRender();
      }
    });
  });

  // Reage à mudança de tema do sistema operacional quando tema = 'auto'
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (appState.theme === 'auto') {
        applyTheme('auto', appState.palette);
      }
    });
  }

  // Formulário de Saldo Atual do Cartão
  document.getElementById('form-card-balance')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-card-balance');
    const cents = parseCurrencyToCents(input.value);
    if (cents === null) {
      showToast('Informe um saldo válido em reais (ex.: 45,50).', 'error');
      input.focus();
      return;
    }
    appState.cardBalance = {
      cents,
      updatedAt: getCurrentDateTimeLabel()
    };
    showToast(`Saldo atualizado para ${formatBRL(cents)}.`, 'success');
    persistAndRender();
  });

  // Preferência: Incluir hoje na projeção do saldo (sincronizada nos 2 checkboxes)
  const handleIncludeTodayChange = (checked) => {
    appState.settings.includeTodayInProjection = checked;
    persistAndRender();
  };
  document.getElementById('chk-include-today')?.addEventListener('change', (e) => {
    handleIncludeTodayChange(e.target.checked);
  });
  document.getElementById('chk-include-today-settings')?.addEventListener('change', (e) => {
    handleIncludeTodayChange(e.target.checked);
  });

  // Navegação do calendário mensal
  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    goToMonth(uiState.selectedYear, uiState.selectedMonth - 1);
  });
  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    goToMonth(uiState.selectedYear, uiState.selectedMonth + 1);
  });
  document.getElementById('select-month')?.addEventListener('change', (e) => {
    goToMonth(uiState.selectedYear, Number(e.target.value));
  });
  document.getElementById('select-year')?.addEventListener('change', (e) => {
    goToMonth(Number(e.target.value), uiState.selectedMonth);
  });

  // Modos de clique rápido
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.rangeMode = false;
      uiState.clickMode = btn.dataset.clickMode;
      renderAll();
    });
  });

  // Modo intervalo personalizado
  document.getElementById('btn-toggle-range-mode')?.addEventListener('click', () => {
    uiState.rangeMode = !uiState.rangeMode;
    renderAll();
  });

  document.getElementById('input-range-start')?.addEventListener('change', (e) => {
    uiState.rangeStart = isValidDateStr(e.target.value) ? e.target.value : null;
    if (uiState.rangeStart && uiState.rangeEnd && uiState.rangeStart > uiState.rangeEnd) {
      [uiState.rangeStart, uiState.rangeEnd] = [uiState.rangeEnd, uiState.rangeStart];
    }
    renderAll();
  });

  document.getElementById('input-range-end')?.addEventListener('change', (e) => {
    uiState.rangeEnd = isValidDateStr(e.target.value) ? e.target.value : null;
    if (uiState.rangeStart && uiState.rangeEnd && uiState.rangeStart > uiState.rangeEnd) {
      [uiState.rangeStart, uiState.rangeEnd] = [uiState.rangeEnd, uiState.rangeStart];
    }
    renderAll();
  });

  document.getElementById('btn-clear-range')?.addEventListener('click', () => {
    uiState.rangeStart = null;
    uiState.rangeEnd = null;
    uiState.rangeMode = false;
    renderAll();
  });

  // Delegação de clique nos dias da grade do calendário
  document.getElementById('calendar-grid')?.addEventListener('click', (e) => {
    const cell = e.target.closest('.day-cell');
    if (!cell || !cell.dataset.date) return;
    handleCalendarDayClick(cell.dataset.date);
  });

  // Recarga efetiva do mês (opcional)
  document.getElementById('form-monthly-recharge')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-monthly-recharge');
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    const raw = input.value.trim();

    if (!raw) {
      delete appState.monthlyRecharges[ym];
      showToast('Recarga efetiva removida; voltando ao cálculo automático.');
      persistAndRender();
      return;
    }

    const cents = parseCurrencyToCents(raw);
    if (cents === null) {
      showToast('Digite um valor válido para a recarga efetiva.', 'error');
      input.focus();
      return;
    }

    appState.monthlyRecharges[ym] = cents;
    showToast(`Recarga efetiva de ${formatBRL(cents)} salva para este mês.`, 'success');
    persistAndRender();
  });

  document.getElementById('btn-clear-monthly-recharge')?.addEventListener('click', () => {
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    delete appState.monthlyRecharges[ym];
    showToast('Recarga efetiva removida.');
    persistAndRender();
  });

  // Modal do Dia
  document.getElementById('btn-close-day-modal')?.addEventListener('click', () => {
    closeDayModal();
    uiState.activeModalDate = null;
  });

  document.getElementById('day-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'day-modal-backdrop') {
      closeDayModal();
      uiState.activeModalDate = null;
    }
  });

  document.querySelectorAll('[data-day-action]').forEach((btn) => {
    btn.addEventListener('click', () => applyDayQuickAction(btn.dataset.dayAction));
  });

  document.getElementById('btn-day-save-note')?.addEventListener('click', saveDayNoteOnly);
  document.getElementById('form-day-custom')?.addEventListener('submit', handleDayCustomSubmit);

  document.getElementById('btn-day-clear-exception')?.addEventListener('click', () => {
    if (!uiState.activeModalDate) return;
    delete appState.exceptions[uiState.activeModalDate];
    closeDayModal();
    uiState.activeModalDate = null;
    showToast('Exceção removida.');
    persistAndRender();
  });

  // Visão Anual: navegação de ano e clique no gráfico/tabela para abrir mês
  document.getElementById('btn-annual-prev-year')?.addEventListener('click', () => {
    uiState.annualYear -= 1;
    renderAll();
  });
  document.getElementById('btn-annual-next-year')?.addEventListener('click', () => {
    uiState.annualYear += 1;
    renderAll();
  });

  const openMonthFromAnnual = (monthNum) => {
    if (!monthNum) return;
    uiState.selectedYear = uiState.annualYear;
    uiState.selectedMonth = Number(monthNum);
    uiState.activeView = 'monthly';
    renderAll();
  };

  document.getElementById('annual-chart')?.addEventListener('click', (e) => {
    const col = e.target.closest('[data-open-month]');
    if (col) openMonthFromAnnual(col.dataset.openMonth);
  });

  document.getElementById('annual-table-body')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-open-month]');
    if (row) openMonthFromAnnual(row.dataset.openMonth);
  });

  document.getElementById('annual-table-body')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest('[data-open-month]');
      if (row) {
        e.preventDefault();
        openMonthFromAnnual(row.dataset.openMonth);
      }
    }
  });

  // Tarifas e Histórico
  document.getElementById('btn-copy-mon-to-weekdays')?.addEventListener('click', () => {
    const monVal = document.getElementById('fare-day-1').value;
    for (let d = 2; d <= 5; d++) {
      document.getElementById(`fare-day-${d}`).value = monVal;
    }
    showToast('Valor de Segunda copiado para Terça a Sexta.');
  });

  document.getElementById('form-fare-schedule')?.addEventListener('submit', handleFareFormSubmit);
  document.getElementById('btn-cancel-fare-edit')?.addEventListener('click', resetFareFormToDefaults);

  document.getElementById('fare-schedules-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-fare]');
    if (editBtn) {
      startEditFareSchedule(editBtn.dataset.editFare);
      return;
    }
    const delBtn = e.target.closest('[data-delete-fare]');
    if (delBtn) {
      deleteFareSchedule(delBtn.dataset.deleteFare);
    }
  });

  // Feriados: troca de ano
  document.getElementById('btn-holidays-prev-year')?.addEventListener('click', () => {
    uiState.holidaysYear -= 1;
    renderAll();
  });
  document.getElementById('btn-holidays-next-year')?.addEventListener('click', () => {
    uiState.holidaysYear += 1;
    renderAll();
  });

  // Feriados Embutidos: toggle 1-clique e edição
  document.getElementById('builtin-holidays-list')?.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-toggle-builtin-holiday]');
    if (!toggle) return;
    const key = toggle.dataset.toggleBuiltinHoliday;
    appState.holidayOverrides[key] = {
      ...(appState.holidayOverrides[key] || {}),
      enabled: toggle.checked
    };
    persistAndRender();
  });

  document.getElementById('builtin-holidays-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-builtin-holiday]');
    if (!editBtn) return;
    const key = editBtn.dataset.editBuiltinHoliday;
    const list = getBuiltInHolidaysForYear(uiState.holidaysYear, appState.holidayOverrides);
    const target = list.find((h) => h.key === key);
    if (target) openBuiltInHolidayModal(target);
  });

  // Modal de edição de feriado embutido
  document.getElementById('btn-close-builtin-modal')?.addEventListener('click', closeBuiltInHolidayModal);
  document.getElementById('builtin-holiday-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'builtin-holiday-modal') closeBuiltInHolidayModal();
  });

  document.getElementById('form-edit-builtin-holiday')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('input-builtin-key').value;
    const name = document.getElementById('input-builtin-name').value.trim();
    const effect = document.getElementById('select-builtin-effect').value;
    if (!key || !name) return;

    appState.holidayOverrides[key] = {
      ...(appState.holidayOverrides[key] || {}),
      name: name.slice(0, 80),
      effect: effect === 'meia_viagem' ? 'meia_viagem' : 'zero'
    };
    closeBuiltInHolidayModal();
    showToast('Feriado atualizado.', 'success');
    persistAndRender();
  });

  document.getElementById('btn-reset-builtin-name')?.addEventListener('click', () => {
    const key = document.getElementById('input-builtin-key').value;
    if (!key) return;
    delete appState.holidayOverrides[key];
    closeBuiltInHolidayModal();
    showToast('Feriado restaurado ao padrão.');
    persistAndRender();
  });

  // Feriados Manuais / Emendas / Recessos
  document.getElementById('form-custom-holiday')?.addEventListener('submit', handleCustomHolidaySubmit);
  document.getElementById('btn-cancel-holiday-edit')?.addEventListener('click', resetCustomHolidayForm);

  document.getElementById('custom-holidays-list')?.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-toggle-custom-holiday]');
    if (!toggle) return;
    const id = toggle.dataset.toggleCustomHoliday;
    const target = appState.customHolidays.find((h) => h.id === id);
    if (target) {
      target.enabled = toggle.checked;
      persistAndRender();
    }
  });

  document.getElementById('custom-holidays-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-custom-holiday]');
    if (editBtn) {
      startEditCustomHoliday(editBtn.dataset.editCustomHoliday);
      return;
    }
    const delBtn = e.target.closest('[data-delete-custom-holiday]');
    if (delBtn) {
      const id = delBtn.dataset.deleteCustomHoliday;
      const target = appState.customHolidays.find((h) => h.id === id);
      if (!target) return;
      if (!window.confirm(`Excluir "${target.name}"?`)) return;
      appState.customHolidays = appState.customHolidays.filter((h) => h.id !== id);
      resetCustomHolidayForm();
      showToast('Evento removido.');
      persistAndRender();
    }
  });

  // Backup: Exportar, Importar e Resetar
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    exportStateAsJSON(appState);
    showToast('Backup JSON baixado!', 'success');
  });

  document.getElementById('input-import-json')?.addEventListener('change', handleImportFileSelected);

  document.getElementById('import-preview-box')?.addEventListener('click', (e) => {
    if (e.target.id === 'btn-confirm-import' && uiState.pendingImportState) {
      appState = uiState.pendingImportState;
      uiState.pendingImportState = null;
      document.getElementById('import-preview-box').classList.add('hidden');
      resetFareFormToDefaults();
      resetCustomHolidayForm();
      showToast('Backup importado com sucesso!', 'success');
      persistAndRender();
    } else if (e.target.id === 'btn-cancel-import') {
      uiState.pendingImportState = null;
      document.getElementById('import-preview-box').classList.add('hidden');
    }
  });

  document.getElementById('btn-reset-all')?.addEventListener('click', () => {
    const ok = window.confirm(
      'Tem certeza que deseja apagar TODOS os dados (rendas, despesas, caixinhas, tarifas, exceções, recargas, saldo e feriados manuais) e voltar ao padrão inicial?'
    );
    if (!ok) return;
    appState = resetState();
    uiState.rangeStart = null;
    uiState.rangeEnd = null;
    uiState.rangeMode = false;
    uiState.activeBoxDetailId = null;
    uiState.boxSimMonthlyCents = 0;
    closeAllFinanceModals();
    resetFareFormToDefaults();
    resetCustomHolidayForm();
    showToast('Dados resetados para o padrão inicial.');
    renderAll();
  });

  // ============================================================
  // Eventos do Domínio Financeiro (Dashboard, Fluxo, Caixinhas & Config)
  // ============================================================

  bindFinanceEvents();

  // Atalhos de teclado globais (Escape fecha modais; P = Privacidade; N = Novo Gasto)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDayModal();
      closeBuiltInHolidayModal();
      closeAllFinanceModals();
      setMobileMoreSheetOpen(false);
      uiState.activeModalDate = null;
      uiState.activeBoxDetailId = null;
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey || isTypingElement(e.target)) {
      return;
    }

    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      togglePrivacyMode();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      openQuickExpenseModal();
    }
  });
}

function togglePaidStatus(kind, id) {
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

function bindFinanceEvents() {
  // Botão global "+ Novo Gasto"
  document.getElementById('btn-quick-new-expense')?.addEventListener('click', () => {
    openQuickExpenseModal();
  });

  // Delegação global para botões rápidos [data-open-quick-expense] e [data-goto-view]
  document.addEventListener('click', (e) => {
    const quickBtn = e.target.closest('[data-open-quick-expense]');
    if (quickBtn) {
      openQuickExpenseModal();
      return;
    }

    const gotoBtn = e.target.closest('[data-goto-view]');
    if (gotoBtn) {
      uiState.activeView = gotoBtn.dataset.gotoView;
      renderAll();
      return;
    }

    const closeFinBtn = e.target.closest('[data-close-finance-modal]');
    if (closeFinBtn) {
      closeAllFinanceModals();
      uiState.activeBoxDetailId = null;
      return;
    }

    if (e.target.classList.contains('modal-backdrop') && e.target.id !== 'day-modal-backdrop' && e.target.id !== 'builtin-holiday-modal') {
      closeAllFinanceModals();
      uiState.activeBoxDetailId = null;
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

  // Clique em chips da legenda do gráfico 12m (liga/desliga série e recalcula escala Y)
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
      renderAll();
    });
  });

  // Clique em coluna do gráfico Evolução 12 Meses abre o mês selecionado
  document.getElementById('dashboard-evolution-chart')?.addEventListener('click', (e) => {
    const col = e.target.closest('[data-select-finance-ym]');
    if (!col) return;
    const parsed = parseYM(col.dataset.selectFinanceYm);
    if (parsed) {
      goToMonth(parsed.year, parsed.month);
    }
  });

  // Toggle rápido "Incluir conta diária" na Projeção 12m das Caixinhas
  document.getElementById('chk-proj-include-daily')?.addEventListener('change', (e) => {
    uiState.projectionIncludeDaily = Boolean(e.target.checked);
    renderAll();
  });

  // Toggle 1-clique "A receber / Recebida" para a Bolsa / Renda Mensal Fixa do mês selecionado
  document.getElementById('btn-toggle-base-income-received')?.addEventListener('click', () => {
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    if (
      !appState.finance.income.baseReceivedByMonth ||
      typeof appState.finance.income.baseReceivedByMonth !== 'object'
    ) {
      appState.finance.income.baseReceivedByMonth = {};
    }
    const nextVal = !Boolean(appState.finance.income.baseReceivedByMonth[ym]);
    appState.finance.income.baseReceivedByMonth[ym] = nextVal;
    showToast(
      nextVal ? 'Renda mensal fixa marcada como recebida.' : 'Renda mensal fixa marcada como a receber.',
      nextVal ? 'success' : 'default'
    );
    persistAndRender();
  });

  // Toggle rápido de pendências no Dashboard (checkbox)
  document.getElementById('dashboard-pending-list')?.addEventListener('change', (e) => {
    const chk = e.target.closest('[data-toggle-paid-kind]');
    if (!chk) return;
    togglePaidStatus(chk.dataset.togglePaidKind, chk.dataset.togglePaidId);
  });

  // Parâmetros Financeiros em Backup e Config (Renda fixa + CDI anual)
  document.getElementById('form-finance-params')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const baseInput = document.getElementById('input-config-base-income');
    const cdiInput = document.getElementById('input-config-cdi-rate');

    const baseCents = parseCurrencyToCents(baseInput.value || '0');
    const cdiRate = parsePercentageRate(cdiInput.value, { min: 0, max: 200 });

    if (baseCents === null) {
      showToast('Informe um valor válido para a renda mensal fixa.', 'error');
      baseInput.focus();
      return;
    }
    if (cdiRate === null) {
      showToast('Informe uma taxa CDI anual válida (ex.: 10,65).', 'error');
      cdiInput.focus();
      return;
    }

    appState.finance.income.baseMonthly = baseCents;
    appState.finance.caixinhas.cdiAnnualRate = cdiRate;
    showToast('Parâmetros financeiros atualizados!', 'success');
    persistAndRender();
  });

  // Renda mensal fixa rápida no Fluxo Mensal
  document.getElementById('form-flow-base-income')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-flow-base-income');
    const cents = parseCurrencyToCents(input.value || '0');
    if (cents === null) {
      showToast('Digite um valor válido em reais.', 'error');
      input.focus();
      return;
    }
    appState.finance.income.baseMonthly = cents;
    showToast(`Renda mensal fixa salva: ${formatBRL(cents)}.`, 'success');
    persistAndRender();
  });

  // Abas internas do Fluxo Mensal
  document.querySelectorAll('[data-flow-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.flowTab = btn.dataset.flowTab;
      renderAll();
    });
  });

  // Filtros de Gastos Avulsos
  document.getElementById('filter-variable-category')?.addEventListener('change', (e) => {
    uiState.variableFilterCategory = e.target.value;
    renderAll();
  });
  document.getElementById('input-variable-search')?.addEventListener('input', (e) => {
    uiState.variableSearchQuery = e.target.value;
    renderAll();
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
  document.getElementById('view-flow')?.addEventListener('click', (e) => {
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
      if (!item || !window.confirm(`Excluir renda extra "${item.description}"?`)) return;
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
      if (!item || !window.confirm(`Excluir conta fixa "${item.name}"?`)) return;
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
      if (!item || !window.confirm(`Excluir parcelamento "${item.name}"?`)) return;
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
      if (!item || !window.confirm(`Excluir gasto "${item.description}"?`)) return;
      appState.finance.expenses.variable = appState.finance.expenses.variable.filter((x) => x.id !== id);
      showToast('Gasto avulso removido.');
      persistAndRender();
    }
  });

  // Atualiza sugestão de data de vencimento ao mudar o mês equivalente ou o checkbox "mês seguinte"
  const syncCardBillSuggestedDueDate = () => {
    const monthVal = document.getElementById('input-card-bill-month')?.value;
    const dueDateInput = document.getElementById('input-card-bill-duedate');
    const nextMonthChk = document.getElementById('chk-card-bill-next-month');
    if (!monthVal || !/^\d{4}-\d{2}$/.test(monthVal) || !dueDateInput) return;

    const currentDay = isValidDateStr(dueDateInput.value)
      ? Number(dueDateInput.value.slice(8, 10))
      : appState.finance.expenses.creditCardDefaults?.dueDay || 10;
    dueDateInput.value = buildDateForYearMonth(
      monthVal,
      currentDay,
      Boolean(nextMonthChk?.checked)
    );
  };

  document.getElementById('input-card-bill-month')?.addEventListener('change', syncCardBillSuggestedDueDate);
  document.getElementById('chk-card-bill-next-month')?.addEventListener('change', syncCardBillSuggestedDueDate);

  // Submissão: Fatura Rápida do Cartão de Crédito
  document.getElementById('form-credit-card-bill')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentYM = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    const originalYM =
      document.getElementById('input-card-bill-original-month')?.value || currentYM;
    const targetYM = document.getElementById('input-card-bill-month')?.value || currentYM;
    const amountInput = document.getElementById('input-card-bill-amount');
    const dueDateInput = document.getElementById('input-card-bill-duedate');
    const amount = parseCurrencyToCents(amountInput.value || '0');
    const dueDate = dueDateInput?.value || '';
    const dueInNextMonth = Boolean(document.getElementById('chk-card-bill-next-month')?.checked);
    const rawName = document.getElementById('input-card-bill-name').value.trim().slice(0, 60);
    const cardName = rawName || 'Cartão de Crédito';

    if (amount === null) {
      showToast('Informe um valor válido em reais (ex.: 324,34).', 'error');
      amountInput.focus();
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(targetYM)) {
      showToast('Informe um mês de orçamento válido.', 'error');
      return;
    }
    if (!isValidDateStr(dueDate)) {
      showToast('Informe uma data de vencimento válida.', 'error');
      dueDateInput?.focus();
      return;
    }

    const dueDay = Number(dueDate.slice(8, 10));

    if (!appState.finance.expenses.creditCardBills || typeof appState.finance.expenses.creditCardBills !== 'object') {
      appState.finance.expenses.creditCardBills = {};
    }

    // Atualiza defaults para os meses seguintes (dia, regra mês seguinte e nome do cartão)
    appState.finance.expenses.creditCardDefaults = {
      dueDay,
      dueInNextMonth,
      cardName
    };

    const movedMonth = targetYM !== originalYM;
    const existingTarget = appState.finance.expenses.creditCardBills[targetYM];
    const existingOriginal = appState.finance.expenses.creditCardBills[originalYM];

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
        const parsedTarget = parseYM(targetYM);
        const destLabel = parsedTarget
          ? `${MONTH_NAMES[parsedTarget.month - 1]}/${parsedTarget.year}`
          : targetYM;
        showToast(
          `Fatura de ${formatBRL(amount)} registrada em ${destLabel} (vence em ${formatDisplayDate(dueDate)}).`,
          'success'
        );
      } else {
        showToast(
          `Fatura de ${formatBRL(amount)} salva (vence em ${formatDisplayDate(dueDate)})!`,
          'success'
        );
      }
    }

    closeAllFinanceModals();
    persistAndRender();
  });

  document.getElementById('btn-clear-card-bill')?.addEventListener('click', () => {
    const ym = getYearMonthKey(uiState.selectedYear, uiState.selectedMonth);
    if (appState.finance.expenses.creditCardBills) {
      delete appState.finance.expenses.creditCardBills[ym];
    }
    closeAllFinanceModals();
    showToast('Fatura do cartão removida deste mês.');
    persistAndRender();
  });

  // Submissão: Lançamento Rápido (Gasto Avulso)
  document.getElementById('form-quick-expense')?.addEventListener('submit', (e) => {
    e.preventDefault();
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

    closeAllFinanceModals();
    persistAndRender();
  });

  // Submissão: Renda Extra
  document.getElementById('form-extra-income')?.addEventListener('submit', (e) => {
    e.preventDefault();
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

    closeAllFinanceModals();
    persistAndRender();
  });

  // Submissão: Conta Fixa
  document.getElementById('form-fixed-expense')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editingId = document.getElementById('input-fixed-id').value.trim();
    const name = document.getElementById('input-fixed-name').value.trim();
    const amountInput = document.getElementById('input-fixed-amount');
    const amount = parseCurrencyToCents(amountInput.value);
    const dueDay = Math.min(31, Math.max(1, Math.round(Number(document.getElementById('input-fixed-dueday').value) || 10)));
    const category = document.getElementById('input-fixed-category').value;
    const startMonth = document.getElementById('input-fixed-start-month').value;

    if (!name || amount === null || amount <= 0 || !/^\d{4}-\d{2}$/.test(startMonth)) {
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

    closeAllFinanceModals();
    persistAndRender();
  });

  // Submissão: Parcelamento / Dívida
  document.getElementById('form-installment')?.addEventListener('submit', (e) => {
    e.preventDefault();
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

    if (!name || installmentAmount === null || installmentAmount <= 0 || !/^\d{4}-\d{2}$/.test(startMonth)) {
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

    closeAllFinanceModals();
    persistAndRender();
  });

  // ============================================================
  // Caixinhas CDI
  // ============================================================

  document.getElementById('btn-goto-cdi-config')?.addEventListener('click', () => {
    uiState.activeView = 'backup';
    renderAll();
    setTimeout(() => document.getElementById('input-config-cdi-rate')?.focus(), 60);
  });

  document.getElementById('btn-new-caixinha')?.addEventListener('click', () => {
    openCaixinhaModal();
  });

  // Seletor de papel da caixinha (Reserva / Meta vs. Conta / Uso Diário)
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
      const box = appState.finance.caixinhas.boxes.find((b) => b.id === txBtn.dataset.boxId);
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
        openCaixinhaDetailModal(perf, uiState.lastCaixinhasSummary.cdiAnnualRate, 0);
      }
    }
  });

  // Submissão: Nova / Editar Caixinha
  document.getElementById('form-caixinha')?.addEventListener('submit', (e) => {
    e.preventDefault();
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

    closeAllFinanceModals();
    persistAndRender();
  });

  // Submissão: Ajuste Rápido de Saldo (Conta / Uso Diário)
  document.getElementById('form-caixinha-adjust')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const boxId = document.getElementById('input-adjust-box-id').value;
    const balanceInput = document.getElementById('input-adjust-box-balance');
    const newBalanceCents = parseCurrencyToCents(balanceInput.value);

    const box = appState.finance.caixinhas.boxes.find((b) => b.id === boxId);
    const boxPerf = uiState.lastCaixinhasSummary?.boxes.find((b) => b.id === boxId);
    if (!box || !boxPerf) return;

    if (newBalanceCents === null || newBalanceCents < 0) {
      showToast('Informe um saldo válido em reais (ex.: 1.240,50).', 'error');
      balanceInput.focus();
      return;
    }

    const diff = newBalanceCents - boxPerf.currentBalanceCents;
    if (diff === 0) {
      closeAllFinanceModals();
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

    closeAllFinanceModals();
    showToast(`Saldo de "${box.name}" atualizado para ${formatBRL(newBalanceCents)}!`, 'success');
    persistAndRender();
  });

  // Submissão: Aporte / Resgate na Caixinha
  document.getElementById('form-caixinha-tx')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const boxId = document.getElementById('input-box-tx-box-id').value;
    const type = document.getElementById('input-box-tx-type').value === 'withdraw' ? 'withdraw' : 'deposit';
    const amountInput = document.getElementById('input-box-tx-amount');
    const amount = parseCurrencyToCents(amountInput.value);
    const date = document.getElementById('input-box-tx-date').value;
    const note = document.getElementById('input-box-tx-note').value.trim().slice(0, 120);

    const box = appState.finance.caixinhas.boxes.find((b) => b.id === boxId);
    if (!box) return;
    if (amount === null || amount <= 0 || !isValidDateStr(date)) {
      showToast('Informe um valor maior que zero e uma data válida.', 'error');
      amountInput.focus();
      return;
    }

    const tx = { id: generateId('tx'), date, type, amount };
    if (note) tx.note = note;
    box.transactions.push(tx);

    document.getElementById('caixinha-tx-modal')?.classList.add('hidden');
    showToast(
      type === 'deposit'
        ? `Aporte de ${formatBRL(amount)} registrado!`
        : `Resgate de ${formatBRL(amount)} registrado!`,
      'success'
    );
    persistAndRender();
  });

  // Ações dentro do Modal de Detalhes da Caixinha
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
    const box = appState.finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (box) openCaixinhaTxModal(box, 'deposit');
  });

  document.getElementById('btn-detail-withdraw')?.addEventListener('click', () => {
    const box = appState.finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (box) openCaixinhaTxModal(box, 'withdraw');
  });

  document.getElementById('btn-detail-edit-box')?.addEventListener('click', () => {
    const box = appState.finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (box) {
      closeAllFinanceModals();
      openCaixinhaModal(box);
    }
  });

  document.getElementById('btn-detail-delete-box')?.addEventListener('click', () => {
    const box = appState.finance.caixinhas.boxes.find((b) => b.id === uiState.activeBoxDetailId);
    if (!box || !window.confirm(`Excluir a caixinha "${box.name}" e todo o histórico de movimentações?`)) {
      return;
    }
    appState.finance.caixinhas.boxes = appState.finance.caixinhas.boxes.filter((b) => b.id !== box.id);
    uiState.activeBoxDetailId = null;
    closeAllFinanceModals();
    showToast('Caixinha removida.');
    persistAndRender();
  });

  document.getElementById('box-detail-history')?.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-delete-box-tx]');
    if (!delBtn) return;
    const boxId = delBtn.dataset.boxId;
    const txId = delBtn.dataset.deleteBoxTx;
    const box = appState.finance.caixinhas.boxes.find((b) => b.id === boxId);
    if (!box || !window.confirm('Excluir esta movimentação?')) return;
    box.transactions = box.transactions.filter((tx) => tx.id !== txId);
    showToast('Movimentação removida.');
    persistAndRender();
  });
}

// ============================================================
// Registro do Service Worker e Instalação PWA
// ============================================================

function setupPWA() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
        console.warn('Falha ao registrar Service Worker:', err);
      });
    });
  }

  const installBtn = document.getElementById('btn-install-pwa');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    uiState.deferredInstallPrompt = e;
    if (installBtn) installBtn.classList.remove('hidden');
  });

  installBtn?.addEventListener('click', async () => {
    if (!uiState.deferredInstallPrompt) return;
    uiState.deferredInstallPrompt.prompt();
    const { outcome } = await uiState.deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Aplicativo instalado!', 'success');
    }
    uiState.deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    uiState.deferredInstallPrompt = null;
    installBtn?.classList.add('hidden');
  });
}

// ============================================================
// Inicialização
// ============================================================

function init() {
  populateCategorySelects();
  bindEvents();
  resetFareFormToDefaults();
  renderAll();
  setupPWA();
}

init();
