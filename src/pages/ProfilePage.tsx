import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Clock, BookOpen, LogOut, Edit2, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { StudentLayout } from '../components/layout/StudentLayout';
import { SEO } from '../components/SEO';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

export function ProfilePage() {
  const { user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ totalHours: 0, completedVideos: 0 });
  const [isLoading, setIsLoading] = useState(true);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setIsLoading(false); }, 5000);

    const run = async () => {
      try {
        const [profResult, histResult] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('watch_history').select('progress_seconds,completed').eq('user_id', user.id)
        ]);
        if (cancelled) return;
        if (profResult.data) {
          setProfile(profResult.data);
          setEditName(profResult.data.display_name || '');
        }
        if (histResult.data) {
          const done = histResult.data.filter((w: any) => w.completed).length;
          const secs = histResult.data.reduce((a: number, w: any) => a + (w.progress_seconds || 0), 0);
          setStats({ completedVideos: done, totalHours: Math.floor(secs / 3600) });
        }
      } catch { /* show empty state */ }
      finally { if (!cancelled) { clearTimeout(timer); setIsLoading(false); } }
    };
    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleSaveProfile = async () => {
    if (!user || !editName.trim()) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: editName.trim() })
        .eq('id', user.id);
        
      if (error) throw error;
      
      setProfile({ ...profile, display_name: editName.trim() });
      await refreshProfile();
      showToast('প্রোফাইল আপডেট করা হয়েছে');
      setIsEditModalOpen(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('প্রোফাইল আপডেট করতে সমস্যা হয়েছে');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <StudentLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </StudentLayout>
    );
  }

  if (!profile) {
    return (
      <StudentLayout>
        <SEO title="প্রোফাইল | NexusEdu" />
        <div className="max-w-3xl mx-auto text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 bangla mb-2">প্রোফাইল লোড করা যায়নি</h2>
          <button onClick={() => window.location.reload()} className="text-indigo-600 hover:underline bangla">
            আবার চেষ্টা করুন
          </button>
        </div>
      </StudentLayout>
    );
  }

  const displayName = profile.display_name || user?.email?.split('@')[0] || 'শিক্ষার্থী';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <StudentLayout>
      <SEO title="আমার প্রোফাইল | NexusEdu" />
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="bangla text-3xl font-bold text-gray-900 mb-2">আমার প্রোফাইল</h1>
          <p className="bangla text-gray-600">আপনার ব্যক্তিগত তথ্য এবং পরিসংখ্যান</p>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600 relative">
            {profile.role === 'admin' && (
              <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1.5 text-white border border-white/20">
                <Shield className="w-4 h-4" />
                <span className="text-sm font-medium bangla">অ্যাডমিন</span>
              </div>
            )}
          </div>
          <div className="px-8 pb-8 relative">
            <div className="flex justify-between items-end mb-6">
              <div className="-mt-16 relative">
                {profile.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt={displayName} 
                    className="w-32 h-32 rounded-full border-4 border-white shadow-md object-cover bg-white"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full border-4 border-white shadow-md bg-indigo-100 flex items-center justify-center text-indigo-600 text-5xl font-bold">
                    {initial}
                  </div>
                )}
                <button 
                  onClick={() => setIsEditModalOpen(true)}
                  className="absolute bottom-0 right-0 p-2 bg-white rounded-full shadow-md border border-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => navigate('/forgot-password')}
                  className="px-4 py-2 bg-gray-50 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors bangla border border-gray-200"
                >
                  পাসওয়ার্ড পরিবর্তন
                </button>
                <button 
                  onClick={handleSignOut}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors bangla flex items-center gap-2 border border-red-100"
                >
                  <LogOut className="w-4 h-4" />
                  সাইন আউট
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 bangla mb-1">{displayName}</h2>
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Mail className="w-4 h-4" />
                <span>{user?.email}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-500 mb-4">
                <Clock className="w-4 h-4" />
                <span className="bangla">সদস্য: {new Date(profile.created_at).toLocaleDateString('bn-BD')}</span>
              </div>
              
              {profile.phone && (
                <div className="flex items-center gap-2 text-gray-500">
                  <User className="w-4 h-4" />
                  <span>{profile.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <p className="text-gray-500 text-sm font-medium bangla mb-1">মোট দেখার সময়</p>
              <h3 className="text-2xl font-bold text-gray-900 bangla">{stats.totalHours} ঘণ্টা</h3>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
            <div className="w-14 h-14 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
              <BookOpen className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <p className="text-gray-500 text-sm font-medium bangla mb-1">সম্পূর্ণ করা ক্লাস</p>
              <h3 className="text-2xl font-bold text-gray-900 bangla">{stats.completedVideos} টি</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !isSaving && setIsEditModalOpen(false)}
        title="প্রোফাইল আপডেট করুন"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 bangla">আপনার নাম</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              placeholder="আপনার নাম লিখুন"
              disabled={isSaving}
            />
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSaving}
              className="bangla"
            >
              বাতিল
            </Button>
            <Button
              onClick={handleSaveProfile}
              isLoading={isSaving}
              disabled={!editName.trim() || isSaving}
              className="bangla"
            >
              সেভ করুন
            </Button>
          </div>
        </div>
      </Modal>
    </StudentLayout>
  );
}
