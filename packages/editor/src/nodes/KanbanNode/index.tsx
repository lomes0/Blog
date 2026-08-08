import type {
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";

import { DecoratorNode } from "lexical";
import * as React from "react";
import KanbanComponent from "./KanbanComponent";
import { createTask, KanbanPayload, Task } from "./utils";
import { JSX } from "react";

export type SerializedKanbanNode = Spread<
  {
    tasks: Task[];
    style: string;
  },
  SerializedLexicalNode
>;

export class KanbanNode extends DecoratorNode<JSX.Element> {
  __tasks: Task[];
  __style: string;

  static getType(): string {
    return "kanban";
  }

  static clone(node: KanbanNode): KanbanNode {
    return new KanbanNode(
      node.__tasks,
      node.__style,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedKanbanNode): KanbanNode {
    const { tasks, style } = serializedNode;
    return $createKanbanNode({ tasks, style }).updateFromJSON(serializedNode);
  }

  constructor(
    tasks: Task[] = [],
    style: string = "",
    key?: NodeKey,
  ) {
    super(key);
    // Ensure we have properly formatted tasks with the new structure
    this.__tasks = tasks.length > 0 ? tasks : [
      createTask("Task 1", 0),
      createTask("Task 2", 0),
    ];
    this.__style = style;
  }

  exportJSON(): SerializedKanbanNode {
    return {
      ...super.exportJSON(),
      tasks: this.__tasks,
      style: this.__style,
      type: "kanban",
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.style.display = "contents";
    return div;
  }

  updateDOM(): false {
    return false;
  }

  setTasks(tasks: Task[]): void {
    const writable = this.getWritable();
    writable.__tasks = tasks;
  }

  getTasks(): Task[] {
    return this.__tasks;
  }

  setStyle(style: string): void {
    const writable = this.getWritable();
    writable.__style = style;
  }

  getStyle(): string {
    return this.__style;
  }

  decorate(): JSX.Element {
    return (
      <KanbanComponent
        nodeKey={this.getKey()}
        initialTasks={this.__tasks}
      />
    );
  }

  isIsolated(): true {
    return true;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-lexical-kanban", "true");
    element.style.display = "block";
    element.style.width = "100%";

    // Create a simple HTML representation for export
    const kanbanHTML = `
      <div style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
          max-width: 100%;
        ">
          ${
      ["Backlog", "To Do", "Ongoing", "Done"].map((stageName, stageIndex) => {
        const stageTasks = this.__tasks.filter((task) =>
          task.stage === stageIndex
        );
        const stageColors = [
          { bg: "#fef3c7", header: "#f59e0b", text: "#92400e" }, // Backlog - amber
          { bg: "#dbeafe", header: "#3b82f6", text: "#1e40af" }, // To Do - blue
          { bg: "#fed7d7", header: "#f56565", text: "#c53030" }, // Ongoing - red/orange
          { bg: "#d1fae5", header: "#10b981", text: "#065f46" }, // Done - green
        ];
        const colors = stageColors[stageIndex];

        return `
              <div style="
                background: ${colors.bg};
                padding: 18px;
                border-radius: 10px;
                box-shadow: 0 1px 6px rgba(0, 0, 0, 0.05);
                transition: transform 0.2s ease;
              ">
                <h4 style="
                  margin: 0 0 16px 0;
                  font-size: 14px;
                  font-weight: 600;
                  text-align: center;
                  color: ${colors.header};
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                  padding: 8px 12px;
                  background: rgba(255, 255, 255, 0.7);
                  border-radius: 6px;
                ">${stageName}</h4>
                <ul style="list-style: none; padding: 0; margin: 0;">
                  ${
          stageTasks.map((task) =>
            `<li style="
              background: rgba(255, 255, 255, 0.9);
              padding: 12px 14px;
              margin: 0 0 8px 0;
              border-radius: 6px;
              font-size: 14px;
              color: ${colors.text};
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              transition: box-shadow 0.2s ease;
              line-height: 1.4;
            ">${task.name}</li>`
          ).join("")
        }
                </ul>
              </div>
            `;
      }).join("")
    }
        </div>
      </div>
    `;

    element.innerHTML = kanbanHTML;
    return { element };
  }

  static importDOM(): null {
    return null;
  }

  isTopLevel(): true {
    return true;
  }
}

export function $createKanbanNode(payload: KanbanPayload = {}): KanbanNode {
  const { tasks, style } = payload;
  return new KanbanNode(tasks, style);
}

export function $isKanbanNode(
  node: LexicalNode | null | undefined,
): node is KanbanNode {
  return node instanceof KanbanNode;
}

// Re-export types for external use
export type { KanbanPayload, Task } from "./utils";
