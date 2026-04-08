import { ReadingMap } from '../lib/types';

export async function translateMap(map: ReadingMap): Promise<ReadingMap> {
  const response = await fetch('/api/translate-map', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ map }),
  });

  if (!response.ok) {
    throw new Error('Map translation failed.');
  }

  const payload = await response.json();
  return payload.map as ReadingMap;
}
