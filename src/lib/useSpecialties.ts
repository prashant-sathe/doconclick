"use client";
import { useCallback, useEffect, useState } from "react";

export interface SpecialtyOption {
  name: string;
  color: string;
}

export function useSpecialties() {
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/specialties")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setSpecialties(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const colorFor = useCallback(
    (name: string) => specialties.find((s) => s.name === name)?.color ?? "#2563eb",
    [specialties]
  );

  return { specialties, loading, colorFor };
}
