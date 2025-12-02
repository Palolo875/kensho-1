import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFileStore } from '../useFileStore';

describe('useFileStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useFileStore.setState({
      files: {},
      fileContents: {},
      fileMetadata: {},
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useFileStore());
    
    expect(result.current.files).toEqual({});
    expect(result.current.fileContents).toEqual({});
    expect(result.current.fileMetadata).toEqual({});
  });

  it('should add files', () => {
    const { result } = renderHook(() => useFileStore());
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

  it('should set file content', () => {
    const { result } = renderHook(() => useFileStore());
    const fileId = 'file1';
    const content = 'Hello, world!';
    
    act(() => {
      result.current.setFileContent(fileId, content);
    });
    
    expect(result.current.fileContents[fileId]).toBe(content);
  });

  it('should set file metadata', () => {
    const { result } = renderHook(() => useFileStore());
    const fileId = 'file1';
    const metadata = {
      encoding: 'utf-8',
      language: 'en',
      tags: ['document', 'text'],
    };
    
    act(() => {
      result.current.setFileMetadata(fileId, metadata);
    });
    
    expect(result.current.fileMetadata[fileId]).toEqual(metadata);
  });

  it('should get file by id', () => {
    const { result } = renderHook(() => useFileStore());
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
    
    const retrievedFile = result.current.getFile(file.id);
    expect(retrievedFile).toEqual(file);
  });

  it('should get file content by id', () => {
    const { result } = renderHook(() => useFileStore());
    const fileId = 'file1';
    const content = 'Hello, world!';
    
    act(() => {
      result.current.setFileContent(fileId, content);
    });
    
    const retrievedContent = result.current.getFileContent(fileId);
    expect(retrievedContent).toBe(content);
  });

  it('should get file metadata by id', () => {
    const { result } = renderHook(() => useFileStore());
    const fileId = 'file1';
    const metadata = {
      encoding: 'utf-8',
      language: 'en',
      tags: ['document', 'text'],
    };
    
    act(() => {
      result.current.setFileMetadata(fileId, metadata);
    });
    
    const retrievedMetadata = result.current.getFileMetadata(fileId);
    expect(retrievedMetadata).toEqual(metadata);
  });

  it('should remove files', () => {
    const { result } = renderHook(() => useFileStore());
    const file = {
      id: 'file1',
      name: 'document.txt',
      type: 'text/plain',
      size: 1024,
      lastModified: Date.now(),
    };
    
    act(() => {
      result.current.addFile(file);
      result.current.setFileContent(file.id, 'content');
      result.current.setFileMetadata(file.id, { encoding: 'utf-8' });
    });
    
    expect(result.current.files[file.id]).toBeDefined();
    expect(result.current.fileContents[file.id]).toBeDefined();
    expect(result.current.fileMetadata[file.id]).toBeDefined();
    
    act(() => {
      result.current.removeFile(file.id);
    });
    
    expect(result.current.files[file.id]).toBeUndefined();
    expect(result.current.fileContents[file.id]).toBeUndefined();
    expect(result.current.fileMetadata[file.id]).toBeUndefined();
  });

  it('should return undefined for non-existent files', () => {
    const { result } = renderHook(() => useFileStore());
    
    expect(result.current.getFile('nonexistent')).toBeUndefined();
    expect(result.current.getFileContent('nonexistent')).toBeUndefined();
    expect(result.current.getFileMetadata('nonexistent')).toBeUndefined();
  });
});