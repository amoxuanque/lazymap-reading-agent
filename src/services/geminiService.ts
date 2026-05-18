import { ReadingMap } from '../lib/types';

interface GenerateMapInput {
  title: string;
  author?: string;
  content?: string;
  sourceKind: 'upload' | 'catalog';
}

interface GenerateMapResponse {
  map: ReadingMap;
  provider: string;
  mode: 'source-grounded' | 'title-only' | 'prototype-fallback';
}

export async function generateReadingMap(input: GenerateMapInput): Promise<ReadingMap> {
  const response = await fetch('/api/generate-map', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.detail || payload?.error || detail;
    } catch {
      // Ignore JSON parse failure and keep the default status text.
    }
    throw new Error(detail || '生成失败，请稍后重试。');
  }

  const payload = (await response.json()) as GenerateMapResponse;
  return payload.map;
}
