import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

type Column<T> = {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  className?: string;
};

type AdminDataTableProps<T extends Record<string, unknown>> = {
  columns: Column<T>[];
  rows: T[];
  emptyLabel?: string;
};

export function AdminDataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyLabel = "No records found.",
}: AdminDataTableProps<T>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)} className={column.className}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => {
                  const value = row[column.key];
                  return (
                    <TableCell key={String(column.key)}>
                      {column.render ? column.render(value, row) : String(value ?? "")}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
