export interface Task {
  id: string;
  name: string;
  description?: string;
  stage: number;
  priority: "low" | "medium" | "high";
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanPayload {
  tasks?: Task[];
  style?: string;
}

export function createTask(name: string, stage: number = 0): Task {
  const now = new Date().toISOString();
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    description: "",
    stage,
    priority: "medium",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTask(task: Task, updates: Partial<Task>): Task {
  return {
    ...task,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}
