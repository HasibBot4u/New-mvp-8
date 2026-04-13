import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, AlertTriangle, Info, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StudentLayout } from '../components/layout/StudentLayout';
import { SEO } from '../components/SEO';
import { Skeleton } from '../components/ui/Skeleton';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
          
        if (!error && data) {
          setNotifications(data);
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [user]);

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
        
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    if (!notification.is_read) {
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification.id);
          
        setNotifications(prev => prev.map(n => 
          n.id === notification.id ? { ...n, is_read: true } : n
        ));
      } catch (err) {
        console.error('Error marking as read:', err);
      }
    }
    
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'এইমাত্র';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} মিনিট আগে`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ঘণ্টা আগে`;
    return `${Math.floor(diffInSeconds / 86400)} দিন আগে`;
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <StudentLayout>
      <SEO title="নোটিফিকেশন | NexusEdu" />
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 bangla mb-1">নোটিফিকেশন</h1>
            <p className="text-gray-600 bangla">আপনার সাম্প্রতিক আপডেটসমূহ</p>
          </div>
          {unreadCount > 0 && (
            <button 
              onClick={markAllAsRead}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium bangla bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              সব পড়া হিসেবে চিহ্নিত করুন
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {notifications.map(notification => (
                <div 
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 flex gap-4 hover:bg-gray-50 transition-colors cursor-pointer relative ${!notification.is_read ? 'bg-indigo-50/30' : ''}`}
                >
                  {!notification.is_read && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                  )}
                  <div className="shrink-0 mt-1">
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h3 className={`font-medium bangla truncate ${!notification.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                        {notification.title_bn || notification.title}
                      </h3>
                      <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 bangla">
                        {getTimeAgo(notification.created_at)}
                      </span>
                    </div>
                    <p className={`text-sm bangla line-clamp-2 ${!notification.is_read ? 'text-gray-700' : 'text-gray-500'}`}>
                      {notification.body_bn || notification.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 bangla mb-1">কোনো নোটিফিকেশন নেই</h3>
              <p className="text-gray-500 bangla">আপনার সব নোটিফিকেশন এখানে দেখা যাবে</p>
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
}
