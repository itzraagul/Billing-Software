/**
 * Shared print stylesheet — A4 portrait, full-page bill layout.
 * The bill uses a flex column so the signature/seal sits naturally after
 * the content. We do NOT force a fixed min-height anymore — that was
 * pushing bills with large signature/seal images onto a second page.
 * Instead, the bottom section just follows the content; for short bills
 * it sits higher up the page, which is preferable to spilling onto p.2.
 */
export const BILL_PRINT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 8mm 14mm 6mm 14mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 180mm;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    color: #1a1a1a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bill-container {
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  .bill-body { }
  .header { text-align: center; border-bottom: 2px solid #065f46; padding-bottom: 8px; margin-bottom: 12px; }
  .header h1 { font-size: 20px; color: #065f46; margin-bottom: 2px; }
  .header p { font-size: 11px; color: #6b7280; margin: 1px 0; }
  .bill-info { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin: 8px 0; page-break-inside: avoid; }
  table th, table td { padding: 4px 6px; border: 1px solid #e5e7eb; text-align: left; }
  table th { background: #f3f4f6; font-weight: 600; }
  .section-title { margin: 10px 0 6px; color: #065f46; font-size: 12px; font-weight: 600; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }
  .summary { margin-top: 12px; max-width: 75mm; margin-left: auto; }
  .summary-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12px; }
  .summary-row.total { font-weight: 700; font-size: 14px; border-top: 2px solid #065f46; padding-top: 6px; margin-top: 4px; color: #065f46; }
  .bill-bottom { margin-top: 6mm; page-break-inside: avoid; }
  .sig-row { display: flex; justify-content: space-between; align-items: flex-end; }
  .sig-block { text-align: right; }
  .footer { margin-top: 6px; text-align: center; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 5px; }
  .tests { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .test-badge { background: #f3f4f6; padding: 3px 8px; border-radius: 4px; font-size: 11px; }
  img.logo { max-height: 16mm; margin: 0 auto 5px; display: block; object-fit: contain; }
  img.sig { height: 38mm; width: 63.5mm; display: block; margin-left: auto; margin-bottom: 2px; object-fit: contain; }
  img.seal { height: 38mm; width: 63.5mm; object-fit: contain; }
  .sig-line { border-bottom: 1px solid #9ca3af; min-width: 50mm; padding-bottom: 2px; font-size: 12px; display: inline-block; }
  .sig-label { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .quick-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
  .cancelled-banner { background: #fef2f2; border: 2px solid #ef4444; padding: 6px; text-align: center; color: #ef4444; font-weight: bold; margin-bottom: 10px; border-radius: 4px; }
`;

/** Wraps bill HTML content in a complete printable A4 document.
 *  Pass bodyHtml as two parts via billBodyHtml + billBottomHtml so the
 *  layout engine can pin the signature/footer to the page bottom.
 *  Alternatively pass bodyHtml as a single string (legacy callers). */
export function buildPrintDocument(title: string, bodyHtml: string, bottomHtml?: string): string {
  const content = bottomHtml
    ? `<div class="bill-body">${bodyHtml}</div><div class="bill-bottom">${bottomHtml}</div>`
    : bodyHtml;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>${BILL_PRINT_STYLES}</style>
</head>
<body>
<div class="bill-container">${content}</div>
</body>
</html>`;
}

/** Show a one-time browser tip about disabling the "Headers and footers"
 *  print option (date/URL/page-number strip added by the browser, not
 *  by this app). Chrome/Edge remember the setting once turned off, so
 *  this only needs to be shown once per browser. */
export function maybeShowPrintTip(): void {
  const KEY = 'clinic_print_tip_shown';
  if (localStorage.getItem(KEY)) return;
  localStorage.setItem(KEY, '1');
  setTimeout(() => {
    alert(
      'Tip: To remove the browser\'s date/URL header and "about:blank" footer from printed bills,\n\n' +
      'in the Print dialog that opens, click "More settings" and turn OFF "Headers and footers".\n\n' +
      'Your browser will remember this setting for all future prints — you only need to do this once.'
    );
  }, 400);
}
