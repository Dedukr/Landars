type JsonViewerProps = {
  data: unknown;
};

export function JsonViewer({ data }: JsonViewerProps) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
