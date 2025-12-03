/**
 * Analytics Page - Priority 5
 * Dedicated dashboard for performance metrics and execution traces
 */

import Sidebar from '@/components/Sidebar';
import { PerformanceDashboard } from '@/components/PerformanceDashboard';
import { ExecutionTraceVisualization } from '@/components/ExecutionTraceVisualization';
import { SystemDiagnosticsPanel } from '@/components/SystemDiagnosticsPanel';
import { useObservatory } from '@/contexts/ObservatoryContext';
import { useKenshoStore } from '@/stores/useKenshoStore';
import SettingsModal from '@/components/SettingsModal';
import SearchModal from '@/components/SearchModal';
import { ObservatoryModal } from '@/components/ObservatoryModal';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Menu, BarChart3, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Analytics = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showObservatory, setShowObservatory] = useState(false);
  const [activeTab, setActiveTab] = useState<'performance' | 'execution' | 'diagnostics'>('performance');
  const { journal, workers, leader, epoch, logs, isEnabled, startObservatory, killWorker } = useObservatory();
  const clearMessages = useKenshoStore(state => state.clearMessages);

  const handleOpenObservatory = () => {
    if (!isEnabled) {
      startObservatory();
    }
    setShowObservatory(true);
  };

  const handleNewConversation = () => {
    clearMessages();
    navigate('/');
  };

  // Convert journal to mock ExecutionTrace for visualization
  const mockTrace = journal ? {
    requestId: journal.queryId,
    startTime: journal.startTime,
    endTime: journal.endTime || Date.now(),
    totalDuration: journal.totalDuration || 0,
    status: 'completed' as const,
    events: journal.steps.map((step: any, idx: number) => ({
      level: 'ROUTER' as const,
      timestamp: journal.startTime + (idx * 100),
      component: step.agent || 'System',
      action: step.action || 'processing',
      status: 'success' as const,
      data: step
    })),
    summary: {
      routerTime: 0,
      kernelTime: 0,
      executorTime: 0,
      streamTime: 0,
      engineTime: 0,
      totalTime: journal.totalDuration || 0
    }
  } : null;

  return (
    <div className="min-h-screen relative bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSearch={() => setShowSearch(true)}
        onOpenObservatory={handleOpenObservatory}
        onNewConversation={handleNewConversation}
      />

      {/* Modals */}
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
      <SearchModal open={showSearch} onOpenChange={setShowSearch} />
      <ObservatoryModal
        open={showObservatory}
        onOpenChange={setShowObservatory}
        workers={workers}
        leader={leader}
        epoch={epoch}
        logs={logs}
        onKillWorker={killWorker}
        journal={journal}
      />

      {/* Main Content */}
      <main className={cn(
        'transition-all duration-300 min-h-screen',
        !isMobile && 'ml-16 lg:ml-64',
        'pt-4'
      )}>
        <div className="max-w-7xl mx-auto">
          {/* Top Bar */}
          <div className="fixed top-4 right-4 z-50 pointer-events-none">
            <Button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              variant="ghost"
              size="icon"
              className="pointer-events-auto"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>

          {/* Page Title - MASTERPROMPT Header - Responsive */}
          <div className="px-3 sm:px-6 py-4 sm:py-6 border-b border-border/40">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-1 sm:mb-2">Analytics & Metrics</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Monitor multi-agent system performance and execution traces</p>
          </div>

          {/* Tab Navigation */}
          <div className="px-3 sm:px-6 py-4 border-b border-border/40">
            <div className="flex space-x-4">
              <button
                onClick={() => setActiveTab('performance')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'performance' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Performance</span>
              </button>
              <button
                onClick={() => setActiveTab('execution')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'execution' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Activity className="h-4 w-4" />
                <span>Traces d'Exécution</span>
              </button>
              <button
                onClick={() => setActiveTab('diagnostics')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'diagnostics' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Activity className="h-4 w-4" />
                <span>Diagnostics Système</span>
              </button>
            </div>
          </div>

          {/* Content - MASTERPROMPT spacing - Responsive */}
          <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-6 sm:space-y-8">
            {activeTab === 'performance' && (
              <section className="space-y-4">
                <PerformanceDashboard />
              </section>
            )}

            {activeTab === 'execution' && mockTrace && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold text-foreground mb-2">Dernière exécution</h2>
                  <p className="text-sm text-muted-foreground">Trace de l'exécution complète du système</p>
                </div>
                <ExecutionTraceVisualization trace={mockTrace} expanded={false} />
              </section>
            )}

            {activeTab === 'diagnostics' && (
              <section className="space-y-4">
                <SystemDiagnosticsPanel />
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
