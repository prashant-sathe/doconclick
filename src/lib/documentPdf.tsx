"use client";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

// Turns an A4 document component (PrescriptionDocument, ReceiptDocument) into
// a PDF in the browser: render it off-screen, snapshot with html2canvas, page
// it into jsPDF.
export async function renderDocumentPdf(element: ReactElement) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    root.render(element);
    // Wait a full commit + paint cycle before snapshotting the off-screen node.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    // The signature (or any other embedded image) loads over the network —
    // wait for it, or html2canvas may snapshot before it's painted in.
    await Promise.all(
      Array.from(container.querySelectorAll("img")).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
      )
    );

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });

    // JPEG (not PNG) keeps the file small — a flat, mostly-white document
    // compresses far better as JPEG than as lossless PNG.
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    let heightLeft = imgH;
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, imgH);
    heightLeft -= pageH;
    // Ignore sub-millimeter residuals from floating-point rounding so content
    // that fits exactly one page doesn't spill a near-empty trailing page.
    while (heightLeft > 1) {
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, heightLeft - imgH, pageW, imgH);
      heightLeft -= pageH;
    }
    return pdf;
  } finally {
    root.unmount();
    container.remove();
  }
}
