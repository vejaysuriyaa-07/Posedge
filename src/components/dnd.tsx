import {
  closestCenter,
  closestCorners,
  getFirstCollision,
  KeyboardCode,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DroppableContainer,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type Containers = Record<string, string[]>;

interface DragState {
  activeId: string;
  from: string;
  items: Containers;
}

function findContainer(id: UniqueIdentifier, map: Containers): string | undefined {
  const key = String(id);
  if (key in map) return key;
  return Object.keys(map).find((k) => map[k]!.includes(key));
}

const ARROWS: string[] = [
  KeyboardCode.Down,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Left,
];

/**
 * Keyboard movement across several lists (adapted from dnd-kit's multiple-containers example):
 * arrows target the nearest item, or empty list, in that direction, so Left/Right jump between days.
 */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect, over } },
) => {
  if (!ARROWS.includes(event.code)) return undefined;
  event.preventDefault();
  if (!active || !collisionRect) return undefined;
  const candidates: DroppableContainer[] = [];
  for (const entry of droppableContainers.getEnabled()) {
    if (!entry || entry.disabled || entry.id === active.id) continue;
    const rect = droppableRects.get(entry.id);
    if (!rect) continue;
    const data = entry.data.current as { type?: string; children?: string[] } | undefined;
    // Lists that have items are reached through their items; empty lists are targets themselves.
    if (data?.type === 'container' && (data.children?.length ?? 0) > 0) continue;
    const ok =
      (event.code === KeyboardCode.Down && collisionRect.top < rect.top) ||
      (event.code === KeyboardCode.Up && collisionRect.top > rect.top) ||
      (event.code === KeyboardCode.Left && collisionRect.left >= rect.left + rect.width) ||
      (event.code === KeyboardCode.Right && collisionRect.left + collisionRect.width <= rect.left);
    if (ok) candidates.push(entry);
  }
  const collisions = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null,
  });
  let closestId = getFirstCollision(collisions, 'id');
  if (closestId === over?.id && collisions.length > 1) closestId = collisions[1]!.id;
  if (closestId == null) return undefined;
  const target = droppableContainers.get(closestId);
  const rect = target?.rect.current;
  if (!target || !rect) return undefined;
  const data = target.data.current as { type?: string } | undefined;
  return data?.type === 'container'
    ? { x: rect.left + 16, y: rect.top + 16 }
    : { x: rect.left, y: rect.top };
};

export interface BoardDndOptions {
  containers: Containers;
  /** Called on drop with the item's new container and that container's full order. */
  onCommit: (id: string, to: string, orderedIds: string[], from: string) => void | Promise<void>;
  itemLabel: (id: string) => string;
  containerLabel: (containerId: string) => string;
  instructions?: string;
}

/**
 * Multi-container sortable state for dnd-kit (pointer, touch and keyboard sensors) with
 * screen-reader announcements. Keeps the dropped order visible until the live query catches up.
 */
export function useBoardDnd({
  containers,
  onCommit,
  itemLabel,
  containerLabel,
  instructions,
}: BoardDndOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<{ base: Containers; items: Containers } | null>(null);
  const items =
    drag?.items ?? (pending && pending.base === containers ? pending.items : containers);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );

  // Pointer-first collisions; a hit on a non-empty list resolves to its closest item.
  const lastOver = useRef<UniqueIdentifier | null>(null);
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointer = pointerWithin(args);
      const hits = pointer.length ? pointer : rectIntersection(args);
      let overId = getFirstCollision(hits, 'id');
      if (overId != null) {
        const key = String(overId);
        const children = key in items ? items[key]! : null;
        if (children?.length) {
          const closest = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (c) => c.id !== overId && children.includes(String(c.id)),
            ),
          });
          if (closest[0]) overId = closest[0].id;
        }
        lastOver.current = overId;
        return [{ id: overId }];
      }
      return lastOver.current != null ? [{ id: lastOver.current }] : [];
    },
    [items],
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    const from = findContainer(active.id, items);
    if (from) setDrag({ activeId: String(active.id), from, items });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!drag || !over) return;
    const fromC = findContainer(active.id, drag.items);
    const toC = findContainer(over.id, drag.items);
    if (!fromC || !toC || fromC === toC) return;
    const fromList = drag.items[fromC]!.filter((x) => x !== String(active.id));
    const toList = [...drag.items[toC]!];
    const overIndex = toList.indexOf(String(over.id));
    toList.splice(overIndex >= 0 ? overIndex : toList.length, 0, String(active.id));
    setDrag({ ...drag, items: { ...drag.items, [fromC]: fromList, [toC]: toList } });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!drag) return;
    let next = drag.items;
    const fromC = findContainer(active.id, next);
    const toC = over ? findContainer(over.id, next) : undefined;
    if (fromC && toC && fromC === toC && over) {
      const list = next[fromC]!;
      const oldIndex = list.indexOf(String(active.id));
      const newIndex = String(over.id) in next ? list.length - 1 : list.indexOf(String(over.id));
      if (oldIndex !== newIndex && newIndex >= 0)
        next = { ...next, [fromC]: arrayMove(list, oldIndex, newIndex) };
    }
    const from = drag.from;
    setPending({ base: containers, items: next });
    setDrag(null);
    if (fromC && over) void onCommit(String(active.id), fromC, next[fromC]!, from);
  };

  const onDragCancel = () => setDrag(null);

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${itemLabel(String(active.id))}.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `${itemLabel(String(active.id))} is not over a list.`;
      const c = findContainer(over.id, items);
      return c ? `${itemLabel(String(active.id))} is over ${containerLabel(c)}.` : undefined;
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return `${itemLabel(String(active.id))} was dropped back where it started.`;
      const c = findContainer(over.id, items);
      return `${itemLabel(String(active.id))} moved to ${c ? containerLabel(c) : 'its list'}.`;
    },
    onDragCancel: ({ active }) =>
      `Move cancelled. ${itemLabel(String(active.id))} is back where it was.`,
  };

  return {
    items,
    activeId: drag?.activeId ?? null,
    contextProps: {
      sensors,
      collisionDetection,
      onDragStart,
      onDragOver,
      onDragEnd,
      onDragCancel,
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable:
            instructions ??
            'To pick up a task, focus its handle and press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, and Escape to cancel.',
        },
      },
    },
  };
}

export function DroppableList({
  id,
  items,
  children,
  className = '',
  overClassName = 'ring-2 ring-brand/40',
  label,
}: {
  id: string;
  items: string[];
  children: ReactNode;
  className?: string;
  overClassName?: string;
  label?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'container', children: items } });
  return (
    <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        aria-label={label}
        className={`grid-cols-1 ${className} ${isOver ? overClassName : ''}`}
      >
        {children}
      </div>
    </SortableContext>
  );
}

export interface SortableRenderArgs {
  /** Drag handle element (keyboard + pointer). */
  handle: ReactNode;
  /** Pointer/touch listeners for dragging from anywhere on the row. */
  rootProps: Record<string, unknown>;
  isDragging: boolean;
}

/** Sortable row: drag from anywhere with a pointer, or from the handle with the keyboard. */
export function SortableItem({
  id,
  label,
  children,
  disabled,
}: {
  id: string;
  label: string;
  children: (args: SortableRenderArgs) => ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled, data: { type: 'item' } });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  const { onKeyDown, ...pointerListeners } = (listeners ?? {}) as Record<string, unknown>;
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      onKeyDown={onKeyDown as never}
      aria-label={`Move ${label}`}
      aria-roledescription="draggable task"
      className="-ml-1 grid h-6 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted/50 hover:text-muted focus-visible:text-fg"
    >
      <GripVertical size={14} aria-hidden />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style} className="min-w-0">
      {children({ handle, rootProps: disabled ? {} : pointerListeners, isDragging })}
    </div>
  );
}
