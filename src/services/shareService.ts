import { ReadingMap } from '../lib/types';

interface CreateShareResponse {
  shareId: string;
  expiresAt?: string;
}

export async function createShareMap(map: ReadingMap): Promise<CreateShareResponse> {
  const response = await fetch('/api/share-map', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ map }),
  });

  let payload: { error?: string; shareId?: string; expiresAt?: string } = {};
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse failure and use fallback messages below.
  }

  if (!response.ok || !payload.shareId) {
    throw new Error(payload.error || '分享创建失败，请稍后重试。');
  }

  return {
    shareId: payload.shareId,
    expiresAt: payload.expiresAt,
  };
}

export async function getSharedMap(shareId: string): Promise<ReadingMap> {
  const response = await fetch(`/api/share-map/${encodeURIComponent(shareId)}`);

  let payload: { error?: string; map?: ReadingMap } = {};
  try {
    payload = await response.json();
  } catch {
    // Ignore JSON parse failure and use fallback messages below.
  }

  if (response.status === 404) {
    throw new Error(payload.error || '分享已失效或不存在');
  }

  if (!response.ok || !payload.map) {
    throw new Error(payload.error || '分享读取失败，请稍后重试。');
  }

  return payload.map;
}
