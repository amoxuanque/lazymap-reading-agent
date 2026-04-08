import React from 'react';

interface GeneratedCoverProps {
  title: string;
  author?: string;
}

function pickPalette(seed: string) {
  const palettes = [
    'from-[#4f46e5] via-[#1d4ed8] to-[#0f172a]',
    'from-[#0f766e] via-[#155e75] to-[#111827]',
    'from-[#9a3412] via-[#7c2d12] to-[#111827]',
    'from-[#6d28d9] via-[#312e81] to-[#111827]',
    'from-[#be185d] via-[#7e22ce] to-[#111827]',
  ];

  const code = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palettes[code % palettes.length];
}

export function GeneratedCover({ title, author }: GeneratedCoverProps) {
  const palette = pickPalette(`${title}-${author || ''}`);

  return (
    <div className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br ${palette} p-5`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_30%)]" />
      <div className="relative">
        <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-white/70">
          Reading Map
        </div>
      </div>
      <div className="relative">
        <h3 className="text-2xl font-serif font-bold leading-tight text-white line-clamp-4">{title}</h3>
        {author && <p className="mt-3 text-sm text-white/70 line-clamp-2">{author}</p>}
      </div>
    </div>
  );
}
