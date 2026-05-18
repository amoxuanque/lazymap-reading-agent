import JSZip from 'jszip';

export interface ParsedUpload {
  title: string;
  author?: string;
  text: string;
  sourceType: 'epub' | 'text';
  warnings: string[];
}

function getFileExtension(fileName: string) {
  const chunks = fileName.toLowerCase().split('.');
  return chunks.length > 1 ? chunks.pop() || '' : '';
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function extractBodyTextFromMarkup(markup: string) {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const nodes = Array.from(doc.querySelectorAll('h1, h2, h3, h4, p, li, blockquote'));
  const text = nodes
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean)
    .join('\n\n');

  return normalizeWhitespace(text);
}

function dirname(path: string) {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index + 1);
}

function resolveRelativePath(baseDir: string, target: string) {
  const segments = `${baseDir}${target}`.split('/');
  const output: string[] = [];

  segments.forEach((segment) => {
    if (!segment || segment === '.') {
      return;
    }
    if (segment === '..') {
      output.pop();
      return;
    }
    output.push(segment);
  });

  return output.join('/');
}

async function parseEpub(file: File): Promise<ParsedUpload> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const warnings: string[] = [];
  const containerEntry = zip.file('META-INF/container.xml');

  if (!containerEntry) {
    throw new Error('无法读取 EPUB 容器文件，当前文件可能不是标准 EPUB。');
  }

  const containerXml = await containerEntry.async('string');
  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/i);

  if (!rootfileMatch?.[1]) {
    throw new Error('无法定位 EPUB 的 OPF 清单文件。');
  }

  const opfPath = rootfileMatch[1];
  const opfEntry = zip.file(opfPath);

  if (!opfEntry) {
    throw new Error('EPUB 清单文件缺失，无法继续解析。');
  }

  const opfXml = await opfEntry.async('string');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');
  const packageDir = dirname(opfPath);

  const title =
    opfDoc.querySelector('metadata > title, metadata > dc\\:title, dc\\:title')?.textContent?.trim() ||
    file.name.replace(/\.[^.]+$/, '');
  const author =
    opfDoc.querySelector('metadata > creator, metadata > dc\\:creator, dc\\:creator')?.textContent?.trim() || undefined;

  const manifest = new Map<string, string>();
  Array.from(opfDoc.querySelectorAll('manifest > item')).forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifest.set(id, resolveRelativePath(packageDir, href));
    }
  });

  let spineFiles = Array.from(opfDoc.querySelectorAll('spine > itemref'))
    .map((item) => manifest.get(item.getAttribute('idref') || ''))
    .filter((value): value is string => Boolean(value));

  if (spineFiles.length === 0) {
    warnings.push('未读取到章节顺序，已退回到直接扫描 EPUB 内的 HTML/XHTML 文件。');
    spineFiles = Object.keys(zip.files).filter((name) => /\.(xhtml|html|htm)$/i.test(name));
  }

  const chapterTexts: string[] = [];
  for (const chapterPath of spineFiles) {
    const chapterEntry = zip.file(chapterPath);
    if (!chapterEntry) {
      continue;
    }

    const markup = await chapterEntry.async('string');
    const text = extractBodyTextFromMarkup(markup);
    if (text) {
      chapterTexts.push(text);
    }
  }

  const combined = normalizeWhitespace(chapterTexts.join('\n\n'));
  if (!combined) {
    throw new Error('EPUB 已打开，但没有提取到可用正文。');
  }

  return {
    title,
    author,
    text: combined.slice(0, 180000),
    sourceType: 'epub',
    warnings,
  };
}

async function parseTextLikeFile(file: File): Promise<ParsedUpload> {
  const text = normalizeWhitespace(await file.text());

  if (!text) {
    throw new Error('文件内容为空，无法生成阅读地图。');
  }

  const firstHeading =
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && line.length <= 80) || file.name.replace(/\.[^.]+$/, '');

  return {
    title: firstHeading.replace(/^#+\s*/, ''),
    text: text.slice(0, 180000),
    sourceType: 'text',
    warnings: [],
  };
}

export async function parseUploadedFile(file: File): Promise<ParsedUpload> {
  const extension = getFileExtension(file.name);

  if (extension === 'epub') {
    return parseEpub(file);
  }

  if (['txt', 'md', 'markdown'].includes(extension) || file.type.startsWith('text/')) {
    return parseTextLikeFile(file);
  }

  if (extension === 'pdf') {
    throw new Error('当前仅支持 EPUB / TXT / MD，暂不支持 PDF。请换成这些格式后再生成。');
  }

  throw new Error('当前仅支持 EPUB / TXT / MD。请上传这些格式的文件。');
}
