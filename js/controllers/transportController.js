/**
 * Controlador do módulo de Transporte (Passagens):
 * Saldo do cartão, calendário mensal, exceções/modal do dia, intervalo,
 * visão anual, vigências de tarifas e feriados (embutidos e manuais).
 */

import { calculateDay, getActiveFareSchedule } from '../calculator.js';
import {
  formatDisplayDate,
  getBuiltInHolidaysForYear,
  getCurrentDateTimeLabel,
  getTodayStr,
  getYearMonthKey,
  isValidDateStr
} from '../holidays.js';
import { confirmDialog } from '../modalManager.js';
import {
  centsToInputValue,
  formatBRL,
  generateId,
  parseCurrencyToCents,
  sortFareSchedules
} from '../state.js';
import {
  getAppState,
  goToMonth,
  persistAndRender,
  requestRender,
  uiState
} from '../store.js';
import {
  closeBuiltInHolidayModal,
  closeDayModal,
  openBuiltInHolidayModal,
  openDayModal,
  showToast
} from '../ui.js';

// ============================================================
// Interação com Dias do Calendário e Modal
// ============================================================

function handleCalendarDayClick(dateStr) {
  if (!isValidDateStr(dateStr)) return;
  const appState = getAppState();

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
    requestRender();
    return;
  }

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

  uiState.activeModalDate = dateStr;
  const dayCalc = calculateDay(dateStr, appState);
  openDayModal(dayCalc);
}

function applyDayQuickAction(actionType) {
  const dateStr = uiState.activeModalDate;
  if (!dateStr) return;

  const appState = getAppState();
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

  const appState = getAppState();
  const noteInput = document.getElementById('input-day-note');
  const note = noteInput ? noteInput.value.trim().slice(0, 120) : '';
  const existing = appState.exceptions[dateStr];

  if (existing) {
    if (note) {
      existing.note = note;
    } else {
      delete existing.note;
      const dayCalc = calculateDay(dateStr, appState);
      if (existing.type === 'forcar_normal' && !dayCalc.holiday) {
        delete appState.exceptions[dateStr];
      }
    }
  } else if (note) {
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

  const appState = getAppState();
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
// Tarifas e Histórico de Vigências
// ============================================================

export function resetFareFormToDefaults() {
  const appState = getAppState();
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
  const appState = getAppState();
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
  const appState = getAppState();

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

async function deleteFareSchedule(id) {
  const appState = getAppState();
  if (appState.fareSchedules.length <= 1) {
    showToast('É necessário manter pelo menos uma tabela de tarifas ativa.', 'error');
    return;
  }
  const target = appState.fareSchedules.find((s) => s.id === id);
  if (!target) return;

  const ok = await confirmDialog({
    kicker: 'TARIFAS',
    title: 'Excluir vigência',
    message: `Excluir a vigência "${target.label}" (${formatDisplayDate(target.effectiveDate)})?`,
    confirmLabel: 'Excluir',
    danger: true
  });
  if (!ok) return;

  appState.fareSchedules = appState.fareSchedules.filter((s) => s.id !== id);
  resetFareFormToDefaults();
  showToast('Vigência removida.');
  persistAndRender();
}

// ============================================================
// Feriados (Embutidos e Manuais)
// ============================================================

export function resetCustomHolidayForm() {
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
  const appState = getAppState();
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
  const appState = getAppState();

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
// Registro de Eventos do Módulo de Transporte
// ============================================================

export function bindTransportEvents() {
  // Saldo Atual do Cartão
  document.getElementById('form-card-balance')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input-card-balance');
    const cents = parseCurrencyToCents(input.value);
    if (cents === null) {
      showToast('Informe um saldo válido em reais (ex.: 45,50).', 'error');
      input.focus();
      return;
    }
    getAppState().cardBalance = {
      cents,
      updatedAt: getCurrentDateTimeLabel()
    };
    showToast(`Saldo atualizado para ${formatBRL(cents)}.`, 'success');
    persistAndRender();
  });

  // Preferência: Incluir hoje na projeção (sincronizada nos 2 checkboxes)
  const handleIncludeTodayChange = (checked) => {
    getAppState().settings.includeTodayInProjection = checked;
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

  // Modos de clique rápido e intervalo personalizado
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.rangeMode = false;
      uiState.clickMode = btn.dataset.clickMode;
      requestRender();
    });
  });

  document.getElementById('btn-toggle-range-mode')?.addEventListener('click', () => {
    uiState.rangeMode = !uiState.rangeMode;
    requestRender();
  });

  document.getElementById('input-range-start')?.addEventListener('change', (e) => {
    uiState.rangeStart = isValidDateStr(e.target.value) ? e.target.value : null;
    if (uiState.rangeStart && uiState.rangeEnd && uiState.rangeStart > uiState.rangeEnd) {
      [uiState.rangeStart, uiState.rangeEnd] = [uiState.rangeEnd, uiState.rangeStart];
    }
    requestRender();
  });

  document.getElementById('input-range-end')?.addEventListener('change', (e) => {
    uiState.rangeEnd = isValidDateStr(e.target.value) ? e.target.value : null;
    if (uiState.rangeStart && uiState.rangeEnd && uiState.rangeStart > uiState.rangeEnd) {
      [uiState.rangeStart, uiState.rangeEnd] = [uiState.rangeEnd, uiState.rangeStart];
    }
    requestRender();
  });

  document.getElementById('btn-clear-range')?.addEventListener('click', () => {
    uiState.rangeStart = null;
    uiState.rangeEnd = null;
    uiState.rangeMode = false;
    requestRender();
  });

  document.getElementById('calendar-grid')?.addEventListener('click', (e) => {
    const cell = e.target.closest('.day-cell');
    if (!cell || !cell.dataset.date) return;
    handleCalendarDayClick(cell.dataset.date);
  });

  // Recarga efetiva do mês
  document.getElementById('form-monthly-recharge')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const appState = getAppState();
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
    delete getAppState().monthlyRecharges[ym];
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
    delete getAppState().exceptions[uiState.activeModalDate];
    closeDayModal();
    uiState.activeModalDate = null;
    showToast('Exceção removida.');
    persistAndRender();
  });

  // Visão Anual
  document.getElementById('btn-annual-prev-year')?.addEventListener('click', () => {
    uiState.annualYear -= 1;
    requestRender();
  });
  document.getElementById('btn-annual-next-year')?.addEventListener('click', () => {
    uiState.annualYear += 1;
    requestRender();
  });

  const openMonthFromAnnual = (monthNum) => {
    if (!monthNum) return;
    uiState.selectedYear = uiState.annualYear;
    uiState.selectedMonth = Number(monthNum);
    uiState.activeView = 'monthly';
    requestRender();
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

  // Feriados Embutidos e Manuais
  document.getElementById('btn-holidays-prev-year')?.addEventListener('click', () => {
    uiState.holidaysYear -= 1;
    requestRender();
  });
  document.getElementById('btn-holidays-next-year')?.addEventListener('click', () => {
    uiState.holidaysYear += 1;
    requestRender();
  });

  document.getElementById('builtin-holidays-list')?.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-toggle-builtin-holiday]');
    if (!toggle) return;
    const key = toggle.dataset.toggleBuiltinHoliday;
    const appState = getAppState();
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
    const list = getBuiltInHolidaysForYear(uiState.holidaysYear, getAppState().holidayOverrides);
    const target = list.find((h) => h.key === key);
    if (target) openBuiltInHolidayModal(target);
  });

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

    const appState = getAppState();
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
    delete getAppState().holidayOverrides[key];
    closeBuiltInHolidayModal();
    showToast('Feriado restaurado ao padrão.');
    persistAndRender();
  });

  document.getElementById('form-custom-holiday')?.addEventListener('submit', handleCustomHolidaySubmit);
  document.getElementById('btn-cancel-holiday-edit')?.addEventListener('click', resetCustomHolidayForm);

  document.getElementById('custom-holidays-list')?.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-toggle-custom-holiday]');
    if (!toggle) return;
    const id = toggle.dataset.toggleCustomHoliday;
    const target = getAppState().customHolidays.find((h) => h.id === id);
    if (target) {
      target.enabled = toggle.checked;
      persistAndRender();
    }
  });

  document.getElementById('custom-holidays-list')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-custom-holiday]');
    if (editBtn) {
      startEditCustomHoliday(editBtn.dataset.editCustomHoliday);
      return;
    }
    const delBtn = e.target.closest('[data-delete-custom-holiday]');
    if (delBtn) {
      const appState = getAppState();
      const id = delBtn.dataset.deleteCustomHoliday;
      const target = appState.customHolidays.find((h) => h.id === id);
      if (!target) return;
      const ok = await confirmDialog({
        kicker: 'FERIADOS',
        title: 'Excluir evento',
        message: `Excluir "${target.name}"?`,
        confirmLabel: 'Excluir',
        danger: true
      });
      if (!ok) return;
      appState.customHolidays = appState.customHolidays.filter((h) => h.id !== id);
      resetCustomHolidayForm();
      showToast('Evento removido.');
      persistAndRender();
    }
  });
}
