/**
 * FactCheckingDemo - Priority 6
 * Interactive demo showcasing fact-checking with knowledge graph visualization
 */

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { FactCheckingResults } from '@/components/FactCheckingResults';
import { KnowledgeGraphViewer } from '@/components/KnowledgeGraphViewer';
import { useFactCheckingStore } from '@/stores/useFactCheckingStore';
import { FactCheckingService } from '@/services/FactCheckingService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const FactCheckingDemo = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [claimInput, setClaimInput] = useState('');
  const [claims, setClaims] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('demo');

  const { claims: verifiedClaims, semanticSearchResults, isVerifying } = useFactCheckingStore();

  // Demo claims
  const demoExamples = [
    'Paris is the capital of France',
    'The Earth is flat',
    'Water boils at 100 degrees Celsius',
    'Gravity pulls objects towards the ground'
  ];

  const handleAddClaim = (claim: string) => {
    if (claim.trim() && !claims.includes(claim)) {
      setClaims([...claims, claim]);
    }
  };

  const handleRemoveClaim = (idx: number) => {
    setClaims(claims.filter((_, i) => i !== idx));
  };

  const handleVerify = async () => {
    if (claims.length === 0) return;
    await FactCheckingService.verifyClaims({ claims });
  };

  const handleClear = () => {
    setClaims([]);
    FactCheckingService.clearResults();
  };

  const mockGraphData = {
    nodes: [
      { id: '1', label: 'Climate Change', type: 'concept' as const, confidence: 0.95 },
      { id: '2', label: 'Global Warming', type: 'concept' as const, confidence: 0.92 },
      { id: '3', label: 'CO2 Emissions', type: 'evidence' as const, confidence: 0.88 },
      { id: '4', label: 'NASA Study', type: 'source' as const },
      { id: '5', label: 'Temperature Rise', type: 'claim' as const, confidence: 0.85 }
    ],
    edges: [
      { source: '1', target: '2', relationship: 'related_to', strength: 0.95 },
      { source: '2', target: '3', relationship: 'caused_by', strength: 0.88 },
      { source: '3', target: '4', relationship: 'documented_in', strength: 0.92 },
      { source: '2', target: '5', relationship: 'causes', strength: 0.85 }
    ],
    totalConnections: 4
  };

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
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          {/* Header */}
          <div className="mb-6 space-y-2">
            <h1 className="text-4xl font-bold flex items-center gap-2">
              🔍 Fact-Checking Demo
            </h1>
            <p className="text-muted-foreground">
              Interactive demonstration of Knowledge Graph & Evidence System (Priority 6)
            </p>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="demo" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Verification
              </TabsTrigger>
              <TabsTrigger value="graph" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Knowledge Graph
              </TabsTrigger>
              <TabsTrigger value="about" className="flex items-center gap-2">
                ℹ️
                About
              </TabsTrigger>
            </TabsList>

            {/* Verification Tab */}
            <TabsContent value="demo" className="space-y-4">
              {/* Input Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Add Claims to Verify</CardTitle>
                  <CardDescription>Enter claims and we'll verify them using semantic search</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter a claim to verify..."
                      value={claimInput}
                      onChange={(e) => setClaimInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddClaim(claimInput)}
                    />
                    <Button onClick={() => handleAddClaim(claimInput)}>Add</Button>
                  </div>

                  {/* Quick Examples */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">Quick Examples:</p>
                    <div className="flex flex-wrap gap-2">
                      {demoExamples.map((example, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleAddClaim(example);
                            setClaimInput('');
                          }}
                          className="text-xs"
                        >
                          {example}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Claims List */}
              {claims.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Claims to Verify ({claims.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {claims.map((claim, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <span className="text-sm">{claim}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveClaim(idx)}
                          className="h-7 px-2"
                        >
                          ✕
                        </Button>
                      </div>
                    ))}

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleVerify}
                        disabled={isVerifying || claims.length === 0}
                        className="flex-1"
                      >
                        {isVerifying ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          '✓ Verify Claims'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={isVerifying}
                      >
                        Clear
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Results */}
              {verifiedClaims.length > 0 && (
                <FactCheckingResults
                  claims={verifiedClaims}
                  semanticSearchResults={semanticSearchResults || undefined}
                  expanded={true}
                />
              )}
            </TabsContent>

            {/* Knowledge Graph Tab */}
            <TabsContent value="graph" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Knowledge Graph Overview</CardTitle>
                  <CardDescription>
                    Semantic relationships and evidence connections
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    The Knowledge Graph shows how concepts, claims, evidence, and sources are semantically connected
                    through embeddings and relationships. This enables intelligent evidence retrieval and fact verification.
                  </p>
                </CardContent>
              </Card>

              <KnowledgeGraphViewer graphData={mockGraphData} />
            </TabsContent>

            {/* About Tab */}
            <TabsContent value="about" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Priority 6: Knowledge Graph & Evidence System</CardTitle>
                  <CardDescription>Advanced fact-checking with semantic search</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-semibold mb-2">🎯 Features</h3>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Semantic evidence retrieval via GraphWorker</li>
                      <li>HNSW embeddings for efficient vector search</li>
                      <li>Multi-status verification (VERIFIED, CONTRADICTED, AMBIGUOUS, UNKNOWN)</li>
                      <li>Confidence scoring with evidence ranking</li>
                      <li>Knowledge graph visualization</li>
                      <li>Source tracking and transparency</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">🔧 Components</h3>
                    <div className="space-y-2">
                      <div className="p-2 bg-muted/50 rounded">
                        <Badge>FactCheckingResults.tsx</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Displays verified claims with evidence and semantic search results
                        </p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded">
                        <Badge>KnowledgeGraphViewer.tsx</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Visualizes semantic relationships and graph connections
                        </p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded">
                        <Badge>FactCheckingService.ts</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Orchestrates fact-checking with GraphWorker integration
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">🔗 Integration Points</h3>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
                      <li>GraphWorker: Evidence retrieval from knowledge graph</li>
                      <li>EmbeddingAgent: Semantic similarity via HNSW</li>
                      <li>FactCheckerAgent: Claim verification logic</li>
                      <li>Router/TaskExecutor: Multi-agent orchestration</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default FactCheckingDemo;
