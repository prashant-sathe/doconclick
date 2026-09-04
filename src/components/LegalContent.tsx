import type { LegalSection } from "@/lib/legalContent";

export default function LegalContent({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
      {sections.map((s) => (
        <div key={s.heading}>
          <h3 className="text-sm font-bold text-slate-800 mb-1.5">{s.heading}</h3>
          {s.body.map((p, i) => (
            <p key={i} className="text-sm text-slate-600 leading-relaxed mb-1.5 last:mb-0">{p}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
