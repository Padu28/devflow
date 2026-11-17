import type { BoardData, TaskCard } from './types';

/**
 * Pure optimistic board-move computation.
 * Moves `taskId` into `destColumnId` at `destIndex` (computed excluding the moved task),
 * returning a new BoardData object without mutating the input.
 */
export function applyOptimisticBoardMove(
  board: BoardData,
  taskId: string,
  destColumnId: string,
  destIndex: number,
): BoardData {
  let movedTask: TaskCard | null = null;
  const strippedColumns = board.columns.map((col) => {
    const idx = col.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return col;
    movedTask = col.tasks[idx];
    return {
      ...col,
      tasks: [...col.tasks.slice(0, idx), ...col.tasks.slice(idx + 1)],
    };
  });

  if (!movedTask) return board;

  const targetCol = strippedColumns.find((c) => c.id === destColumnId);
  if (!targetCol) return board;

  const updatedTask: TaskCard = {
    ...(movedTask as TaskCard),
    column_id: destColumnId,
    completed_at: targetCol.is_done
      ? (movedTask as TaskCard).completed_at ?? new Date().toISOString()
      : null,
  };

  return {
    ...board,
    columns: strippedColumns.map((col) => {
      if (col.id !== destColumnId) return col;
      const clamped = Math.max(0, Math.min(destIndex, col.tasks.length));
      const nextTasks = [...col.tasks];
      nextTasks.splice(clamped, 0, updatedTask);
      return { ...col, tasks: nextTasks };
    }),
  };
}

