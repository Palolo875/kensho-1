import { ReactNode, ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Mock du store Zustand
 * Utilisez vi.mock() dans vos tests pour personnaliser le comportement
 */
export const createMockStore = (overrides = {}) => ({
    messages: [],
    modelProgress: { phase: 'idle', progress: 0, text: 'Initialisation...' },
    isKenshoWriting: false,
    mainBus: null,
    isInitialized: false,
    isLoadingMinimized: false,
    isLoadingPaused: false,
    workerErrors: [],
    workersReady: { llm: false, oie: false, telemetry: false },
    init: vi.fn(),
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
    setLoadingMinimized: vi.fn(),
    setLoadingPaused: vi.fn(),
    loadMessagesFromStorage: vi.fn(),
    clearWorkerErrors: vi.fn(),
    ...overrides,
});

/**
 * Wrapper personnalisé pour render avec providers si nécessaire
 */
export const customRender = (
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) => {
    return render(ui, { ...options });
};

export * from '@testing-library/react';
export { customRender as render };
