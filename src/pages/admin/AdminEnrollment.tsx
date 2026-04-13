import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Copy, CheckCircle2, XCircle, Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';

export const AdminEnrollment: React.FC = () => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [chapters, setChapters] = useState<any[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState('');
  
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [notes, setNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeTimer, setCodeTimer] = useState(0);
  
  const [codes, setCodes] = useState<any[]>([]);
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  
  const { showToast } = useToast();

  useEffect(() => {
    const load = async () => {
      setIsLoadingSubjects(true);
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (!error) setSubjects(data || []);
      else console.error('Subjects load error:', error);
      setIsLoadingSubjects(false);
    };
    load();
  }, []);

  const loadCodes = React.useCallback(async () => {
    try {
      const [codesRes, logsRes] = await Promise.all([
        supabase
          .from('enrollment_codes')
          .select('*, chapters(name, name_bn), subjects(name, name_bn), cycles(name)')
          .order('generated_at', { ascending: false }),
        supabase
          .from('chapter_access')
          .select('*, chapters(name, name_bn), enrollment_codes(code, label)')
          .order('first_accessed_at', { ascending: false })
          .limit(100)
      ]);

      if (codesRes.data) setCodes(codesRes.data);
      if (logsRes.data) setAccessLogs(logsRes.data);
    } catch (error) {
      console.error('Error fetching enrollment data:', error);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (codeTimer > 0) {
      interval = setInterval(() => setCodeTimer(t => t - 1), 1000);
    } else if (codeTimer === 0 && generatedCode) {
      setGeneratedCode(null);
    }
    return () => clearInterval(interval);
  }, [codeTimer, generatedCode]);

  const handleSubjectChange = async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedCycleId('');
    setSelectedChapterId('');
    setCycles([]);
    setChapters([]);
    if (!subjectId) return;
    const { data, error } = await supabase
      .from('cycles')
      .select('id, name, name_bn')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('display_order');
    if (!error) setCycles(data || []);
  };

  const handleCycleChange = async (cycleId: string) => {
    setSelectedCycleId(cycleId);
    setSelectedChapterId('');
    setChapters([]);
    if (!cycleId) return;
    const { data, error } = await supabase
      .from('chapters')
      .select('id, name, name_bn')
      .eq('cycle_id', cycleId)
      .eq('is_active', true)
      .order('display_order');
    if (!error) setChapters(data || []);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapterId) {
      showToast('চ্যাপ্টার বেছে নিন');
      return;
    }
    setIsGenerating(true);
    const { data, error } = await supabase.rpc('admin_generate_chapter_code', {
      p_chapter_id: selectedChapterId,
      p_notes:      notes || null,
      p_label:      label || null,
      p_max_uses:   maxUses || 1
    });
    
    if (error || !data?.success) {
      setIsGenerating(false);
      showToast(error?.message || data?.error || 'কোড তৈরি করতে সমস্যা হয়েছে');
      return;
    }

    if (expiresAt && data.code_id) {
      await supabase.from('enrollment_codes')
        .update({ expires_at: new Date(expiresAt).toISOString() })
        .eq('id', data.code_id);
    }

    setIsGenerating(false);
    setGeneratedCode(data.code);
    setCodeTimer(60);
    loadCodes();
    showToast('কোড সফলভাবে তৈরি হয়েছে');
  };

  const toggleCodeStatus = async (codeId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.rpc('admin_toggle_enrollment_code', {
        p_code_id: codeId,
        p_active: !currentStatus
      });

      if (error) throw error;
      loadCodes();
      showToast(`কোড ${!currentStatus ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে`);
    } catch (error) {
      console.error('Error toggling code status:', error);
      showToast('কোড আপডেট করতে সমস্যা হয়েছে');
    }
  };

  const blockAccess = async (accessId: string) => {
    const reason = window.prompt('ব্লক করার কারণ লিখুন:');
    if (reason === null) return;
    
    try {
      const { error } = await supabase.rpc('admin_block_chapter_access', {
        p_access_id: accessId,
        p_block: true,
        p_reason: reason
      });
      
      if (error) throw error;
      showToast('অ্যাক্সেস ব্লক করা হয়েছে');
      loadCodes();
    } catch (error) {
      console.error('Error blocking access:', error);
      showToast('অ্যাক্সেস ব্লক করতে সমস্যা হয়েছে');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('কোড কপি করা হয়েছে');
  };

  if (isLoadingSubjects) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-text-primary bangla">এনরোলমেন্ট কোড ম্যানেজমেন্ট</h1>
        <p className="text-text-secondary bangla">চ্যাপ্টার ভিত্তিক অ্যাক্সেস কোড তৈরি এবং পরিচালনা করুন।</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4 bangla">নতুন কোড তৈরি করুন</h2>
        
        {subjects.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg bangla">
            কোনো বিষয় নেই। প্রথমে বিষয় যোগ করুন। <a href="/admin/content" className="underline font-medium">Content Management</a>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1 bangla">বিষয়</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bangla"
                required
              >
                <option value="">বিষয় নির্বাচন করুন</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name_bn || s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1 bangla">সাইকেল</label>
              <select
                value={selectedCycleId}
                onChange={(e) => handleCycleChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bangla"
                required
                disabled={!selectedSubjectId}
              >
                <option value="">সাইকেল নির্বাচন করুন</option>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.name_bn || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1 bangla">চ্যাপ্টার</label>
              <select
                value={selectedChapterId}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bangla"
                required
                disabled={!selectedCycleId}
              >
                <option value="">চ্যাপ্টার নির্বাচন করুন</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.name_bn || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1 bangla">লেবেল (ঐচ্ছিক)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bangla"
                placeholder="যেমন: Batch 2025"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1 bangla">সর্বোচ্চ ব্যবহার</label>
              <input
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1 bangla">মেয়াদ শেষ (ঐচ্ছিক)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-text-secondary mb-1 bangla">নোট (ঐচ্ছিক)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bangla"
                placeholder="অতিরিক্ত তথ্য..."
              />
            </div>
            <div>
              <Button type="submit" disabled={isGenerating || !selectedChapterId} className="w-full bg-amber-500 hover:bg-amber-600 text-white bangla">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                কোড তৈরি করুন
              </Button>
            </div>
          </form>
        )}

        {generatedCode && (
          <div className="mt-6 p-8 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-indigo-600 font-medium bangla">কোডটি ডেটাবেসে সংরক্ষিত আছে। টাইমার শেষ হলেও কোড সক্রিয় থাকবে। ({codeTimer}s)</p>
            <div className="bg-white px-8 py-4 rounded-xl shadow-sm border border-indigo-100">
              <p className="text-3xl md:text-4xl font-mono font-bold text-indigo-900 tracking-widest">{generatedCode}</p>
            </div>
            <p className="text-sm text-indigo-500 bangla">
              {subjects.find(s => s.id === selectedSubjectId)?.name_bn} → {cycles.find(c => c.id === selectedCycleId)?.name_bn} → {chapters.find(c => c.id === selectedChapterId)?.name_bn}
            </p>
            <Button onClick={() => copyToClipboard(generatedCode)} className="bg-indigo-600 hover:bg-indigo-700 text-white bangla px-8 py-3 rounded-xl shadow-md mt-2">
              <Copy className="h-5 w-5 mr-2" /> কপি করুন
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-background/50">
            <h2 className="font-semibold text-text-primary bangla">সকল কোড</h2>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-background/50 text-text-secondary bangla">
                <tr>
                  <th className="px-4 py-3 font-medium">কোড</th>
                  <th className="px-4 py-3 font-medium">চ্যাপ্টার</th>
                  <th className="px-4 py-3 font-medium">ব্যবহৃত / সর্বোচ্চ</th>
                  <th className="px-4 py-3 font-medium">অবস্থা</th>
                  <th className="px-4 py-3 font-medium text-right">কার্যক্রম</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {codes.map((code) => (
                  <tr key={code.id} className="hover:bg-background/50">
                    <td className="px-4 py-3 font-mono text-primary font-medium">
                      {code.code.substring(0, 8)}...
                      {code.label && <span className="block text-xs text-gray-500 font-sans mt-1">{code.label}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate max-w-[150px] font-medium bangla">{code.chapters?.name_bn || code.chapters?.name}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[150px] bangla">{code.subjects?.name_bn}</div>
                    </td>
                    <td className="px-4 py-3 bangla">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${code.uses_count >= code.max_uses ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {code.uses_count} / {code.max_uses} ব্যবহার
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleCodeStatus(code.id, code.is_active)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors bangla ${
                          code.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {code.is_active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {code.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => copyToClipboard(code.code)} className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                        <Copy className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {codes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 bangla">কোনো কোড পাওয়া যায়নি</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-background/50">
            <h2 className="font-semibold text-text-primary bangla">অ্যাক্সেস লগ</h2>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-background/50 text-text-secondary bangla">
                <tr>
                  <th className="px-4 py-3 font-medium">ইমেইল</th>
                  <th className="px-4 py-3 font-medium">চ্যাপ্টার</th>
                  <th className="px-4 py-3 font-medium">ডিভাইস IP</th>
                  <th className="px-4 py-3 font-medium">অবস্থা</th>
                  <th className="px-4 py-3 font-medium text-right">কার্যক্রম</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accessLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-background/50">
                    <td className="px-4 py-3">
                      <div className="truncate max-w-[150px] font-medium" title={log.user_email}>{log.user_email}</div>
                      <div className="text-xs text-gray-500 mt-1">অ্যাক্সেস: {log.access_count} বার</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate max-w-[120px] font-medium bangla" title={log.chapters?.name_bn || log.chapters?.name}>
                        {log.chapters?.name_bn || log.chapters?.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-text-secondary font-mono bg-gray-50 px-2 py-1 rounded border border-gray-100 inline-block">
                        {log.device_ip}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.is_blocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 bangla">
                          <ShieldAlert className="h-3 w-3" /> ব্লকড
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 bangla">
                          <CheckCircle2 className="h-3 w-3" /> সক্রিয়
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!log.is_blocked && (
                        <button 
                          onClick={() => blockAccess(log.id)}
                          className="text-red-600 hover:text-red-800 p-1.5 rounded-lg hover:bg-red-50 transition-colors inline-flex items-center gap-1 text-xs font-medium bangla"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" /> ব্লক
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {accessLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 bangla">কোনো অ্যাক্সেস লগ পাওয়া যায়নি</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

