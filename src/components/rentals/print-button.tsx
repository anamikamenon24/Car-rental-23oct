"use client";

import { PrinterIcon } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClasses("outline", "md", "no-print")} data-testid="voucher-print">
      <PrinterIcon className="size-4" /> Print voucher
    </button>
  );
}
