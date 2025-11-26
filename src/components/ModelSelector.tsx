import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModelDownloadPanel } from './ModelDownloadPanel';
import { modelManager, type ModelType } from '@/core/kernel/ModelManager';

interface ModelSelectorProps {
  onModelSelected?: (model: ModelType) => void;
  isOpen?: boolean;
}

export function ModelSelector({ onModelSelected, isOpen = true }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState<ModelType>('mock');
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
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

    if (modelId === 'gpt2') {
      if (modelManager.isModelDownloaded('gpt2')) {
        // Déjà téléchargé
        setSelectedModel('gpt2');
        await modelManager.switchToModel('gpt2');
        setShowModal(false);
        onModelSelected?.('gpt2');
        localStorage.setItem('kensho_selected_model', 'gpt2');
        return;
      }

      // Demander confirmation avant téléchargement
      if (!confirm('Télécharger Llama-2-7b (~3.8GB)? Cela peut prendre 5-10 minutes selon votre connexion.\n\nVous pouvez arrêter à tout moment.')) {
        return;
      }

      setSelectedModel('gpt2');
      setShowDownloadPanel(true);
    }
  };

  const handleDownloadComplete = async () => {
    setShowDownloadPanel(false);
    setShowModal(false);
    onModelSelected?.('gpt2');
    localStorage.setItem('kensho_selected_model', 'gpt2');
    setModels(modelManager.getAvailableModels());
    
    await modelManager.switchToModel('gpt2');
  };

  const handleDownloadCancel = () => {
    setShowDownloadPanel(false);
    setSelectedModel('mock');
  };

  if (showDownloadPanel) {
    return (
      <div className="fixed inset-0 z-50">
        <ModelDownloadPanel onComplete={handleDownloadComplete} onCancel={handleDownloadCancel} />
      </div>
    );
  }

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
              onClick={() => handleSelectModel(model.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    {model.name}
                    {model.isDownloaded && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">✓ Téléchargé</span>}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">Taille: {model.size}</p>
                </div>
                {model.id === 'gpt2' && !model.isDownloaded && (
                  <Download className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              handleSelectModel('mock');
            }}
          >
            Mode Simulation
          </Button>
          <Button
            onClick={() => {
              handleSelectModel('gpt2');
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Télécharger GPT-2
          </Button>
        </div>
      </div>
    </div>
  );
}
