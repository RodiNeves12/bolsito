/**
 * Controlador de Sistema, Navegação, Tema/Paleta, Privacidade,
 * Backup/Importação JSON, Atalhos de Teclado e PWA.
 */

import { closeAllFinanceModals, openQuickExpenseModal } from '../financeUI.js';
import { getTodayStr, splitDateStr } from '../holidays.js';
import { closeTopModal, confirmDialog, hasOpenModal } from '../modalManager.js';
import {
  exportStateAsJSON,
  formatBRL,
  parseCurrencyToCents,
  parsePercentageRate,
  VALID_PALETTES,
  validateAndSanitizeState
} from '../state.js';
import {
  getAppState,
  persistAndRender,
  persistStateOrWarn,
  replaceAppState,
  requestRender,
  resetAppState,
  uiState
} from '../store.js';
import { applyPrivacyMode, applyTheme, escapeHtml, showToast } from '../ui.js';

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

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

function toggleTheme() {
  const currentEffective = document.documentElement.getAttribute('data-theme');
  getAppState().theme = currentEffective === 'dark' ? 'light' : 'dark';
  persistAndRender();
}

function togglePrivacyMode() {
  const appState = getAppState();
  appState.privacyMode = !appState.privacyMode;
  const saved = persistStateOrWarn();
  applyPrivacyMode(appState.privacyMode);
  if (saved) {
    showToast(
      appState.privacyMode ? 'Modo Privacidade ativado (valores ocultos).' : 'Modo Privacidade desativado.'
    );
  }
}

async function handleImportFileSelected(event) {
  const file = event.target.files?.[0];
  const previewBox = document.getElementById('import-preview-box');
  if (!file || !previewBox) return;

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    uiState.pendingImportState = null;
    previewBox.classList.remove('hidden');
    previewBox.innerHTML =
      '<strong class="text-danger">Arquivo muito grande:</strong><p class="helper-text">O backup JSON deve ter no máximo 5 MB.</p>';
    showToast('Arquivo excede o limite máximo de 5 MB.', 'error');
    event.target.value = '';
    return;
  }

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
    event.target.value = '';
  }
}

export function bindSettingsAndNavEvents({ onAfterStateReplace = null } = {}) {
  // Navegação principal por abas
  document.querySelectorAll('.nav-tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      uiState.activeView = tab.dataset.view;
      setMobileMoreSheetOpen(false);
      requestRender();
    });
  });

  // Menu mobile "Mais"
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
      requestRender();
    });
  });

  // Botão "Hoje" global
  document.getElementById('btn-today-global')?.addEventListener('click', () => {
    const now = splitDateStr(getTodayStr());
    uiState.selectedYear = now.year;
    uiState.selectedMonth = now.month;
    requestRender();
  });

  // Privacidade, Tema e Paleta
  document.getElementById('btn-privacy-toggle')?.addEventListener('click', togglePrivacyMode);
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  document.querySelectorAll('[data-theme-pref]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTheme = btn.dataset.themePref;
      if (['light', 'dark', 'auto'].includes(nextTheme)) {
        getAppState().theme = nextTheme;
        persistAndRender();
      }
    });
  });

  document.querySelectorAll('[data-palette-choice]').forEach((card) => {
    card.addEventListener('click', () => {
      const nextPalette = card.dataset.paletteChoice;
      if (VALID_PALETTES.includes(nextPalette)) {
        getAppState().palette = nextPalette;
        persistAndRender();
      }
    });
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const appState = getAppState();
      if (appState.theme === 'auto') {
        applyTheme('auto', appState.palette);
      }
    });
  }

  // Parâmetros Financeiros em Backup e Config (Renda fixa + Dia de pagamento + CDI anual)
  document.getElementById('form-finance-params')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const baseInput = document.getElementById('input-config-base-income');
    const payDayInput = document.getElementById('input-config-pay-day');
    const cdiInput = document.getElementById('input-config-cdi-rate');

    const baseCents = parseCurrencyToCents(baseInput.value || '0');
    const rawPayDay = Number(payDayInput?.value);
    const cdiRate = parsePercentageRate(cdiInput.value, { min: 0, max: 200 });

    if (baseCents === null) {
      showToast('Informe um valor válido para a renda mensal fixa.', 'error');
      baseInput.focus();
      return;
    }
    if (!Number.isInteger(rawPayDay) || rawPayDay < 1 || rawPayDay > 31) {
      showToast('Informe um dia de pagamento válido (entre 1 e 31).', 'error');
      payDayInput?.focus();
      return;
    }
    if (cdiRate === null) {
      showToast('Informe uma taxa CDI anual válida (ex.: 10,65).', 'error');
      cdiInput.focus();
      return;
    }

    const appState = getAppState();
    appState.finance.income.baseMonthly = baseCents;
    appState.finance.income.payDay = rawPayDay;
    appState.finance.caixinhas.cdiAnnualRate = cdiRate;
    showToast('Parâmetros financeiros atualizados!', 'success');
    persistAndRender();
  });

  // Backup: Exportar, Importar e Resetar
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    exportStateAsJSON(getAppState());
    showToast('Backup JSON baixado!', 'success');
  });

  document.getElementById('input-import-json')?.addEventListener('change', handleImportFileSelected);

  document.getElementById('import-preview-box')?.addEventListener('click', (e) => {
    if (e.target.id === 'btn-confirm-import' && uiState.pendingImportState) {
      replaceAppState(uiState.pendingImportState);
      uiState.pendingImportState = null;
      document.getElementById('import-preview-box').classList.add('hidden');
      onAfterStateReplace?.();
      showToast('Backup importado com sucesso!', 'success');
      persistAndRender();
    } else if (e.target.id === 'btn-cancel-import') {
      uiState.pendingImportState = null;
      document.getElementById('import-preview-box').classList.add('hidden');
    }
  });

  document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      kicker: 'ZONA DE PERIGO',
      title: 'Resetar todos os dados',
      message:
        'Tem certeza que deseja apagar TODOS os dados (rendas, despesas, caixinhas, tarifas, exceções, recargas, saldo e feriados manuais) e voltar ao padrão inicial?',
      confirmLabel: 'Apagar tudo',
      danger: true
    });
    if (!ok) return;
    resetAppState();
    uiState.rangeStart = null;
    uiState.rangeEnd = null;
    uiState.rangeMode = false;
    uiState.activeBoxDetailId = null;
    uiState.boxSimMonthlyCents = 0;
    closeAllFinanceModals();
    onAfterStateReplace?.();
    showToast('Dados resetados para o padrão inicial.');
    requestRender();
  });

  // Atalhos globais de teclado (Escape fecha modal superior / sheet; P = Privacidade; N = Novo Gasto)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (closeTopModal()) {
        const dayModal = document.getElementById('day-modal-backdrop');
        if (!dayModal || dayModal.classList.contains('hidden')) {
          uiState.activeModalDate = null;
        }
        return;
      }
      setMobileMoreSheetOpen(false);
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey || isTypingElement(e.target) || hasOpenModal()) {
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

export function setupPWA() {
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

  // Atualiza automaticamente data, autonomia e rendimento CDI após virada do dia
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getTodayStr() !== uiState.lastRenderedDateStr) {
      requestRender();
    }
  });
}
