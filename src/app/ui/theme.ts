// Design tokens and layout helpers for UltimateDuckGarage.

export const layout = {
  page:
    'min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 text-white select-none',
  container: 'max-w-6xl mx-auto px-6',
  headerBorder: 'border-b border-slate-800/50 backdrop-blur-sm',
};

export const card = {
  base: 'backdrop-blur-xl rounded-3xl border bg-slate-800/50 border-slate-700/50',
  padded: 'p-8',
  empty: 'p-12 text-center',
  highlight: 'bg-emerald-500/20 border-emerald-500/50',
};

export const text = {
  subtle: 'text-slate-400',
  softer: 'text-slate-500',
  strong: 'font-bold',
  emeraldMain: 'text-emerald-400',
  emeraldSoft: 'text-emerald-200',
  // ⭐ ADD THESE:
  '6xl': 'text-6xl',
  '3xl': 'text-3xl',
  '2xl': 'text-2xl',
  xl: 'text-xl',
};


export const icon = {
  header: 'w-8 h-8',
};

export const table = {
  headRow: 'text-slate-400 text-xs',
  rowBorder: 'border-t border-slate-800 text-xs',
};
