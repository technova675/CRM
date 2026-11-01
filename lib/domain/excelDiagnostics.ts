export interface ExcelCellIssue { sheet: string; cell: string; reason: string }

// Called on worksheet XML before the reader can turn spreadsheet errors into nulls.
export function worksheetIssues(sheet: string, cells: { address: string; type: string | null; formula: boolean; value: string | null }[]): ExcelCellIssue[] {
  return cells.flatMap((cell) => {
    if (cell.type === "e") return [{ sheet, cell: cell.address, reason: `Excel error ${cell.value || "(unknown)"}` }];
    if (cell.formula && cell.value == null) return [{ sheet, cell: cell.address, reason: "Formula has no saved result" }];
    return [];
  });
}
