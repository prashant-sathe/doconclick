import Image from "next/image";

// Shared by the pay-link page and its Cashfree return page: standalone, no
// app header or nav — the person paying may never have opened the app.

export interface GuestBill {
  id: string;
  status: string;
  consultType: string;
  scheduledAt: string;
  timed: boolean;
  patientName: string;
  doctorName: string;
  specialty: string | null;
  clinic: { name: string; address: string | null } | null;
  amount: number;
  discountAmount: number;
  payable: number;
  paymentMethod: string;
  paymentStatus: string;
  creditedAmount: number | null;
}

export function PayShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen gradient-surface flex flex-col items-center justify-center px-4 py-10 safe-screen">
      <Image src="/logo.png" alt="DocOnClick" width={1200} height={242} className="h-8 w-auto object-contain mb-8" priority />
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-xl p-7 border border-slate-100 text-center">{children}</div>;
}
