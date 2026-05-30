/**
 * excelUtils.ts
 * Shared helpers for ExcelJS workbooks.
 */
import type ExcelJS from 'exceljs'

/** Make all cells in a row bold. */
export function applyBoldStyle(row: ExcelJS.Row): void {
  row.font = { bold: true }
}

/** Write a two-row branded header (app title + section label) to a worksheet. */
export function addSheetHeader(sheet: ExcelJS.Worksheet, sectionLabel: string, colCount: number): void {
  const lastCol = String.fromCharCode(64 + colCount)

  sheet.addRow(Array(colCount).fill(''))
  sheet.mergeCells(`A1:${lastCol}1`)
  const titleCell = sheet.getCell('A1')
  titleCell.value = 'TUTORSPAD'
  titleCell.font = { bold: true, size: 16 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 32

  sheet.addRow(Array(colCount).fill(''))
  sheet.mergeCells(`A2:${lastCol}2`)
  const sectionCell = sheet.getCell('A2')
  sectionCell.value = sectionLabel
  sectionCell.font = { bold: true, size: 13 }
  sectionCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).height = 24

  sheet.addRow([])
}
