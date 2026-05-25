import React, { useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Button } from '../components/ui/Button';
import { UploadCloud, Search, CheckCircle2, Loader2, FileText, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { addGeneratedMap } from '../lib/mockData';
import { generateReadingMap } from '../services/geminiService';
import { parseUploadedFile } from '../services/fileParser';

type Status = 'idle' | 'parsing' | 'generating' | 'done' | 'error';

export function GenerationCenter() {
  const { t, searchQuery, searchAuthor, navigate } = useApp();
  const [status, setStatus] = useState<Status>('idle');
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setStatus('idle');
      setMessage('');
      setWarnings([]);
    }
  };

  const handleGenerateFromFile = async () => {
    if (!selectedFile) {
      return;
    }

    setStatus('parsing');
    setMessage(t('gen', 'parsing'));
    setWarnings([]);

    try {
      const parsed = await parseUploadedFile(selectedFile);
      setWarnings(parsed.warnings);
      setStatus('generating');
      setMessage(t('gen', 'statusGenerating'));

      const newMap = await generateReadingMap({
        title: parsed.title,
        author: parsed.author,
        content: parsed.text,
        sourceKind: 'upload',
      });

      addGeneratedMap(newMap);
      setGeneratedId(newMap.id);
      setStatus('done');
      setMessage(t('gen', 'statusDone'));
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Generation failed.';
      setStatus('error');
      setMessage(nextMessage);
    }
  };

  const handleGenerateFromQuery = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setStatus('generating');
    setMessage(t('gen', 'statusGenerating'));
    setWarnings([]);

    try {
      const newMap = await generateReadingMap({
        title: searchQuery.trim(),
        author: searchAuthor || undefined,
        sourceKind: 'catalog',
      });

      addGeneratedMap(newMap);
      setGeneratedId(newMap.id);
      setStatus('done');
      setMessage(t('gen', 'statusDone'));
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Generation failed.';
      setStatus('error');
      setMessage(nextMessage);
    }
  };

  return (
    <div className="mx-auto max-w-5xl pb-12 min-h-screen bg-[#0f1117] text-zinc-300 px-4 sm:px-6 lg:px-8 pt-8">
      <div className="mb-8 sm:mb-10 text-center">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-white">{t('gen', 'title')}</h1>
        <p className="mt-2 sm:mt-3 text-base sm:text-lg text-zinc-400">{t('gen', 'subtitle')}</p>
      </div>

      {status === 'idle' ? (
        <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col rounded-3xl border border-white/5 bg-white/[0.02] p-6 sm:p-8 transition-colors hover:bg-white/[0.04]"
          >
            <div className="mb-4 sm:mb-6 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <UploadCloud className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">{t('gen', 'uploadTitle')}</h2>
            <p className="mt-2 text-sm sm:text-base text-zinc-400 flex-1">{t('gen', 'uploadDesc')}</p>

            <div className="mt-6 rounded-2xl border border-white/5 bg-zinc-950/40 p-4 text-sm text-zinc-500">
              自己上传文件生成阅读地图，适合已有 TXT / MD / EPUB 正文时直接使用。
            </div>

            <div className="mt-6 sm:mt-8 rounded-xl border-2 border-dashed border-white/10 bg-zinc-900/50 p-6 sm:p-8 text-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept=".epub,.txt,.md,.markdown"
              />
              {!selectedFile ? (
                <>
                  <Button
                    variant="secondary"
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border-none"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    选择文件
                  </Button>
                  <p className="mt-3 text-xs text-zinc-500">仅支持 EPUB / TXT / MD。</p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 text-amber-500">
                    <FileText className="h-5 w-5" />
                    <span className="text-sm font-medium truncate max-w-[220px]">{selectedFile.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{t('gen', 'selectedFile')}</p>
                  <div className="flex gap-2 w-full">
                    <Button variant="outline" className="flex-1 border-white/10" onClick={() => setSelectedFile(null)}>
                      取消
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-zinc-900 border-none"
                      onClick={handleGenerateFromFile}
                    >
                      {t('gen', 'uploadBtn')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col rounded-3xl border border-white/5 bg-white/[0.02] p-6 sm:p-8 transition-colors hover:bg-white/[0.04] relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4">
              <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-bold text-amber-500">
                按书名生成
              </span>
            </div>
            <div className="mb-4 sm:mb-6 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <Search className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">{t('gen', 'paidTitle')}</h2>
            <p className="mt-2 text-sm sm:text-base text-zinc-400 flex-1">{t('gen', 'paidDesc')}</p>

            <div className="mt-6 rounded-2xl border border-white/5 bg-zinc-950/40 p-4 text-sm text-zinc-500">
              没有文件时，直接按书名全网搜索并生成阅读地图。
            </div>

            <div className="mt-6 sm:mt-8 space-y-4">
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3">
                <label className="text-[10px] sm:text-xs font-medium text-zinc-500 uppercase tracking-wider">目标书目</label>
              <div className="font-medium text-white mt-1 text-sm sm:text-base">{searchQuery || '请输入书名'}</div>
              {searchAuthor && <div className="mt-1 text-xs text-zinc-500">{searchAuthor}</div>}
            </div>
              <Button
                variant="primary"
                className="w-full h-12 sm:h-14 text-base sm:text-lg bg-amber-500 hover:bg-amber-600 text-zinc-900 border-none"
                onClick={handleGenerateFromQuery}
                disabled={!searchQuery.trim()}
              >
                {t('gen', 'payBtn')}
              </Button>
            </div>
          </motion.div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto max-w-2xl rounded-3xl border border-white/5 bg-white/[0.02] p-8 sm:p-12 text-center"
        >
          {status === 'parsing' || status === 'generating' ? (
            <>
              <Loader2 className="mx-auto h-12 w-12 sm:h-16 sm:w-16 animate-spin text-amber-500" />
              <h2 className="mt-4 sm:mt-6 text-xl sm:text-2xl font-bold text-white">{message}</h2>
              <p className="mt-2 text-sm sm:text-base text-zinc-400">正在生成阅读地图，请稍候。</p>
            </>
          ) : status === 'done' ? (
            <>
              <div className="mx-auto flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <h2 className="mt-4 sm:mt-6 text-xl sm:text-2xl font-bold text-white">{t('gen', 'statusDone')}</h2>
              <p className="mt-2 text-sm text-zinc-400">{message}</p>
              {warnings.length > 0 && (
                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-left text-sm text-amber-100">
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
              <div className="mt-6 sm:mt-8">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-zinc-900 border-none"
                  onClick={() => {
                    if (generatedId) {
                      navigate('map', { mapId: generatedId });
                    }
                  }}
                >
                  查看阅读地图
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <h2 className="mt-4 sm:mt-6 text-xl sm:text-2xl font-bold text-white">生成失败</h2>
              <p className="mt-2 text-sm sm:text-base text-zinc-400">{message}</p>
              <div className="mt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button variant="outline" className="border-white/10 hover:bg-white/5" onClick={() => setStatus('idle')}>
                    返回
                  </Button>
                  <Button variant="outline" className="border-amber-500/20 text-amber-200 hover:bg-amber-500/10" onClick={() => navigate('profile')}>
                    查看账户
                  </Button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
