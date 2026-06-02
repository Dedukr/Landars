import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button, buttonVariants } from "./button";

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
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <Download className="mr-2 h-4 w-4" />
      {label}
    </a>
  );
}
