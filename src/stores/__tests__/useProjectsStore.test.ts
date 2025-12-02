import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProjectsStore } from '../useProjectsStore';

describe('useProjectsStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useProjectsStore.setState({
      projects: {},
      activeProjectId: null,
      projectTasks: {},
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useProjectsStore());
    
    expect(result.current.projects).toEqual({});
    expect(result.current.activeProjectId).toBeNull();
    expect(result.current.projectTasks).toEqual({});
  });

  it('should create projects', () => {
    const { result } = renderHook(() => useProjectsStore());
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
    expect(result.current.projects[projectId!]).toEqual({
      id: projectId,
      ...projectData,
      updatedAt: expect.any(Number),
    });
  });

  it('should set active project', () => {
    const { result } = renderHook(() => useProjectsStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
      result.current.setActiveProject(projectId!);
    });
    
    expect(result.current.activeProjectId).toBe(projectId);
  });

  it('should update projects', () => {
    const { result } = renderHook(() => useProjectsStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
    });
    
    const updates = {
      name: 'Updated Project Name',
      description: 'An updated description',
    };
    
    act(() => {
      result.current.updateProject(projectId!, updates);
    });
    
    expect(result.current.projects[projectId!].name).toBe(updates.name);
    expect(result.current.projects[projectId!].description).toBe(updates.description);
    expect(result.current.projects[projectId!].updatedAt).toBeGreaterThan(projectData.createdAt);
  });

  it('should delete projects', () => {
    const { result } = renderHook(() => useProjectsStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
    });
    
    expect(result.current.projects[projectId!]).toBeDefined();
    
    act(() => {
      result.current.deleteProject(projectId!);
    });
    
    expect(result.current.projects[projectId!]).toBeUndefined();
  });

  it('should get project by id', () => {
    const { result } = renderHook(() => useProjectsStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
    });
    
    const retrievedProject = result.current.getProject(projectId!);
    expect(retrievedProject).toEqual({
      id: projectId,
      ...projectData,
      updatedAt: expect.any(Number),
    });
  });

  it('should return undefined for non-existent projects', () => {
    const { result } = renderHook(() => useProjectsStore());
    const project = result.current.getProject('nonexistent');
    expect(project).toBeUndefined();
  });

  it('should add tasks to projects', () => {
    const { result } = renderHook(() => useProjectsStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
    });
    
    const taskText = 'Complete the project';
    
    act(() => {
      result.current.addTaskToProject(projectId!, taskText);
    });
    
    const tasks = result.current.projectTasks[projectId!];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({
      id: expect.any(String),
      text: taskText,
      completed: false,
      createdAt: expect.any(Number),
    });
  });

  it('should toggle task completion', () => {
    const { result } = renderHook(() => useProjectsStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
      result.current.addTaskToProject(projectId!, 'Complete the project');
    });
    
    const tasks = result.current.projectTasks[projectId!];
    const taskId = tasks[0].id;
    
    expect(tasks[0].completed).toBe(false);
    
    act(() => {
      result.current.toggleTask(projectId!, taskId);
    });
    
    const updatedTasks = result.current.projectTasks[projectId!];
    expect(updatedTasks[0].completed).toBe(true);
  });

  it('should remove tasks from projects', () => {
    const { result } = renderHook(() => useProjectsStore());
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
    };
    
    let projectId: string | null = null;
    
    act(() => {
      projectId = result.current.createProject(projectData);
      result.current.addTaskToProject(projectId!, 'Complete the project');
    });
    
    const tasks = result.current.projectTasks[projectId!];
    const taskId = tasks[0].id;
    
    expect(tasks).toHaveLength(1);
    
    act(() => {
      result.current.removeTaskFromProject(projectId!, taskId);
    });
    
    const updatedTasks = result.current.projectTasks[projectId!];
    expect(updatedTasks).toHaveLength(0);
  });
});