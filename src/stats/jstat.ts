import * as jStatNamespace from 'jstat';

// jstat ships as CommonJS without type declarations. Resolve it both under
// Vite (named interop) and under plain Node/tsx (default interop).
export const jStat: any =
  (jStatNamespace as any).jStat ?? (jStatNamespace as any).default ?? jStatNamespace;
