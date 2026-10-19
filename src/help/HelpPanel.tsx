import React, { useState } from 'react';
import { BookOpen, HelpCircle, Lightbulb, ListOrdered } from 'lucide-react';
import { HELP_TABS, type HelpBlock, type HelpSection, type HelpTab } from './helpContent';

const SectionCard: React.FC<{ section: HelpSection }> = ({ section }) => (
  <section className="bg-surface border border-border rounded-lg p-5 mb-4">
    <h3 className="text-accent2 font-mono text-[11px] font-bold uppercase tracking-widest">
      {section.title}
    </h3>
    <p className="text-[11px] text-text3 mt-1 mb-3">{section.summary}</p>
    {section.blocks.map((block) => (
      <Block key={block.title} block={block} />
    ))}
  </section>
);

const Steps: React.FC<{ steps: string[]; className?: string }> = ({ steps, className }) => (
  <ol className={`list-decimal pl-5 space-y-1 ${className ?? ''}`}>
    {steps.map((step, index) => (
      <li key={index} className="text-[11px] text-text2 leading-relaxed">
        {step}
      </li>
    ))}
  </ol>
);

const Block: React.FC<{ block: HelpBlock }> = ({ block }) => (
  <div className="mt-4 first:mt-0">
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="w-1 h-1 bg-accent rounded-full shrink-0" />
      <h4 className="text-[11px] font-semibold text-text">{block.title}</h4>
    </div>
    {block.intro && <p className="text-[11px] text-text2 leading-relaxed mb-2">{block.intro}</p>}
    {block.steps && block.steps.length > 0 && <Steps steps={block.steps} />}
    {block.table && <Table head={block.table.head} rows={block.table.rows} />}
    {block.example && (
      <div className="mt-3 bg-surface3/40 border border-border2 border-l-2 border-l-accent2/60 rounded p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ListOrdered className="w-3 h-3 text-accent2 shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-accent2">
            Example · {block.example.title}
          </span>
        </div>
        <Steps steps={block.example.steps} />
        {block.example.note && (
          <p className="text-[10px] text-text3 mt-2 italic leading-relaxed">{block.example.note}</p>
        )}
      </div>
    )}
    {block.tip && (
      <div className="mt-3 flex gap-2 bg-yellow/5 border border-yellow/20 rounded p-2.5">
        <Lightbulb className="w-3.5 h-3.5 text-yellow shrink-0 mt-0.5" />
        <p className="text-[10px] text-text2 leading-relaxed">{block.tip}</p>
      </div>
    )}
  </div>
);

const Table: React.FC<{ head: string[]; rows: string[][] }> = ({ head, rows }) => (
  <div className="mt-2 overflow-x-auto scrollbar">
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr>
          {head.map((cell, index) => (
            <th
              key={index}
              className="text-left border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-text3 bg-surface2"
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={`border border-border px-2 py-1 align-top leading-relaxed ${
                  cellIndex === 0 ? 'text-text whitespace-nowrap' : 'text-text2'
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const TabView: React.FC<{ tab: HelpTab }> = ({ tab }) => (
  <div className="max-w-4xl mx-auto">
    <div className="mb-4">
      <h2 className="text-[14px] text-text font-semibold flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-accent2 shrink-0" />
        {tab.title}
      </h2>
      <p className="text-[11px] text-text3 mt-1 leading-relaxed">{tab.blurb}</p>
    </div>
    {tab.sections.map((section) => (
      <SectionCard key={section.id} section={section} />
    ))}
  </div>
);

/**
 * In-app guide: one tab per area of the application (editor, prep, groups,
 * analyses, output, recipes, reference) with numbered steps and examples.
 */
export const HelpPanel: React.FC = () => {
  const [activeId, setActiveId] = useState(HELP_TABS[0]?.id ?? 'overview');
  const active = HELP_TABS.find((tab) => tab.id === activeId) ?? HELP_TABS[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-surface border-b border-border shrink-0">
        <div className="flex overflow-x-auto scrollbar">
          {HELP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              aria-pressed={tab.id === active?.id}
              className={`atab ${tab.id === active?.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar p-6">
        {active && <TabView tab={active} />}
        <p className="max-w-4xl mx-auto text-[10px] text-text3 font-mono uppercase tracking-widest pt-2 pb-6 flex items-center gap-2">
          <HelpCircle className="w-3 h-3" />
          Help updated with the current features — open a tab above to jump to another area
        </p>
      </div>
    </div>
  );
};
