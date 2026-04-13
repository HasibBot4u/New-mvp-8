import React, { useState, useEffect } from 'react';
import { useCatalog } from '../../contexts/CatalogContext';
import { useToast } from '../../components/ui/Toast';
import { Activity, RefreshCw, Zap, Bug, Database, Settings as SettingsIcon, ShieldAlert, CheckCircle, XCircle, Key } from 'lucide-react';
import { getWorkingBackend, api } from '../../lib/api';
import { useSystemSettings } from '../../contexts/SystemSettingsContext';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';

interface HealthData {
  status: string;
  telegram: string;
  videos_cached: number;
  messages_cached: number;
  channels_resolved: number;
  catalog_age_seconds: number;
}

export const AdminSystem: React.FC = () => {
  const { catalog, refreshCatalog } = useCatalog();
  const { refreshSettings } = useSystemSettings();
  const { showToast } = useToast();
  
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(true);
  const [debugData, setDebugData] = useState<any>(null);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('key, value');
        if (data && !error) {
          setRegistrationsOpen(data.find(x => x.key === 'registrations_open')?.value === 'true');
          setMaintenanceMode(data.find(x => x.key === 'maintenance_mode')?.value === 'true');
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const fetchHealth = async () => {
    try {
      const data = await api.fetchBackendHealth();
      setHealth(data as any);
    } catch {
      setHealth(null);
    } finally {
      setIsHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleForceRefresh = async () => {
    setIsActionLoading('refresh');
    try {
      await refreshCatalog();
      showToast('Catalog cache refreshed successfully');
    } catch {
      showToast('Failed to refresh catalog');
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleForceWarmup = async () => {
    setIsActionLoading('warmup');
    try {
      const backend = await getWorkingBackend();
      const res = await fetch(`${backend}/api/warmup`);
      if (res.ok) {
        showToast('Backend warmup initiated successfully');
      } else {
        showToast('Failed to initiate warmup');
      }
    } catch {
      showToast('Error connecting to backend');
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleViewDebug = async () => {
    setIsActionLoading('debug');
    try {
      const backend = await getWorkingBackend();
      const token = import.meta.env.VITE_ADMIN_TOKEN || '';
      const res = await fetch(`${backend}/api/debug`, {
        headers: { 'X-Admin-Token': token }
      });
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setDebugData(data);
          setShowDebugModal(true);
        } catch {
          showToast('Invalid JSON from debug endpoint');
          console.error('Invalid JSON from debug endpoint:', text.substring(0, 100));
        }
      } else {
        showToast('Failed to fetch debug info');
      }
    } catch {
      showToast('Error connecting to backend');
    } finally {
      setIsActionLoading(null);
    }
  };

  const toggleMaintenanceMode = async () => {
    const newValue = !maintenanceMode;
    setMaintenanceMode(newValue);
    try {
      await supabase
        .from('system_settings')
        .update({ value: newValue ? 'true' : 'false' })
        .eq('key', 'maintenance_mode');
      await refreshSettings();
      showToast(`Maintenance mode ${newValue ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error('Error updating maintenance setting:', err);
      showToast('Failed to update maintenance setting');
      setMaintenanceMode(!newValue); // Revert on failure
    }
  };

  const toggleRegistrations = async () => {
    const newValue = !registrationsOpen;
    setRegistrationsOpen(newValue);
    try {
      await supabase
        .from('system_settings')
        .update({ value: newValue ? 'true' : 'false' })
        .eq('key', 'registrations_open');
      await refreshSettings();
      showToast(`Registrations ${newValue ? 'opened' : 'closed'}`);
    } catch (err) {
      console.error('Error updating registrations setting:', err);
      showToast('Failed to update registrations setting');
      setRegistrationsOpen(!newValue); // Revert on failure
    }
  };

  const isHealthy = health?.status === 'ok';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">System Controls</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Backend Status */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Backend Status
            </h2>
            {isHealthLoading ? (
              <span className="text-sm text-text-secondary">Checking...</span>
            ) : (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${isHealthy ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                {isHealthy ? 'Healthy' : 'Degraded'}
              </span>
            )}
          </div>

          {health ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-secondary">Status</span>
                <span className="font-medium text-text-primary">{health.status}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-secondary">Telegram Connection</span>
                <span className="font-medium text-text-primary">{health.telegram}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-secondary">Videos Cached</span>
                <span className="font-medium text-text-primary">{health.videos_cached}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-secondary">Messages Cached</span>
                <span className="font-medium text-text-primary">{health.messages_cached}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-secondary">Channels Resolved</span>
                <span className="font-medium text-text-primary">{health.channels_resolved}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-text-secondary">Catalog Age (seconds)</span>
                <span className="font-medium text-text-primary">{health.catalog_age_seconds}</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-text-secondary">
              Unable to reach backend server
            </div>
          )}
        </div>

        {/* Section 2: Backend Controls */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-4">
            <SettingsIcon className="w-5 h-5 text-primary" />
            Backend Controls
          </h2>
          
          <div className="space-y-4">
            <button
              onClick={handleForceRefresh}
              disabled={isActionLoading !== null}
              className="w-full flex items-center justify-between px-4 py-3 bg-background border border-border rounded-lg hover:border-primary transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <RefreshCw className={`w-5 h-5 text-blue-500 ${isActionLoading === 'refresh' ? 'animate-spin' : ''}`} />
                <div className="text-left">
                  <div className="font-medium text-text-primary">Force Refresh Catalog</div>
                  <div className="text-xs text-text-secondary">Refresh catalog cache from database</div>
                </div>
              </div>
            </button>

            <button
              onClick={handleForceWarmup}
              disabled={isActionLoading !== null}
              className="w-full flex items-center justify-between px-4 py-3 bg-background border border-border rounded-lg hover:border-primary transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <Zap className={`w-5 h-5 text-yellow-500 ${isActionLoading === 'warmup' ? 'animate-pulse' : ''}`} />
                <div className="text-left">
                  <div className="font-medium text-text-primary">Force Warmup</div>
                  <div className="text-xs text-text-secondary">Pre-warm Telegram message cache</div>
                </div>
              </div>
            </button>

            <button
              onClick={handleViewDebug}
              disabled={isActionLoading !== null}
              className="w-full flex items-center justify-between px-4 py-3 bg-background border border-border rounded-lg hover:border-primary transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <Bug className={`w-5 h-5 text-purple-500 ${isActionLoading === 'debug' ? 'animate-pulse' : ''}`} />
                <div className="text-left">
                  <div className="font-medium text-text-primary">View Debug Info</div>
                  <div className="text-xs text-text-secondary">Get detailed system debug JSON</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Section 4: Cache Stats */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-primary" />
            Cache Stats
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-text-primary mb-1">{catalog?.total_videos || 0}</div>
                <div className="text-xs text-text-secondary">Videos in Map</div>
              </div>
              <div className="bg-background border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-text-primary mb-1">{health?.messages_cached || 0}</div>
                <div className="text-xs text-text-secondary">Messages Cached</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between py-2 border-t border-border mt-4">
              <span className="text-sm text-text-secondary">Catalog Last Updated</span>
              <span className="text-sm font-medium text-text-primary">
                {health ? `${health.catalog_age_seconds}s ago` : 'Unknown'}
              </span>
            </div>
            
            <button
              onClick={handleForceRefresh}
              className="w-full py-2 mt-2 bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20 transition-colors text-sm"
            >
              Clear Cache
            </button>
          </div>
        </div>

        {/* Section 5: Platform Settings */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Platform Settings
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
              <div>
                <div className="font-medium text-text-primary">Maintenance Mode</div>
                <div className="text-xs text-text-secondary">Show maintenance page to non-admins</div>
              </div>
              <button
                onClick={toggleMaintenanceMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${maintenanceMode ? 'bg-primary' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
              <div>
                <div className="font-medium text-text-primary">New User Registrations</div>
                <div className="text-xs text-text-secondary">Allow new users to sign up</div>
              </div>
              <button
                onClick={toggleRegistrations}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${registrationsOpen ? 'bg-primary' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${registrationsOpen ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Section 6: Enrollment Management */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-4">
            <Key className="w-5 h-5 text-primary" />
            Enrollment Management
          </h2>
          
          <div className="space-y-4">
            <p className="text-sm text-text-secondary mb-4">
              Manage chapter-specific access codes for students.
            </p>
            <Link to="/admin/enrollment" className="bangla w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm">
              এনরোলমেন্ট কোড পরিচালনা করুন →
            </Link>
          </div>
        </div>
      </div>

      {/* Section 3: Telegram Channels Status */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-text-primary mb-4">Telegram Channels Status</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 font-medium text-text-secondary text-sm">Channel Name</th>
                <th className="pb-3 font-medium text-text-secondary text-sm">Subject</th>
                <th className="pb-3 font-medium text-text-secondary text-sm">Cycle</th>
                <th className="pb-3 font-medium text-text-secondary text-sm">Channel ID</th>
                <th className="pb-3 font-medium text-text-secondary text-sm">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {catalog?.subjects.flatMap(subject => 
                subject.cycles.map(cycle => (
                  <tr key={cycle.id} className="hover:bg-background/50">
                    <td className="py-3 text-sm font-medium text-text-primary">{cycle.name} Channel</td>
                    <td className="py-3 text-sm text-text-secondary">{subject.name}</td>
                    <td className="py-3 text-sm text-text-secondary">{cycle.name}</td>
                    <td className="py-3 text-sm font-mono text-text-secondary">{cycle.telegram_channel_id || '—'}</td>
                    <td className="py-3 text-sm">
                      {cycle.telegram_channel_id ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-500 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-500 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          Not Set
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>



      {/* Debug Modal */}
      {showDebugModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowDebugModal(false)}>
          <div 
            className="bg-surface border border-border rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-bold text-text-primary">System Debug Info</h3>
              <button 
                onClick={() => setShowDebugModal(false)}
                className="p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-background"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <pre className="text-xs font-mono text-green-400 bg-gray-950 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(debugData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
