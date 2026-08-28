import { useCallback, useEffect, useState } from "react";

export interface WalletTransaction {
  id: string;
  type: string; // TOPUP, BOOKING_PAYMENT, ADMIN_CREDIT, ADMIN_DEBIT, REASSIGNMENT_CREDIT
  status: string; // PENDING, SUCCESS, FAILED
  amount: number;
  balanceAfter: number | null;
  note: string | null;
  createdAt: string;
}

export function useWallet(take = 20) {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetch(`/api/wallet/me?take=${take}`)
      .then((r) => r.json())
      .then((d) => {
        setBalance(d.balance ?? 0);
        setTransactions(d.transactions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [take]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, transactions, loading, refresh };
}
