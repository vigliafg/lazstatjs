import React from 'react';
import { BookOpen, ShieldAlert } from 'lucide-react';
import type { ReportSection, ReportSpec, ReportTone } from '../stats/report';

const TONE_STYLES: Record<ReportTone, { border: string; badge: string }> = {
  positive: {
    border: 'border-l-green',
    badge: 'bg-green/10 text-green border-green/30',
  },
  neutral: {
    border: 'border-l-border2',
    badge: 'bg-surface2 text-text2 border-border2',
  },
  caution: {
    border: 'border-l-yellow',
    badge: 'bg-yellow/10 text-yellow border-yellow/30',
  },
};

const Section: React.FC<{ section: ReportSection }> = ({ section }) => (
  <div className="mt-3">
    <h4 className="text-[10px] text-accent2 font-semibold uppercase tracking-wider mb-1.5">
      {section.heading}
    </h4>
    {section.body?.map((paragraph, index) => (
      <p key={index} className="text-[11px] text-text2 leading-relaxed mb-1.5">
        {paragraph}
      </p>
    ))}
    {section.bullets && section.bullets.length > 0 && (
      <ul className="list-disc pl-4 space-y-1">
        {section.bullets.map((bullet, index) => (
          <li key={index} className="text-[11px] text-text2 leading-relaxed">
            {bullet}
          </li>
        ))}
      </ul>
    )}
  </div>
);

/**
 * Plain-language reading of a single analysis run, rendered after every table
 * and chart of that run.
 */
export const AnalysisReport: React.FC<{ spec: ReportSpec }> = ({ spec }) => {
  const tone = TONE_STYLES[spec.tone];
  return (
    <section
      className={`mb-4 mt-6 bg-surface3/30 border border-border2 border-l-4 ${tone.border} rounded-lg p-4`}
      aria-label={spec.title}
      data-report={spec.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-accent2 shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-text3">{spec.title}</span>
        </div>
        <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone.badge}`}>
          {spec.badge}
        </span>
      </div>

      <p className="text-[12px] text-text leading-relaxed bg-surface2/60 border border-border/60 rounded p-2.5">
        {spec.headline}
      </p>

      {spec.intro.map((paragraph, index) => (
        <p key={index} className="text-[11px] text-text2 leading-relaxed mt-2">
          {paragraph}
        </p>
      ))}

      {spec.sections.map((section, index) => (
        <Section key={`${section.heading}-${index}`} section={section} />
      ))}

      {spec.limitations.length > 0 && (
        <div className="mt-4 pt-2.5 border-t border-border/40">
          <div className="flex items-center gap-1.5 mb-1">
            <ShieldAlert className="w-3 h-3 text-text3 shrink-0" />
            <span className="text-[9px] text-text3 font-mono uppercase tracking-widest">Limiti e cautele</span>
          </div>
          <ul className="list-disc pl-4 space-y-1">
            {spec.limitations.map((limitation, index) => (
              <li key={index} className="text-[10px] text-text3 leading-relaxed">
                {limitation}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
