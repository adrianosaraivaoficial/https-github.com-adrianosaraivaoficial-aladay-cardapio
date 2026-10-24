import React, { useState, useMemo } from 'react';
import { Search, Copy, Check, FileText, ChevronRight, Download, BookOpen } from 'lucide-react';
import { BLUEPRINT_SECTIONS } from '../data/blueprintSections';
import { BlueprintSection } from '../types';

export const ArchitectureDocView: React.FC = () => {
  const [selectedSectionId, setSelectedSectionId] = useState<string>(BLUEPRINT_SECTIONS[0].id);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredSections = useMemo(() => {
    if (!searchTerm.trim()) return BLUEPRINT_SECTIONS;
    const term = searchTerm.toLowerCase();
    return BLUEPRINT_SECTIONS.filter(
      (sec) =>
        sec.title.toLowerCase().includes(term) ||
        sec.subtitle.toLowerCase().includes(term) ||
        sec.summary.toLowerCase().includes(term) ||
        sec.contentMarkdown.toLowerCase().includes(term) ||
        sec.tags.some((t) => t.toLowerCase().includes(term))
    );
  }, [searchTerm]);

  const currentSection = useMemo(() => {
    return (
      filteredSections.find((s) => s.id === selectedSectionId) ||
      filteredSections[0] ||
      BLUEPRINT_SECTIONS[0]
    );
  }, [filteredSections, selectedSectionId]);

  const handleCopySection = (section: BlueprintSection) => {
    const textToCopy = `# ${section.number}. ${section.title}\n\n_${section.subtitle}_\n\n${section.contentMarkdown}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(section.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadFullDoc = () => {
    const fullMarkdown = BLUEPRINT_SECTIONS.map(
      (s) => `## ${s.number}. ${s.title}\n\n_${s.subtitle}_\n\n${s.contentMarkdown}\n\n---\n`
    ).join('\n');

    const blob = new Blob([fullMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Planejamento_Arquitetura_SaaS_Cardapios_EvolutionAPI.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-140px)]">
      {/* Sidebar: Index of sections */}
      <aside className="lg:col-span-4 bg-white border border-neutral-200 rounded-lg p-4 flex flex-col h-full">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-neutral-700" />
            <h2 className="text-sm font-semibold text-neutral-900">Plano Arquitetural & Executivo</h2>
          </div>
          <span className="text-xs text-neutral-500 tabular-nums">
            {filteredSections.length} de {BLUEPRINT_SECTIONS.length} seções
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por termo (ex: RLS, Outbox, 129,90)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-md text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
        </div>

        {/* Section list */}
        <nav className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {filteredSections.map((section) => {
            const isSelected = section.id === currentSection.id;
            return (
              <button
                key={section.id}
                onClick={() => setSelectedSectionId(section.id)}
                className={`w-full text-left p-2.5 rounded-md transition-colors flex items-start gap-3 ${
                  isSelected
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <span
                  className={`text-xs font-mono font-semibold pt-0.5 tabular-nums ${
                    isSelected ? 'text-neutral-300' : 'text-neutral-500'
                  }`}
                >
                  {section.number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug truncate">{section.title}</p>
                  <p
                    className={`text-[11px] truncate mt-0.5 ${
                      isSelected ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    {section.subtitle}
                  </p>
                </div>
                {isSelected && <ChevronRight className="w-3.5 h-3.5 mt-1 shrink-0 text-white" />}
              </button>
            );
          })}
        </nav>

        {/* Download action */}
        <div className="pt-3 border-t border-neutral-200 mt-2">
          <button
            onClick={handleDownloadFullDoc}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar Planejamento em Markdown</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="lg:col-span-8 bg-white border border-neutral-200 rounded-lg p-6 flex flex-col h-full overflow-y-auto custom-scrollbar">
        {currentSection ? (
          <article className="space-y-6">
            {/* Header */}
            <div className="border-b border-neutral-200 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="font-mono font-semibold text-neutral-900">
                    Seção {currentSection.number}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Documento Arquitetural SaaS</span>
                  <span aria-hidden="true">·</span>
                  <span>R$ 129,90/mês & Evolution API</span>
                </div>

                <button
                  onClick={() => handleCopySection(currentSection)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
                >
                  {copiedId === currentSection.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Seção</span>
                    </>
                  )}
                </button>
              </div>

              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-900">
                {currentSection.title}
              </h1>
              <p className="text-sm text-neutral-600 mt-1">{currentSection.subtitle}</p>

              {/* Tags without pills (clean unboxed typographic metadata) */}
              <div className="flex items-center gap-2 text-xs text-neutral-500 mt-3">
                {currentSection.tags.map((tag, idx) => (
                  <React.Fragment key={tag}>
                    <span>{tag}</span>
                    {idx < currentSection.tags.length - 1 && <span aria-hidden="true">·</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Formatted Markdown-like Content */}
            <div className="prose prose-neutral max-w-none text-neutral-800 text-sm leading-relaxed space-y-4">
              {currentSection.contentMarkdown.split('\n\n').map((paragraph, index) => {
                // Headers ###
                if (paragraph.startsWith('### ')) {
                  return (
                    <h3
                      key={index}
                      className="text-base font-semibold text-neutral-900 pt-3 pb-1 border-b border-neutral-100"
                    >
                      {paragraph.replace('### ', '')}
                    </h3>
                  );
                }

                // Headers ####
                if (paragraph.startsWith('#### ')) {
                  return (
                    <h4 key={index} className="text-sm font-semibold text-neutral-900 pt-2">
                      {paragraph.replace('#### ', '')}
                    </h4>
                  );
                }

                // Code block ```
                if (paragraph.startsWith('```')) {
                  const cleanedCode = paragraph
                    .replace(/^```[a-z]*\n?/, '')
                    .replace(/\n?```$/, '');
                  return (
                    <div
                      key={index}
                      className="my-3 bg-neutral-950 text-neutral-200 p-4 rounded-lg font-mono text-xs overflow-x-auto leading-normal border border-neutral-800"
                    >
                      <pre className="whitespace-pre">{cleanedCode}</pre>
                    </div>
                  );
                }

                // Table parsing
                if (paragraph.includes('|') && paragraph.includes('\n|')) {
                  const lines = paragraph.split('\n').filter((l) => l.trim().length > 0);
                  const headerLine = lines[0];
                  const headers = headerLine
                    .split('|')
                    .map((h) => h.trim())
                    .filter((h) => h.length > 0);
                  const dataLines = lines.slice(2); // Skip header and separator

                  return (
                    <div
                      key={index}
                      className="my-4 overflow-x-auto border border-neutral-200 rounded-lg"
                    >
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-700 font-semibold">
                          <tr>
                            {headers.map((h, i) => (
                              <th key={i} className="p-3">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {dataLines.map((row, rIdx) => {
                            const cells = row
                              .split('|')
                              .map((c) => c.trim())
                              .filter((c, i, arr) => i > 0 && i < arr.length - 1);
                            return (
                              <tr key={rIdx} className="hover:bg-neutral-50/60 transition-colors">
                                {cells.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="p-3 text-neutral-700 align-top"
                                    dangerouslySetInnerHTML={{
                                      __html: cell
                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/`(.*?)`/g, '<code class="bg-neutral-100 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>')
                                        .replace(/<br>/g, '<br/>'),
                                    }}
                                  />
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                // Math block / Formula $$
                if (paragraph.startsWith('$$') && paragraph.endsWith('$$')) {
                  const formula = paragraph.slice(2, -2).trim();
                  return (
                    <div
                      key={index}
                      className="my-3 p-3.5 bg-neutral-50 border border-neutral-200 rounded-md font-mono text-xs text-neutral-800 text-center"
                    >
                      {formula}
                    </div>
                  );
                }

                // Regular paragraph with inline formatting
                return (
                  <p
                    key={index}
                    className="text-neutral-700 text-xs md:text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: paragraph
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-neutral-900 font-semibold">$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/`([^`]+)`/g, '<code class="bg-neutral-100 text-neutral-800 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
                        .replace(/\n/g, '<br/>'),
                    }}
                  />
                );
              })}
            </div>
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">Nenhuma seção encontrada para a busca.</p>
          </div>
        )}
      </main>
    </div>
  );
};
