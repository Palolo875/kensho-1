import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ModelLoadingView } from '../ModelLoadingView';
import { useKenshoStore } from '@/stores/useKenshoStore';

// Mock du store
vi.mock('@/stores/useKenshoStore');

describe('ModelLoadingView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('ne rend rien quand le modèle est prêt', () => {
        vi.mocked(useKenshoStore).mockReturnValue({
            modelProgress: {
                phase: 'ready',
                progress: 1,
                text: 'Modèle prêt'
            },
            setLoadingMinimized: vi.fn(),
            setLoadingPaused: vi.fn(),
        } as any);

        const { container } = render(<ModelLoadingView />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche la phase idle', () => {
        vi.mocked(useKenshoStore).mockReturnValue({
            modelProgress: {
                phase: 'idle',
                progress: 0,
                text: 'Initialisation...'
            },
            setLoadingMinimized: vi.fn(),
            setLoadingPaused: vi.fn(),
            isLoadingMinimized: false,
            isLoadingPaused: false,
        } as any);

        render(<ModelLoadingView />);
        expect(screen.getByText(/Initialisation/i)).toBeInTheDocument();
    });

    it('affiche la phase de téléchargement', () => {
        vi.mocked(useKenshoStore).mockReturnValue({
            modelProgress: {
                phase: 'downloading',
                progress: 0.5,
                text: 'Téléchargement du modèle...',
                downloadedMB: 500,
                totalMB: 1000,
                speedMBps: 10,
                etaSeconds: 50
            },
            setLoadingMinimized: vi.fn(),
            setLoadingPaused: vi.fn(),
            isLoadingMinimized: false,
            isLoadingPaused: false,
        } as any);

        render(<ModelLoadingView />);
        expect(screen.getByText(/Téléchargement/i)).toBeInTheDocument();
        expect(screen.getByText(/500.*MB.*1000.*MB/i)).toBeInTheDocument();
    });

    it('affiche la phase de compilation', () => {
        vi.mocked(useKenshoStore).mockReturnValue({
            modelProgress: {
                phase: 'compiling',
                progress: 0.9,
                text: 'Compilation du modèle...'
            },
            setLoadingMinimized: vi.fn(),
            setLoadingPaused: vi.fn(),
            isLoadingMinimized: false,
            isLoadingPaused: false,
        } as any);

        render(<ModelLoadingView />);
        expect(screen.getByText(/Compilation/i)).toBeInTheDocument();
    });

    it('affiche un message d\'erreur en phase error', () => {
        vi.mocked(useKenshoStore).mockReturnValue({
            modelProgress: {
                phase: 'error',
                progress: 0,
                text: 'Erreur de chargement'
            },
            setLoadingMinimized: vi.fn(),
            setLoadingPaused: vi.fn(),
            isLoadingMinimized: false,
            isLoadingPaused: false,
        } as any);

        render(<ModelLoadingView />);
        expect(screen.getByText(/Erreur/i)).toBeInTheDocument();
    });

    it('peut être minimisé', () => {
        const setLoadingMinimized = vi.fn();

        vi.mocked(useKenshoStore).mockReturnValue({
            modelProgress: {
                phase: 'downloading',
                progress: 0.3,
                text: 'Téléchargement...'
            },
            setLoadingMinimized,
            setLoadingPaused: vi.fn(),
            isLoadingMinimized: false,
            isLoadingPaused: false,
        } as any);

        render(<ModelLoadingView />);

        // Chercher le bouton de minimisation
        const minimizeButton = screen.getByRole('button', { name: /minimize|réduire/i });
        minimizeButton.click();

        expect(setLoadingMinimized).toHaveBeenCalledWith(true);
    });
});
