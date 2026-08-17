import React from 'react';

interface GeneratedCoverProps {
  title: string;
  author?: string;
}

export function GeneratedCover({ title, author }: GeneratedCoverProps) {
  return (
    <div className="generated-cover relative flex h-full w-full flex-col justify-between overflow-hidden p-5">
      <div>
        <div className="inline-flex rounded-full border border-[#c9b69d] bg-[#fffaf2]/65 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-[#9a6849]">
          Reading Map
        </div>
      </div>
      <div>
        <h3 className="text-2xl font-serif font-bold leading-tight text-[#35261d] line-clamp-4">{title}</h3>
        {author && <p className="mt-3 text-sm text-[#796a5d] line-clamp-2">{author}</p>}
      </div>
    </div>
  );
}
