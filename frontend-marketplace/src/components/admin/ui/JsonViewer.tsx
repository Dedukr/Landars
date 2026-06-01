type JsonViewerProps = {
  value: unknown;
};

export function JsonViewer({ value }: JsonViewerProps) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
