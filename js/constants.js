/**
 * Constantes e metadados compartilhados de domínio do Bolsito (fonte única de verdade).
 * Todos os tokens de cor referenciam variáveis CSS definidas em `css/styles.css`.
 */

export const STORAGE_KEY = 'calc_passagens_v1';
export const SCHEMA_VERSION = 2;
export const DEFAULT_CDI_ANNUAL_RATE = 10.65;
export const DEFAULT_INCOME_PAY_DAY = 5;

export const VALID_PALETTES = ['floresta', 'editorial', 'ardosia', 'cafe', 'ameixa'];

/**
 * Catálogo oficial de categorias de despesas.
 * Todas as cores referenciam tokens CSS definidos em `css/styles.css`
 * (compatíveis com light/dark e todas as 5 paletas).
 */
export const EXPENSE_CATEGORIES = [
  { id: 'transporte', label: 'Transporte', colorVar: 'var(--cat-transporte)' },
  { id: 'cartao', label: 'Cartão de Crédito', colorVar: 'var(--cat-cartao)' },
  { id: 'alimentacao', label: 'Alimentação', colorVar: 'var(--cat-alimentacao)' },
  { id: 'assinaturas', label: 'Assinaturas', colorVar: 'var(--cat-assinaturas)' },
  { id: 'moradia', label: 'Moradia/Contas', colorVar: 'var(--cat-moradia)' },
  { id: 'lazer', label: 'Lazer', colorVar: 'var(--cat-lazer)' },
  { id: 'saude', label: 'Saúde', colorVar: 'var(--cat-saude)' },
  { id: 'educacao', label: 'Educação', colorVar: 'var(--cat-educacao)' },
  { id: 'compras', label: 'Compras', colorVar: 'var(--cat-compras)' },
  { id: 'dividas', label: 'Dívidas', colorVar: 'var(--cat-dividas)' },
  { id: 'outros', label: 'Outros', colorVar: 'var(--cat-outros)' }
];

export const VALID_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.map((c) => c.id);
export const CATEGORY_MAP = new Map(EXPENSE_CATEGORIES.map((c) => [c.id, c]));

export function getCategoryMeta(categoryId) {
  return CATEGORY_MAP.get(categoryId) || CATEGORY_MAP.get('outros');
}
