import qrcode from "qrcode-generator";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

export function QrCode({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label: string;
}) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("rounded-lg bg-white p-2 [&_svg]:h-full [&_svg]:w-full", className)}
      // The SVG is generated locally from the join URL; no user HTML.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
