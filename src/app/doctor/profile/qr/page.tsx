"use client";
import { useEffect, useState } from "react";
import { Loader2, Copy, Check, Download, FileText, Lock } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import { useAuth } from "@/components/AuthProvider";
import { useDoctorProfile } from "@/lib/useDoctorProfile";
import { formatDoctorName } from "@/lib/utils";

export default function BookingQRPage() {
  const { user } = useAuth();
  const { profile, loading } = useDoctorProfile();

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const profileUrl = typeof window !== "undefined" && user ? `${window.location.origin}/patient/doctor/${user.id}` : "";
  const isVerified = !!profile?.isVerified;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(`${window.location.origin}/patient/doctor/${user.id}`, { width: 220, margin: 1 }))
      .then((url) => { if (!cancelled) setQrDataUrl(url); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const buildCanvas = (): Promise<HTMLCanvasElement> =>
    new Promise((resolve, reject) => {
      if (!qrDataUrl || !user) { reject(new Error("QR not ready")); return; }
      const W = 420, H = 560, QR_SIZE = 300, QR_Y = 155;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center";
      ctx.fillStyle = "#0d9488"; ctx.font = "bold 28px Arial, sans-serif"; ctx.fillText("DocOnClick", W / 2, 50);
      ctx.fillStyle = "#0f172a"; ctx.font = "bold 24px Arial, sans-serif"; ctx.fillText(formatDoctorName(user.name), W / 2, 95);
      if (profile?.specialty) { ctx.fillStyle = "#64748b"; ctx.font = "16px Arial, sans-serif"; ctx.fillText(String(profile.specialty), W / 2, 122); }
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, (W - QR_SIZE) / 2, QR_Y, QR_SIZE, QR_SIZE);
        ctx.fillStyle = "#475569"; ctx.font = "16px Arial, sans-serif";
        ctx.fillText("Scan to book an appointment", W / 2, QR_Y + QR_SIZE + 35);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error("Failed to load QR image"));
      img.src = qrDataUrl;
    });

  const triggerDownload = (href: string, filename: string) => {
    const a = document.createElement("a");
    a.download = filename; a.href = href;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadPNG = async () => {
    if (!user) return;
    triggerDownload((await buildCanvas()).toDataURL("image/png"), `${formatDoctorName(user.name)}.png`);
  };

  const downloadPDF = async () => {
    if (!user) return;
    const canvas = await buildCanvas();
    const { jsPDF } = await import("jspdf");
    const w = 80, h = (canvas.height / canvas.width) * 80;
    const pdf = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
    const x = (pdf.internal.pageSize.getWidth() - w) / 2;
    const y = (pdf.internal.pageSize.getHeight() - h) / 2;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h);
    pdf.save(`${formatDoctorName(user.name)}.pdf`);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(profileUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <DoctorProfileSubShell
      title="Booking QR Code"
      description="Patients who scan this land on your public profile and can book with you."
      loading={loading}
    >
      {!isVerified ? (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
          <Lock className="w-4 h-4 flex-shrink-0" /> This unlocks once your profile is verified.
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="w-[132px] h-[132px] rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-center flex-shrink-0">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Your booking QR code" width={120} height={120} />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1 w-full">
              <p className="text-xs font-semibold text-slate-500 mb-1">Public profile link</p>
              <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 break-all mb-3">{profileUrl}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className="btn-secondary py-2 px-3 text-xs">
                  {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {linkCopied ? "Copied" : "Copy Link"}
                </button>
                {qrDataUrl && (
                  <>
                    <button type="button" onClick={downloadPNG} className="btn-secondary py-2 px-3 text-xs">
                      <Download className="w-3.5 h-3.5" /> Download PNG
                    </button>
                    <button type="button" onClick={downloadPDF} className="btn-secondary py-2 px-3 text-xs">
                      <FileText className="w-3.5 h-3.5" /> Download PDF
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </DoctorProfileSubShell>
  );
}
