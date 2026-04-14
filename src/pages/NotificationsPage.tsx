import { useState, useEffect } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StudentLayout } from '../components/layout/StudentLayout';
import { SEO } from '../components/SEO';

interface Notification {
  id: string;
  title: string;
  title_bn?: string;
  body?: string;
  body_bn?: string;
  type: string;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    const fetchNotifications = async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        setNotifications(data || []);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };
    fetchNotifications();
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const dismiss = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-700';
      case 'warning': return 'bg-yellow-100 text-yellow-700';
      case 'system':  return 'bg-purple-100 text-purple-700';
      default:        return 'bg-blue-100 text-blue-700';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <StudentLayout>
      <SEO title="নোটিফিকেশন | NexusEdu" />
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="bangla text-2xl font-bold text-gray-900">নোটিফিকেশন</h1>
            <p className="bangla text-gray-500 text-sm mt-1">আপনার সাম্প্রতিক আপডেটসমূহ</p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors bangla"
            >
              <CheckCheck className="w-4 h-4" />
              সব পড়া হয়েছে
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="bangla text-gray-500 text-sm">লোড হচ্ছে...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="bangla font-medium text-gray-600 mb-1">কোনো নোটিফিকেশন নেই</h3>
            <p className="bangla text-gray-400 text-sm">নতুন আপডেট আসলে এখানে দেখাবে</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`bg-white rounded-xl border p-4 flex items-start gap-3 transition-colors ${
                  n.is_read ? 'border-gray-100' : 'border-indigo-200 bg-indigo-50/30'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${getTypeStyle(n.type)}`}>
                  <Bell className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="bangla font-medium text-gray-900 text-sm">
                    {n.title_bn || n.title}
                  </p>
                  {(n.body_bn || n.body) && (
                    <p className="bangla text-gray-500 text-sm mt-0.5">{n.body_bn || n.body}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n.created_at).toLocaleDateString('bn-BD')}
                  </p>
                </div>
                {!n.is_read && (
                  <button
                    onClick={() => dismiss(n.id)}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
