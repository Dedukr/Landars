import { Download } from "lucide-react";

import { Button } from "./button";

type DocumentDownloadButtonProps = {
  href: string;
  label?: string;
  disabled?: boolean;
};

export function DocumentDownloadButton({
  href,
  label = "Download",
  disabled,
}: DocumentDownloadButtonProps) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Download className="mr-2 h-4 w-4" />
        {label}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        <Download className="mr-2 h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}
