import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKenshoStore } from '../useKenshoStore';

describe('useKenshoStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useKenshoStore.setState({
      workers: {},
      workersReady: {},
      workerStatus: {},
      messages: [],
      isKenshoWriting: false,
      statusMessage: '',
      currentThoughtProcess: null,
      availableModels: [],
      loadedModels: {},
      activeModel: null,
      modelLoading: false,
      modelError: null,
      downloads: {},
      downloadProgress: {},
      files: {},
      fileContents: {},
      fileMetadata: {},
      projects: {},
      activeProjectId: null,
      projectTasks: {},
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useKenshoStore());
    
    // Worker related
    expect(result.current.workers).toEqual({});
    expect(result.current.workersReady).toEqual({});
    expect(result.current.workerStatus).toEqual({});
    
    // Message related
    expect(result.current.messages).toEqual([]);
    expect(result.current.isKenshoWriting).toBe(false);
    expect(result.current.statusMessage).toBe('');
    expect(result.current.currentThoughtProcess).toBeNull();
    
    // Model related
    expect(result.current.availableModels).toEqual([]);
    expect(result.current.loadedModels).toEqual({});
    expect(result.current.activeModel).toBeNull();
    expect(result.current.modelLoading).toBe(false);
    expect(result.current.modelError).toBeNull();
    
    // Download related
    expect(result.current.downloads).toEqual({});
    expect(result.current.downloadProgress).toEqual({});
    
    // File related
    expect(result.current.files).toEqual({});
    expect(result.current.fileContents).toEqual({});
    expect(result.current.fileMetadata).toEqual({});
    
    // Project related
    expect(result.current.projects).toEqual({});
    expect(result.current.activeProjectId).toBeNull();
    expect(result.current.projectTasks).toEqual({});
  });

  it('should register workers', () => {
    const { result } = renderHook(() => useKenshoStore());
    const mockWorker = { postMessage: () => {} } as any;
    const workerType = 'llm';
    
    act(() => {
      result.current.registerWorker(workerType, mockWorker);
    });
    
    expect(result.current.workers[workerType]).toBe(mockWorker);
  });

  it('should set worker ready status', () => {
    const { result } = renderHook(() => useKenshoStore());
    const workerType = 'llm';
    
    act(() => {
      result.current.setWorkerReady(workerType, true);
    });
    
    expect(result.current.workersReady[workerType]).toBe(true);
  });

  it('should add messages', () => {
    const { result } = renderHook(() => useKenshoStore());
    
    act(() => {
      result.current.addMessage({
        id: '1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      });
    });
    
    expect(result.current.messages).toHaveLength(1);
  });

  it('should set active model', () => {
    const { result } = renderHook(() => useKenshoStore());
    const modelId = 'model1';
    
    act(() => {
      result.current.setActiveModel(modelId);
    });
    
    expect(result.current.activeModel).toBe(modelId);
  });

  it('should add downloads', () => {
    const { result } = renderHook(() => useKenshoStore());
    const download = {
      id: 'download1',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      status: 'pending' as const,
    };
    
    act(() => {
      result.current.addDownload(download);
    });
    
    expect(result.current.downloads[download.id]).toEqual(download);
  });

  it('should add files', () => {
    const { result } = renderHook(() => useKenshoStore());
    const file = {
      id: 'file1',
      name: 'document.txt',
      type: 'text/plain',
      size: 1024,
      lastModified: Date.now(),
    };
    
    act(() => {
      result.current.addFile(file);
    });
    
    expect(result.current.files[file.id]).toEqual(file);
  });

  it('should create projects', () => {
    const { result } = renderHook(() => useKenshoStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
    });
    
    expect(projectId).toBeTruthy();
    expect(result.current.projects[projectId!]).toBeDefined();
  });

  it('should set system info', () => {
    const { result } = renderHook(() => useKenshoStore());
    const systemInfo = {
      userAgent: 'test-agent',
      platform: 'test-platform',
      language: 'en',
    };
    
    act(() => {
      result.current.setSystemInfo(systemInfo);
    });
    
    expect(result.current.systemInfo).toEqual(systemInfo);
  });

  it('should set user preferences', () => {
    const { result } = renderHook(() => useKenshoStore());
    const preferences = {
      theme: 'dark',
      language: 'en',
      notifications: true,
    };
    
    act(() => {
      result.current.setUserPreferences(preferences);
    });
    
    expect(result.current.userPreferences).toEqual(preferences);
  });

  it('should update settings', () => {
    const { result } = renderHook(() => useKenshoStore());
    const settings = {
      maxTokens: 1024,
      temperature: 0.7,
    };
    
    act(() => {
      result.current.updateSettings(settings);
    });
    
    expect(result.current.settings).toEqual({
      maxTokens: 1024,
      temperature: 0.7,
    });
  });
});