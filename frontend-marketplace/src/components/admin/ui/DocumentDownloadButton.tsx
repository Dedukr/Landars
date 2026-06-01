import { Download } from "lucide-react";

import { Button } from "./button";

type DocumentDownloadButtonProps = {
  href?: string | null;
  label?: string;
};

export function DocumentDownloadButton({
  href,
  label = "Download",
}: DocumentDownloadButtonProps) {
  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <Download className="size-4" />
        {label}
      </a>
    </Button>
  );
}
