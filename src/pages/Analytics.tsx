/**
 * Analytics Page - Priority 5
 * Dedicated dashboard for performance metrics and execution traces
 */

import Sidebar from '@/components/Sidebar';
import { PerformanceDashboard } from '@/components/PerformanceDashboard';
import { ExecutionTraceVisualization } from '@/components/ExecutionTraceVisualization';
import { useObservatory } from '@/contexts/ObservatoryContext';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

const Analytics = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { journal } = useObservatory();

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
        onOpenSettings={() => {}}
        onOpenSearch={() => {}}
        onOpenObservatory={() => {}}
        onNewConversation={() => {}}
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

          {/* Page Title */}
          <div className="p-6 border-b border-border">
            <h1 className="text-4xl font-bold">Analytics & Metrics</h1>
            <p className="text-muted-foreground mt-2">Monitor multi-agent system performance and execution traces</p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-8">
            {/* Performance Dashboard */}
            <section>
              <PerformanceDashboard />
            </section>

            {/* Execution Trace (if available) */}
            {mockTrace && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Last Execution Trace</h2>
                <ExecutionTraceVisualization trace={mockTrace} expanded={false} />
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
