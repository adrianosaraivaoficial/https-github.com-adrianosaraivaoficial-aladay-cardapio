import React from 'react';

export const ViewLoadingFallback: React.FC = () => (
  <div className="min-h-[45vh] flex items-center justify-center" role="status" aria-live="polite">
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-xs">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden="true" />
      Carregando…
    </div>
  </div>
);
