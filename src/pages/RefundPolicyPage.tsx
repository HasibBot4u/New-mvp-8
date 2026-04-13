import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '../components/SEO';

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SEO title="রিফান্ড পলিসি | NexusEdu" />
      <div className="max-w-4xl mx-auto px-4">
        <Link to="/" className="inline-flex items-center text-indigo-600 hover:text-indigo-700 mb-8 bangla">
          <ArrowLeft className="w-4 h-4 mr-2" />
          হোমে ফিরে যান
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-6 bangla">রিফান্ড পলিসি</h1>
        <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
          <p className="text-gray-600 bangla">খুব শীঘ্রই আসছে...</p>
        </div>
      </div>
    </div>
  );
}
