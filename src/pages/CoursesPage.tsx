import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Atom, Beaker, Calculator, PlayCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Skeleton } from '../components/ui/Skeleton';
import { StudentLayout } from '../components/layout/StudentLayout';
import { SEO } from '../components/SEO';
import { motion } from 'framer-motion';

export function CoursesPage() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        // Lightweight query — no deep join
        const { data, error } = await supabase
          .from('subjects')
          .select('id, name, name_bn, slug, icon, color, thumbnail_color, display_order')
          .eq('is_active', true)
          .order('display_order');
        if (error) throw error;
        setSubjects(data || []);
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSubjects();
  }, []);

  const getStyle = (name: string) => {
    if (name.includes('Physics') || name.includes('পদার্থ'))
      return { Icon: Atom, gradient: 'from-blue-500 to-blue-700' };
    if (name.includes('Chemistry') || name.includes('রসায়ন'))
      return { Icon: Beaker, gradient: 'from-purple-500 to-purple-700' };
    if (name.includes('Math') || name.includes('গণিত'))
      return { Icon: Calculator, gradient: 'from-green-500 to-green-700' };
    return { Icon: Atom, gradient: 'from-indigo-500 to-indigo-700' };
  };

  return (
    <StudentLayout>
      <SEO title="বিষয়সমূহ | NexusEdu" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="bangla text-3xl font-bold text-gray-900 mb-2">বিষয়সমূহ</h1>
          <p className="bangla text-gray-600">আপনার প্রয়োজনীয় বিষয় নির্বাচন করুন</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <p className="bangla text-red-700 mb-3">বিষয় লোড করতে সমস্যা হয়েছে</p>
            <button onClick={() => window.location.reload()}
              className="bangla px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
              রিলোড করুন
            </button>
          </div>
        ) : subjects.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
            <p className="bangla text-amber-700">কোনো বিষয় পাওয়া যায়নি।</p>
            <p className="bangla text-amber-600 text-sm mt-1">Admin প্যানেল থেকে বিষয় যোগ করুন।</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subjects.map(subject => {
              const { Icon, gradient } = getStyle(subject.name);
              return (
                <Link
                  key={subject.id}
                  to={`/subject/${subject.slug}`}
                  className={`bg-gradient-to-br ${gradient} rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1 group relative overflow-hidden flex flex-col h-44`}
                >
                  <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                  <div className="relative z-10 flex justify-between items-start mb-auto">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center border border-white/20">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <PlayCircle className="w-5 h-5 text-white/70" />
                  </div>
                  <div className="relative z-10 mt-4">
                    <h3 className="bangla text-xl font-bold text-white mb-0.5">{subject.name_bn || subject.name}</h3>
                    <div className="flex items-center gap-1 text-white/70 text-sm">
                      <span className="bangla">কোর্স দেখুন</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </StudentLayout>
  );
}
