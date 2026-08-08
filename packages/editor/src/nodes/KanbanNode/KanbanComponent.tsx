"use client";

import React, { useCallback, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { createTask, Task } from "./utils";
import "./KanbanComponent.css";

interface KanbanComponentProps {
  nodeKey: string;
  initialTasks?: Task[];
  onTasksChange?: (tasks: Task[]) => void;
}

export default function KanbanComponent({
  nodeKey,
  initialTasks = [
    createTask("Task 1", 0),
    createTask("Task 2", 0),
  ],
  onTasksChange,
}: KanbanComponentProps) {
  const [editor] = useLexicalComposerContext();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [inputValue, setInputValue] = useState("");

  const stagesNames = ["Backlog", "To Do", "Ongoing", "Done"];

  const updateTasks = useCallback((newTasks: Task[]) => {
    setTasks(newTasks);
    onTasksChange?.(newTasks);

    // Update the Lexical node with the new tasks
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node && node.getType() === "kanban") {
        // Cast via unknown to avoid circular import of KanbanNode
        const kanbanNode = node as unknown as {
          getWritable: () => { __tasks: Task[] };
        };
        const writableNode = kanbanNode.getWritable();
        writableNode.__tasks = newTasks;
      }
    });
  }, [editor, nodeKey, onTasksChange]);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  const addTask = useCallback(() => {
    if (inputValue.trim()) {
      const newTask = createTask(inputValue.trim(), 0);
      const newTasks = [...tasks, newTask];
      updateTasks(newTasks);
      setInputValue("");
    }
  }, [inputValue, tasks, updateTasks]);

  const moveTaskBack = useCallback((name: string) => {
    const newTasks = tasks.map((task) => {
      if (task.name === name) {
        return { ...task, stage: task.stage === 0 ? 0 : task.stage - 1 };
      }
      return task;
    });
    updateTasks(newTasks);
  }, [tasks, updateTasks]);

  const moveTaskForward = useCallback((name: string) => {
    const newTasks = tasks.map((task) => {
      if (task.name === name) {
        return { ...task, stage: task.stage === 3 ? 3 : task.stage + 1 };
      }
      return task;
    });
    updateTasks(newTasks);
  }, [tasks, updateTasks]);

  const removeTask = useCallback((name: string) => {
    const newTasks = tasks.filter((task) => task.name !== name);
    updateTasks(newTasks);
  }, [tasks, updateTasks]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        addTask();
      }
    },
    [addTask],
  );

  // Group tasks by stage
  const stagesTasks: Task[][] = [];
  for (let i = 0; i < stagesNames.length; i++) {
    stagesTasks.push([]);
  }
  for (const task of tasks) {
    const stageId = task.stage;
    stagesTasks[stageId].push(task);
  }

  return (
    <div className="kanban-container">
      <section className="kanban-input-section">
        <input
          value={inputValue}
          onChange={onInputChange}
          onKeyPress={handleKeyPress}
          type="text"
          className="kanban-input"
          placeholder="New task name"
          data-testid="create-task-input"
        />
        <button
          onClick={addTask}
          type="button"
          className="kanban-add-button"
          data-testid="create-task-button"
        >
          Create task
        </button>
      </section>

      <div className="kanban-board">
        {stagesTasks.map((stageTasks, stageIndex) => (
          <div className="kanban-column" key={stageIndex}>
            <div className="kanban-column-content">
              <h4 className="kanban-column-title">{stagesNames[stageIndex]}</h4>
              <ul
                className="kanban-task-list"
                data-testid={`stage-${stageIndex}`}
              >
                {stageTasks.map((task, taskIndex) => (
                  <li
                    className="kanban-task-item"
                    key={`${stageIndex}-${taskIndex}`}
                  >
                    <div className="kanban-task-content">
                      <span
                        className="kanban-task-name"
                        data-testid={`${task.name.split(" ").join("-")}-name`}
                      >
                        {task.name}
                      </span>
                      <div className="kanban-task-actions">
                        <button
                          onClick={() => moveTaskBack(task.name)}
                          className="kanban-action-button kanban-back-button"
                          data-testid={`${task.name.split(" ").join("-")}-back`}
                          disabled={task.stage === 0}
                          title="Move back"
                        >
                          ←
                        </button>
                        <button
                          onClick={() =>
                            moveTaskForward(task.name)}
                          className="kanban-action-button kanban-forward-button"
                          data-testid={`${
                            task.name.split(" ").join("-")
                          }-forward`}
                          disabled={task.stage === 3}
                          title="Move forward"
                        >
                          →
                        </button>
                        <button
                          onClick={() =>
                            removeTask(task.name)}
                          className="kanban-action-button kanban-delete-button"
                          data-testid={`${
                            task.name.split(" ").join("-")
                          }-delete`}
                          title="Delete task"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
