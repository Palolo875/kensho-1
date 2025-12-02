import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDownloadsStore } from '../useDownloadsStore';

describe('useDownloadsStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useDownloadsStore.setState({
      downloads: {},
      downloadProgress: {},
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useDownloadsStore());
    
    expect(result.current.downloads).toEqual({});
    expect(result.current.downloadProgress).toEqual({});
  });

  it('should add downloads', () => {
    const { result } = renderHook(() => useDownloadsStore());
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

  it('should update download progress', () => {
    const { result } = renderHook(() => useDownloadsStore());
    const downloadId = 'download1';
    const progress = 50;
    
    act(() => {
      result.current.updateDownloadProgress(downloadId, progress);
    });
    
    expect(result.current.downloadProgress[downloadId]).toBe(progress);
  });

  it('should set download status', () => {
    const { result } = renderHook(() => useDownloadsStore());
    const downloadId = 'download1';
    
    act(() => {
      result.current.setDownloadStatus(downloadId, 'downloading');
    });
    
    expect(result.current.downloads[downloadId]?.status).toBe('downloading');
    
    act(() => {
      result.current.setDownloadStatus(downloadId, 'completed');
    });
    
    expect(result.current.downloads[downloadId]?.status).toBe('completed');
  });

  it('should remove downloads', () => {
    const { result } = renderHook(() => useDownloadsStore());
    const download = {
      id: 'download1',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      status: 'pending' as const,
    };
    
    act(() => {
      result.current.addDownload(download);
    });
    
    expect(result.current.downloads[download.id]).toBeDefined();
    
    act(() => {
      result.current.removeDownload(download.id);
    });
    
    expect(result.current.downloads[download.id]).toBeUndefined();
  });

  it('should get download by id', () => {
    const { result } = renderHook(() => useDownloadsStore());
    const download = {
      id: 'download1',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      status: 'pending' as const,
    };
    
    act(() => {
      result.current.addDownload(download);
    });
    
    const retrievedDownload = result.current.getDownload(download.id);
    expect(retrievedDownload).toEqual(download);
  });

  it('should return undefined for non-existent downloads', () => {
    const { result } = renderHook(() => useDownloadsStore());
    const download = result.current.getDownload('nonexistent');
    expect(download).toBeUndefined();
  });
});