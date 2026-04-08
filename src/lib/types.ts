export type MapStatus = 'has_map' | 'no_map_upload' | 'no_map_paid';
export type MapVisibility = 'public' | 'private' | 'unlisted';
export type SourceKind = 'library' | 'catalog' | 'openlibrary' | 'upload' | 'generated';

export interface BilingualText {
  zh: string;
  en?: string;
}

export interface SearchBook {
  id: string;
  title: string;
  author: string;
  cover: string;
  oneLiner?: Partial<BilingualText>;
  saves: number;
  status: MapStatus;
  aliases?: string[];
  subtitle?: string;
  firstPublishYear?: number;
  source?: SourceKind;
  matchReason?: string;
}

export interface OverviewCard {
  layer: string;
  title: string;
  desc: string;
  points: string[];
  color: string;
}

export interface KnowledgeArea {
  title: string;
  status: string;
  progress: number;
  color: string;
  desc: string;
}

export interface KnowledgeTool {
  title: string;
  desc: string;
  points: string[];
}

export interface ReadingPart {
  id: string;
  title: string;
  subtitle: string;
  navDesc: string;
  intro: string;
  tags: string[];
  task: string;
  takeaways: string[];
  chapters: string[];
  position: string;
}

export interface MethodItem {
  id: string;
  category: string;
  title: string;
  desc: string;
}

export interface TimelineItem {
  year: string;
  title: string;
  desc: string;
}

export interface QuoteItem {
  quote: string;
  note: string;
}

export interface DebateItem {
  title: string;
  value: string;
  reservation: string;
}

export interface ReadingRoute {
  audience: string;
  route: string;
  focus: string[];
}

export interface ReadingMap extends SearchBook {
  visibility: MapVisibility;
  about?: BilingualText;
  stats?: {
    structure: number;
    volume: number;
  };
  readingPosition?: Partial<BilingualText> | string;
  overview?: {
    title: string;
    subtitle: string;
    cards: OverviewCard[];
  };
  knowledgeMap?: {
    areas: KnowledgeArea[];
    tools: KnowledgeTool[];
  };
  parts?: ReadingPart[];
  methods?: {
    categories: string[];
    items: MethodItem[];
  };
  timeline?: TimelineItem[];
  quotes?: QuoteItem[];
  debates?: DebateItem[];
  routes?: ReadingRoute[];
  sourceMeta?: {
    kind: SourceKind;
    mode: 'source-grounded' | 'title-only' | 'prototype-fallback';
    summary?: string;
  };
}

