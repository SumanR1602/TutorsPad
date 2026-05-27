/**
 * excelUtils.ts
 * Shared helpers for ExcelJS workbooks.
 */
import type ExcelJS from 'exceljs'

/** Make all cells in a row bold. */
export function applyBoldStyle(row: ExcelJS.Row): void {
  row.font = { bold: true }
}
