/**
 * FactCheckingResults - Priority 6 Feature
 * Displays verified/contradicted claims with evidence and semantic search results
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertCircle, HelpCircle, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VerificationClaim {
  id: string;
  text: string;
  status: 'VERIFIED' | 'CONTRADICTED' | 'AMBIGUOUS' | 'UNKNOWN';
  confidence: number;
  evidence: Evidence[];
  sources: string[];
}

interface Evidence {
  id: string;
  text: string;
  source: string;
  relevance: number;
  embedding?: number[];
}

interface SemanticSearchResult {
  query: string;
  results: Evidence[];
  totalTime: number;
}

interface FactCheckingResultsProps {
  claims: VerificationClaim[];
  semanticSearchResults?: SemanticSearchResult;
  expanded?: boolean;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'VERIFIED':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'CONTRADICTED':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'AMBIGUOUS':
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    case 'UNKNOWN':
      return <HelpCircle className="h-5 w-5 text-gray-500" />;
    default:
      return null;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'VERIFIED':
      return 'bg-green-50 border-green-200';
    case 'CONTRADICTED':
      return 'bg-red-50 border-red-200';
    case 'AMBIGUOUS':
      return 'bg-yellow-50 border-yellow-200';
    case 'UNKNOWN':
      return 'bg-gray-50 border-gray-200';
    default:
      return '';
  }
};

const EvidenceCard = ({ evidence }: { evidence: Evidence }) => (
  <div className="p-3 bg-muted/50 rounded-lg border border-border/50 hover:border-border transition-colors">
    <div className="flex items-start justify-between gap-2 mb-2">
      <p className="text-sm font-medium line-clamp-2">{evidence.text}</p>
      <Badge variant="outline" className="flex-shrink-0">
        {(evidence.relevance * 100).toFixed(0)}%
      </Badge>
    </div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Search className="h-3 w-3" />
      <span>{evidence.source}</span>
    </div>
  </div>
);

export const FactCheckingResults = ({
  claims,
  semanticSearchResults,
  expanded: initialExpanded = false
}: FactCheckingResultsProps) => {
  const [expandedClaims, setExpandedClaims] = useState<string[]>(
    initialExpanded ? claims.map(c => c.id) : []
  );
  const [activeTab, setActiveTab] = useState('claims');

  const toggleClaim = (id: string) => {
    setExpandedClaims(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const verifiedCount = claims.filter(c => c.status === 'VERIFIED').length;
  const contradictedCount = claims.filter(c => c.status === 'CONTRADICTED').length;
  const ambiguousCount = claims.filter(c => c.status === 'AMBIGUOUS').length;

  if (claims.length === 0 && !semanticSearchResults) return null;

  return (
    <Card className="my-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              🔍 Fact-Checking Results
            </CardTitle>
            <CardDescription>
              {claims.length} claims analyzed
            </CardDescription>
          </div>
          <div className="flex gap-4 text-sm">
            {verifiedCount > 0 && (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>{verifiedCount}</span>
              </div>
            )}
            {contradictedCount > 0 && (
              <div className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-red-500" />
                <span>{contradictedCount}</span>
              </div>
            )}
            {ambiguousCount > 0 && (
              <div className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span>{ambiguousCount}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="claims">Claims ({claims.length})</TabsTrigger>
            <TabsTrigger value="semantic">
              Semantic Search
              {semanticSearchResults && semanticSearchResults.results.length > 0 && (
                <Badge className="ml-2" variant="default">
                  {semanticSearchResults.results.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Claims Tab */}
          <TabsContent value="claims" className="space-y-3 mt-4">
            {claims.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No claims to verify</p>
            ) : (
              claims.map(claim => (
                <div
                  key={claim.id}
                  className={cn(
                    'border rounded-lg p-3 transition-all',
                    getStatusColor(claim.status)
                  )}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleClaim(claim.id)}
                    className="w-full justify-start p-0 h-auto font-normal hover:bg-transparent"
                  >
                    <div className="flex items-start gap-3 w-full">
                      <div className="flex-shrink-0 pt-1">
                        {getStatusIcon(claim.status)}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium line-clamp-2">{claim.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {claim.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {(claim.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                      </div>
                      {expandedClaims.includes(claim.id) ? (
                        <ChevronUp className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      )}
                    </div>
                  </Button>

                  {/* Expanded Evidence */}
                  {expandedClaims.includes(claim.id) && (
                    <div className="mt-3 pl-8 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Evidence ({claim.evidence.length})
                      </p>
                      {claim.evidence.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No evidence found</p>
                      ) : (
                        claim.evidence.map(ev => (
                          <EvidenceCard key={ev.id} evidence={ev} />
                        ))
                      )}
                      {claim.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Sources
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {claim.sources.map((source, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {source}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          {/* Semantic Search Tab */}
          <TabsContent value="semantic" className="space-y-3 mt-4">
            {semanticSearchResults ? (
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                  <p className="text-sm text-muted-foreground mb-2">
                    <span className="font-semibold">Query:</span> {semanticSearchResults.query}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ⚡ Search completed in {semanticSearchResults.totalTime}ms
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Top Results ({semanticSearchResults.results.length})</p>
                  {semanticSearchResults.results.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No semantic search results</p>
                  ) : (
                    semanticSearchResults.results.map(result => (
                      <EvidenceCard key={result.id} evidence={result} />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No semantic search data available</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
