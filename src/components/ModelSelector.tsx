import { useState, useEffect } from 'react';
import { Download, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { modelManager, type ModelType } from '@/core/kernel/ModelManager';

interface ModelSelectorProps {
  onModelSelected?: (model: ModelType) => void;
  isOpen?: boolean;
}

export function ModelSelector({ onModelSelected, isOpen = true }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState<ModelType>('mock');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [showModal, setShowModal] = useState(isOpen);
  const [models, setModels] = useState(modelManager.getAvailableModels());

  useEffect(() => {
    setModels(modelManager.getAvailableModels());
  }, []);

  const handleSelectModel = async (modelId: ModelType) => {
    if (modelId === 'mock') {
      setSelectedModel('mock');
      await modelManager.initMockMode();
      setShowModal(false);
      onModelSelected?.('mock');
      localStorage.setItem('kensho_selected_model', 'mock');
      return;
    }

    if (modelId === 'qwen3-0.6b') {
      if (modelManager.isModelDownloaded('qwen3-0.6b')) {
        // Déjà téléchargé
        setSelectedModel('qwen3-0.6b');
        await modelManager.switchToModel('qwen3-0.6b');
        setShowModal(false);
        onModelSelected?.('qwen3-0.6b');
        localStorage.setItem('kensho_selected_model', 'qwen3-0.6b');
        return;
      }

      // Demander confirmation avant téléchargement
      if (!confirm('Télécharger Qwen3 0.6B (~400MB)? Cela peut prendre quelques minutes.')) {
        return;
      }

      // Commencer le téléchargement
      setIsDownloading(true);
      setProgress('Initialisation du téléchargement...');
      setSelectedModel('qwen3-0.6b');

      try {
        // Écouter la progression via SSE
        const eventSource = new EventSource('/api/model-progress');
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            setProgress(data.message);
          } else if (data.type === 'complete') {
            setProgress('✅ Téléchargement terminé!');
            eventSource.close();
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          setIsDownloading(false);
        };

        // Lancer le téléchargement
        await modelManager.downloadAndInitQwen3();

        setShowModal(false);
        onModelSelected?.('qwen3-0.6b');
        localStorage.setItem('kensho_selected_model', 'qwen3-0.6b');

        // Mettre à jour la liste
        setModels(modelManager.getAvailableModels());
      } catch (error) {
        setProgress(`❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        setIsDownloading(false);
        setSelectedModel('mock');
      }
    }
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-2 text-foreground">Sélectionnez un Modèle</h2>
        <p className="text-muted-foreground mb-6">Choisissez comment Kensho fonctionnera:</p>

        <div className="space-y-3">
          {models.map((model) => (
            <div
              key={model.id}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedModel === model.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => !isDownloading && handleSelectModel(model.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    {model.name}
                    {model.isDownloaded && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Téléchargé</span>}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">Taille: {model.size}</p>
                </div>
                {model.id === 'qwen3-0.6b' && !model.isDownloaded && (
                  <Download className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
                )}
              </div>

              {/* Progress bar */}
              {isDownloading && selectedModel === model.id && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground mb-2">{progress}</div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary animate-pulse"></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          {!isDownloading && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  handleSelectModel('mock');
                }}
                disabled={isDownloading}
              >
                Mode Simulation
              </Button>
              <Button
                onClick={() => {
                  handleSelectModel('qwen3-0.6b');
                }}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Téléchargement...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Télécharger Qwen3
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
