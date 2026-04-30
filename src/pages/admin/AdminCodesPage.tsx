import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { EnrollmentCode, Chapter } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const sb = supabase;

function CodeModal({ isOpen, onClose, onSave, chapters }: any) {
  const [chapterId, setChapterId] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const required = chapters.filter((c: any) => c.requires_enrollment);

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (!chapterId) return;
    onSave({ chapterId, maxUses: parseInt(maxUses) || 1 });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate Code</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Chapter</Label>
            <select required value={chapterId} onChange={e => setChapterId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select a chapter...</option>
              {required.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><Label>Max Uses</Label><Input type="number" required min="1" value={maxUses} onChange={e => setMaxUses(e.target.value)} /></div>
          <DialogFooter><Button type="submit">Generate</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCodesPage() {
  const [codes, setCodes] = useState<EnrollmentCode[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [c, ch] = await Promise.all([
      sb.from("enrollment_codes").select("*").order("created_at", { ascending: false }),
      sb.from("chapters").select("*").order("name"),
    ]);
    setCodes((c.data ?? []) as unknown as EnrollmentCode[]);
    setChapters((ch.data ?? []) as unknown as Chapter[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleGenerate = async ({ chapterId, maxUses }: any) => {
    const code = `NEX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await sb.from("enrollment_codes").insert({ code, chapter_id: chapterId, max_uses: maxUses, is_active: true });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Code generated", description: code }); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this code?")) return;
    await sb.from("enrollment_codes").delete().eq("id", id);
    load();
  };
  const copy = (code: string) => { navigator.clipboard.writeText(code); toast({ title: "Copied" }); };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  
  const hasLocked = chapters.some(c => c.requires_enrollment);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Enrollment codes</h1>
          <p className="text-foreground-dim text-sm mt-1">Grant chapter access without payment.</p>
        </div>
        <button onClick={() => hasLocked ? setShowModal(true) : toast({ title: "No locked chapters", variant: "destructive" })} className="inline-flex items-center gap-2 px-4 h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary-glow text-sm font-medium">
          <Plus className="w-4 h-4" /> New code
        </button>
      </header>
      <div className="rounded-2xl border border-white/5 bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-foreground-muted">
              <tr>
                <th className="text-left p-4">Code</th>
                <th className="text-left p-4">Chapter</th>
                <th className="text-left p-4">Uses</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => {
                const ch = chapters.find(x => x.id === c.chapter_id);
                return (
                  <tr key={c.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-4 font-mono text-primary">{c.code}</td>
                    <td className="p-4">{ch?.name ?? "—"}</td>
                    <td className="p-4">{c.uses_count} / {c.max_uses}</td>
                    <td className="p-4 text-foreground-dim">{c.is_active ? "Active" : "Disabled"}</td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => copy(c.code)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs"><Copy className="w-3 h-3" /> Copy</button>
                      <button onClick={() => remove(c.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-destructive/20 text-xs text-destructive"><Trash2 className="w-3 h-3" /> Delete</button>
                    </td>
                  </tr>
                );
              })}
              {codes.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-foreground-muted">No codes yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && <CodeModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleGenerate} chapters={chapters} />}
    </div>
  );
}
