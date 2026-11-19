/**
 * Gerenciador centralizado de modais do Bolsito.
 * - Pilha LIFO para modais empilhados (ex.: Aporte/Resgate ou Confirmação sobre Detalhes)
 * - Focus trap (Tab / Shift+Tab) dentro do modal ativo mais ao topo
 * - Restauração automática de foco ao fechar
 * - Bloqueio de scroll do body (`body.modal-open`)
 * - Diálogo de confirmação editorial reutilizável (`confirmDialog`) substituindo `window.confirm`
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/** @type {Array<{ id: string, openerEl: Element | null, onClose: (() => void) | null }>} */
const modalStack = [];
let initialized = false;
let activeConfirmResolver = null;

function syncBodyScrollLock() {
  document.body.classList.toggle('modal-open', modalStack.length > 0);
}

function getFocusableElements(modalEl) {
  if (!modalEl) return [];
  return Array.from(modalEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.closest('.hidden')) return false;
    return el.offsetParent !== null || el.getClientRects().length > 0;
  });
}

function handleGlobalTabTrap(e) {
  if (e.key !== 'Tab' || modalStack.length === 0) return;

  const top = modalStack[modalStack.length - 1];
  const modalEl = document.getElementById(top.id);
  if (!modalEl || modalEl.classList.contains('hidden')) return;

  const focusables = getFocusableElements(modalEl);
  if (focusables.length === 0) {
    e.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (!modalEl.contains(active)) {
    e.preventDefault();
    first.focus();
    return;
  }

  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

export function initModalManager() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', handleGlobalTabTrap);

  const confirmModal = document.getElementById('confirm-dialog-modal');
  const confirmOk = document.getElementById('btn-confirm-dialog-ok');
  const confirmCancel = document.getElementById('btn-confirm-dialog-cancel');
  const confirmClose = document.getElementById('btn-confirm-dialog-close');

  const settleConfirm = (accepted) => {
    const resolver = activeConfirmResolver;
    activeConfirmResolver = null;
    closeModal('confirm-dialog-modal');
    if (resolver) resolver(accepted);
  };

  confirmOk?.addEventListener('click', () => settleConfirm(true));
  confirmCancel?.addEventListener('click', () => settleConfirm(false));
  confirmClose?.addEventListener('click', () => settleConfirm(false));
  confirmModal?.addEventListener('click', (e) => {
    if (e.target === confirmModal) settleConfirm(false);
  });
}

export function openModal(modalId, { focusEl = null, onClose = null } = {}) {
  initModalManager();
  const modalEl = document.getElementById(modalId);
  if (!modalEl) return false;

  const existingIdx = modalStack.findIndex((item) => item.id === modalId);
  let openerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (existingIdx !== -1) {
    openerEl = modalStack[existingIdx].openerEl;
    modalStack.splice(existingIdx, 1);
  }

  modalEl.classList.remove('hidden');
  modalStack.push({ id: modalId, openerEl, onClose });
  syncBodyScrollLock();

  const targetFocus =
    focusEl instanceof HTMLElement
      ? focusEl
      : getFocusableElements(modalEl)[0] || null;
  if (targetFocus) {
    targetFocus.focus();
  }
  return true;
}

export function closeModal(modalId) {
  const modalEl = document.getElementById(modalId);
  if (modalEl) {
    modalEl.classList.add('hidden');
  }

  const idx = modalStack.findIndex((item) => item.id === modalId);
  if (idx === -1) {
    syncBodyScrollLock();
    return false;
  }

  const [entry] = modalStack.splice(idx, 1);
  syncBodyScrollLock();

  if (typeof entry.onClose === 'function') {
    entry.onClose();
  }

  if (modalStack.length === 0 && entry.openerEl && entry.openerEl.isConnected) {
    entry.openerEl.focus();
  }
  return true;
}

export function closeTopModal() {
  if (modalStack.length === 0) return false;
  const top = modalStack[modalStack.length - 1];
  return closeModal(top.id);
}

export function closeModals(modalIds) {
  for (const id of modalIds) {
    closeModal(id);
  }
}

export function hasOpenModal() {
  return modalStack.length > 0;
}

/**
 * Exibe o diálogo editorial de confirmação baseado em Promise (substitui window.confirm).
 */
export function confirmDialog({
  title = 'Confirmar ação',
  kicker = 'CONFIRMAÇÃO',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true
} = {}) {
  initModalManager();
  const modalEl = document.getElementById('confirm-dialog-modal');
  if (!modalEl) {
    return Promise.resolve(window.confirm(message || title));
  }

  // Se houver uma confirmação pendente anterior, encerra como cancelada
  if (activeConfirmResolver) {
    const prev = activeConfirmResolver;
    activeConfirmResolver = null;
    prev(false);
  }

  const kickerEl = document.getElementById('confirm-dialog-kicker');
  const titleEl = document.getElementById('confirm-dialog-title');
  const msgEl = document.getElementById('confirm-dialog-message');
  const okBtn = document.getElementById('btn-confirm-dialog-ok');
  const cancelBtn = document.getElementById('btn-confirm-dialog-cancel');

  const isPrivacyOn = document.documentElement.getAttribute('data-privacy') === 'on';
  const safeMessage = isPrivacyOn
    ? String(message).replace(/R\$\s*[\d.,]+/g, 'R$ •••')
    : String(message);

  if (kickerEl) kickerEl.textContent = kicker;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = safeMessage;
  if (cancelBtn) cancelBtn.textContent = cancelLabel;
  if (okBtn) {
    okBtn.textContent = confirmLabel;
    okBtn.className = `btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`;
  }

  return new Promise((resolve) => {
    activeConfirmResolver = resolve;
    openModal('confirm-dialog-modal', {
      focusEl: danger ? cancelBtn : okBtn,
      onClose: () => {
        if (activeConfirmResolver === resolve) {
          activeConfirmResolver = null;
          resolve(false);
        }
      }
    });
  });
}
