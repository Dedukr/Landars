import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";

type AdminCardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AdminCard({
  title,
  description,
  children,
  className,
}: AdminCardProps) {
  return (
    <Card className={className}>
      {title || description ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
