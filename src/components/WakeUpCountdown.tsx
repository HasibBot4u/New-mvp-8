import { useState, useEffect, useCallback, useRef } from 'react';
import { Wifi, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

interface WakeUpCountdownProps {
  onReady: () => void;
  onGiveUp: () => void;
}

export function WakeUpCountdown({ onReady, onGiveUp }: WakeUpCountdownProps) {
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<'warming' | 'connecting' | 'ready' | 'failed'>('warming');
  const [pollCount, setPollCount] = useState(0);
  const stoppedRef = useRef(false);

  const checkAndReady = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      const health = await api.fetchBackendHealth();
      const tg = (health as any).telegram;
      if (tg === 'connected') {
        setStatus('ready');
        stoppedRef.current = true;
        setTimeout(onReady, 500);
        return true;
      }
      setStatus(tg === 'reconnecting' ? 'connecting' : 'warming');
    } catch {
      setStatus('warming');
    }
    return false;
  }, [onReady]);

  useEffect(() => {
    stoppedRef.current = false;

    // Poll health every 4 seconds
    const pollInterval = setInterval(async () => {
      if (stoppedRef.current) return;
      setPollCount(p => p + 1);
      await checkAndReady();
    }, 4000);

    // Elapsed counter every second
    const tickInterval = setInterval(() => {
      if (stoppedRef.current) return;
      setElapsed(e => e + 1);
    }, 1000);

    // First check immediately
    checkAndReady();

    // Give up after 90 seconds
    const giveUpTimer = setTimeout(() => {
      if (!stoppedRef.current) {
        stoppedRef.current = true;
        setStatus('failed');
        clearInterval(pollInterval);
        clearInterval(tickInterval);
      }
    }, 90000);

    return () => {
      stoppedRef.current = true;
      clearInterval(pollInterval);
      clearInterval(tickInterval);
      clearTimeout(giveUpTimer);
    };
  }, [checkAndReady]);

  const handleManualRetry = useCallback(async () => {
    stoppedRef.current = false;
    setStatus('warming');
    setElapsed(0);
    setPollCount(0);
    // Trigger warmup
    try {
      const backend = await api.getWorkingBackend();
      fetch(`${backend}/api/warmup`).catch(() => {});
    } catch { /* ignore */ }
    const ready = await checkAndReady();
    if (!ready) {
      // Restart polling
      const id = setInterval(async () => {
        if (stoppedRef.current) { clearInterval(id); return; }
        const done = await checkAndReady();
        if (done) clearInterval(id);
      }, 4000);
      setTimeout(() => {
        clearInterval(id);
        if (!stoppedRef.current) { setStatus('failed'); stoppedRef.current = true; }
      }, 90000);
    }
  }, [checkAndReady]);

  const statusConfig = {
    warming:    { text: 'সার্ভার চালু হচ্ছে...', color: 'text-amber-600', dot: 'bg-amber-500' },
    connecting: { text: 'টেলিগ্রামে সংযোগ হচ্ছে...', color: 'text-blue-600', dot: 'bg-blue-500' },
    ready:      { text: 'প্রস্তুত! শুরু হচ্ছে...', color: 'text-green-600', dot: 'bg-green-500' },
    failed:     { text: 'সংযোগ ব্যর্থ', color: 'text-red-600', dot: 'bg-red-500' },
  };

  const cfg = statusConfig[status];

  return (
    <div className="absolute inset-0 bg-gray-950/95 flex flex-col items-center justify-center text-white z-20 rounded-xl p-6">
      <div className="w-16 h-16 bg-indigo-900/50 rounded-full flex items-center justify-center mb-4 relative">
        <Wifi className="w-7 h-7 text-indigo-300" />
        {status !== 'failed' && (
          <span className={`absolute -top-1 -right-1 w-4 h-4 ${cfg.dot} rounded-full animate-pulse`} />
        )}
      </div>

      <h3 className={`bangla text-lg font-bold mb-1 ${cfg.color}`}>{cfg.text}</h3>

      {status !== 'failed' ? (
        <>
          <p className="bangla text-gray-400 text-sm text-center mb-4 max-w-xs">
            আমাদের ভিডিও সার্ভারটি ঘুম থেকে উঠছে। সাধারণত ৩০-৬০ সেকেন্ড লাগে।
          </p>

          {/* Animated dots instead of countdown */}
          <div className="flex items-center gap-2 mb-4">
            {[0,1,2,3,4].map(i => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  i < (pollCount % 6) ? 'bg-indigo-400' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>

          <p className="text-gray-500 text-xs bangla">{elapsed} সেকেন্ড অতিবাহিত</p>
          <p className="text-gray-600 text-xs mt-1">প্রতি ৪ সেকেন্ডে স্বয়ংক্রিয় পরীক্ষা হচ্ছে...</p>
        </>
      ) : (
        <>
          <p className="bangla text-gray-400 text-sm text-center mb-6 max-w-xs">
            ৯০ সেকেন্ডেও সার্ভার সংযুক্ত হয়নি। পুনরায় চেষ্টা করুন।
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleManualRetry}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm bangla transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              পুনরায় চেষ্টা
            </button>
            <button
              onClick={onGiveUp}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm bangla transition-colors"
            >
              বাতিল করুন
            </button>
          </div>
        </>
      )}
    </div>
  );
}
