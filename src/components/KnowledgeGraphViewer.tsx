/**
 * KnowledgeGraphViewer - Priority 6 Feature
 * Visualizes semantic relationships and evidence connections in the knowledge graph
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Network, Layers, Zap } from 'lucide-react';

interface GraphNode {
  id: string;
  label: string;
  type: 'claim' | 'evidence' | 'source' | 'concept';
  confidence?: number;
  metadata?: Record<string, any>;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  strength: number;
}

interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalConnections: number;
}

interface KnowledgeGraphViewerProps {
  graphData?: KnowledgeGraphData;
}

export const KnowledgeGraphViewer = ({ graphData }: KnowledgeGraphViewerProps) => {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  if (!graphData) {
    return (
      <Card className="my-4 opacity-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Network className="h-5 w-5" />
            Knowledge Graph
          </CardTitle>
          <CardDescription>No graph data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="my-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Knowledge Graph
            </CardTitle>
            <CardDescription>
              {graphData.nodes.length} entities, {graphData.totalConnections} connections
            </CardDescription>
          </div>
          <div className="text-sm">
            <Badge variant="outline">{graphData.edges.length} relationships</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="nodes" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="nodes" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Entities ({graphData.nodes.length})
            </TabsTrigger>
            <TabsTrigger value="relationships" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Relationships ({graphData.edges.length})
            </TabsTrigger>
          </TabsList>

          {/* Nodes/Entities Tab */}
          <TabsContent value="nodes" className="space-y-2 mt-4">
            {graphData.nodes.map(node => (
              <div key={node.id} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedNode(expandedNode === node.id ? null : node.id)}
                  className="w-full justify-start p-0 h-auto font-normal"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Badge variant="secondary" className="flex-shrink-0">
                      {node.type}
                    </Badge>
                    <span className="flex-1 text-left">{node.label}</span>
                    {node.confidence && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {(node.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </Button>

                {expandedNode === node.id && node.metadata && (
                  <div className="mt-2 pl-4 text-xs text-muted-foreground space-y-1 border-l border-border/50">
                    {Object.entries(node.metadata).map(([key, value]) => (
                      <div key={key}>
                        <span className="font-semibold">{key}:</span> {String(value)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          {/* Relationships Tab */}
          <TabsContent value="relationships" className="space-y-2 mt-4">
            {graphData.edges.map((edge, idx) => {
              const sourceNode = graphData.nodes.find(n => n.id === edge.source);
              const targetNode = graphData.nodes.find(n => n.id === edge.target);

              return (
                <div key={idx} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm flex-1 text-left">
                      <span className="font-semibold">{sourceNode?.label}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-semibold">{targetNode?.label}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {edge.relationship}
                    </Badge>
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${edge.strength * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(edge.strength * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
