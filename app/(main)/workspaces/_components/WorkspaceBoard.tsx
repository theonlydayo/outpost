
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from "@hello-pangea/dnd";
import { deleteWorkspace, moveWorkspace } from "@/actions/workspace";
import { useFetch } from "@/hooks/use-fetch";
import type { WorkspaceStatus } from "@/lib/generated/prisma/enums";
import { WORKSPACE_STATUSES } from "@/lib/workspace-status";
import { WorkspaceDialog } from "@/components/WorkspaceDialog";
import {
    WorkspaceCard,
    type WorkspaceCardData,
} from "@/components/WorkspaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BoardWorkspace = WorkspaceCardData & {
    position: number;
    createdAt: Date;
};

type SortOption =
    | "MANUAL"
    | "UPDATED_DESC"
    | "CREATED_DESC"
    | "NAME_ASC";

function getTimestamp(value: Date | string | number | null | undefined) {
    if (value == null) return 0;

    const timestamp =
        value instanceof Date
            ? value.getTime()
            : new Date(value).getTime();

    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function columnItems(
    workspaces: BoardWorkspace[],
    status: WorkspaceStatus,
    sortBy: SortOption,
) {
    return workspaces
        .filter((workspace) => workspace.status === status)
        .sort((a, b) => {
            switch (sortBy) {
                case "UPDATED_DESC":
                    return (
                        getTimestamp(b.lastActivity) -
                        getTimestamp(a.lastActivity)
                    );

                case "CREATED_DESC":
                    return (
                        getTimestamp(b.createdAt) -
                        getTimestamp(a.createdAt)
                    );

                case "NAME_ASC":
                    return a.name.localeCompare(b.name);

                case "MANUAL":
                default:
                    return a.position - b.position;
            }
        });
}

// Calculate the position between neighboring cards.
function positionBetween(
    before?: BoardWorkspace,
    after?: BoardWorkspace,
) {
    if (before && after) {
        return (before.position + after.position) / 2;
    }

    if (before) return before.position + 1;
    if (after) return after.position - 1;

    return 0;
}

export function WorkspaceBoard({
    workspaces,
}: {
    workspaces: BoardWorkspace[];
}) {
    const [items, setItems] = useState(workspaces);

    // Keep local state synchronized with refreshed server data.
    const [prevWorkspaces, setPrevWorkspaces] = useState(workspaces);

    if (workspaces !== prevWorkspaces) {
        setPrevWorkspaces(workspaces);
        setItems(workspaces);
    }

    // Search, status filtering and sorting state.
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] =
        useState<WorkspaceStatus | "ALL">("ALL");
    const [sortBy, setSortBy] = useState<SortOption>("MANUAL");

    // Filter by workspace name and description.
    const query = searchQuery.trim().toLowerCase();

    const visibleItems = items.filter((workspace) => {
        const searchableText =
            `${workspace.name} ${workspace.description ?? ""}`.toLowerCase();

        const matchesSearch = searchableText.includes(query);

        const matchesStatus =
            statusFilter === "ALL" ||
            workspace.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const isFiltered =
        query !== "" || statusFilter !== "ALL";

    const dragDisabled =
        isFiltered || sortBy !== "MANUAL";

    // Edit and delete dialog state.
    const [selected, setSelected] =
        useState<BoardWorkspace | null>(null);

    const [openDialog, setOpenDialog] =
        useState<"edit" | "delete" | null>(null);

    const {
        fn: deleteWorkspaceFn,
        loading: isDeleting,
    } = useFetch(deleteWorkspace);

    const openFor = (
        workspace: BoardWorkspace,
        dialog: "edit" | "delete",
    ) => {
        setSelected(workspace);
        setOpenDialog(dialog);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();

        if (!selected) return;

        await deleteWorkspaceFn(selected.id);
        setOpenDialog(null);
    };

    // Persist drag-and-drop changes.
    const handleDragEnd = async ({
        draggableId,
        source,
        destination,
    }: DropResult) => {
        if (!destination) return;

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        const status = destination.droppableId as WorkspaceStatus;

        // Manual ordering is used because dragging is disabled
        // whenever another sort option or a filter is active.
        const target = columnItems(
            items,
            status,
            "MANUAL",
        ).filter((workspace) => workspace.id !== draggableId);

        const position = positionBetween(
            target[destination.index - 1],
            target[destination.index],
        );

        const previous = items;

        // Update the interface immediately.
        setItems(
            items.map((workspace) =>
                workspace.id === draggableId
                    ? { ...workspace, status, position }
                    : workspace,
            ),
        );

        try {
            await moveWorkspace(draggableId, status, position);
        } catch {
            // Restore the previous state if saving fails.
            setItems(previous);
            toast.error("Couldn't move workspace");
        }
    };

    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("ALL");
    };

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
            <div className="space-y-4">
                {/* Search, status filter and sorting controls. */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {/* Search by name or description. */}
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />

                        <Input
                            type="search"
                            value={searchQuery}
                            onChange={(event) =>
                                setSearchQuery(event.target.value)
                            }
                            placeholder="Search workspaces..."
                            aria-label="Search workspaces"
                            className="h-9 pl-9"
                        />
                    </div>

                    {/* Filter by workspace status. */}
                    <select
                        value={statusFilter}
                        onChange={(event) =>
                            setStatusFilter(
                                event.target.value as WorkspaceStatus | "ALL",
                            )
                        }
                        aria-label="Filter workspaces by status"
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                        <option value="ALL">All statuses</option>

                        {WORKSPACE_STATUSES.map((column) => (
                            <option
                                key={column.status}
                                value={column.status}
                            >
                                {column.title}
                            </option>
                        ))}
                    </select>

                    {/* Sort workspaces. */}
                    <select
                        value={sortBy}
                        onChange={(event) =>
                            setSortBy(event.target.value as SortOption)
                        }
                        aria-label="Sort workspaces"
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    >
                        <option value="MANUAL">Manual order</option>
                        <option value="UPDATED_DESC">
                            Recently updated
                        </option>
                        <option value="CREATED_DESC">
                            Recently created
                        </option>
                        <option value="NAME_ASC">Name (A–Z)</option>
                    </select>

                    {/* Clear the active search and status filter. */}
                    {isFiltered && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={clearFilters}
                        >
                            Clear filters
                        </Button>
                    )}
                </div>

                {/* Explain why dragging may be unavailable. */}
                {dragDisabled && (
                    <p className="text-xs text-muted-foreground">
                        Clear filters and select Manual order to rearrange
                        workspaces.
                    </p>
                )}

                {/* Empty search/filter results. */}
                {visibleItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 py-16 text-center">
                        <p className="text-sm text-muted-foreground">
                            No workspaces match your search or filters.
                        </p>

                        <Button
                            type="button"
                            variant="ghost"
                            className="mt-2"
                            onClick={clearFilters}
                        >
                            Clear filters
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {WORKSPACE_STATUSES
                            .filter(
                                (column) =>
                                    statusFilter === "ALL" ||
                                    column.status === statusFilter,
                            )
                            .map((column) => {
                                const columnWorkspaces = columnItems(
                                    visibleItems,
                                    column.status,
                                    sortBy,
                                );

                                return (
                                    <div
                                        key={column.status}
                                        className="flex flex-col rounded-lg bg-white/3"
                                    >
                                        {/* Column heading and count. */}
                                        <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                            {column.title}

                                            <span className="font-normal">
                                                {columnWorkspaces.length}
                                            </span>
                                        </div>

                                        <Droppable droppableId={column.status}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.droppableProps}
                                                    className={`flex min-h-40 flex-1 flex-col gap-1.5 rounded-b-lg p-2 transition-colors ${
                                                        snapshot.isDraggingOver
                                                            ? "bg-primary/5"
                                                            : ""
                                                    }`}
                                                >
                                                    {columnWorkspaces.map(
                                                        (workspace, index) => (
                                                            <Draggable
                                                                key={workspace.id}
                                                                draggableId={workspace.id}
                                                                index={index}
                                                                isDragDisabled={
                                                                    dragDisabled
                                                                }
                                                            >
                                                                {(
                                                                    provided,
                                                                    snapshot,
                                                                ) => (
                                                                    <div
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        {...provided.dragHandleProps}
                                                                    >
                                                                        <WorkspaceCard
                                                                            workspace={workspace}
                                                                            highlighted={snapshot.isDragging}
                                                                            actions={
                                                                                <DropdownMenu>
                                                                                    <DropdownMenuTrigger asChild>
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            aria-label="Workspace options"
                                                                                            className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                                                                        >
                                                                                            <MoreHorizontal className="size-4" />
                                                                                        </Button>
                                                                                    </DropdownMenuTrigger>

                                                                                    <DropdownMenuContent align="end">
                                                                                        <DropdownMenuItem
                                                                                            onSelect={() =>
                                                                                                openFor(
                                                                                                    workspace,
                                                                                                    "edit",
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <Pencil className="size-4" />
                                                                                            Edit
                                                                                        </DropdownMenuItem>

                                                                                        <DropdownMenuItem
                                                                                            variant="destructive"
                                                                                            onSelect={() =>
                                                                                                openFor(
                                                                                                    workspace,
                                                                                                    "delete",
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <Trash2 className="size-4" />
                                                                                            Delete
                                                                                        </DropdownMenuItem>
                                                                                    </DropdownMenuContent>
                                                                                </DropdownMenu>
                                                                            }
                                                                        />
                                                                    </div>
                                                                )}
                                                            </Draggable>
                                                        ),
                                                    )}

                                                    {provided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>

            {/* Edit workspace dialog. */}
            {selected && (
                <WorkspaceDialog
                    workspace={selected}
                    open={openDialog === "edit"}
                    onOpenChange={(open) =>
                        !open && setOpenDialog(null)
                    }
                />
            )}

            {/* Delete workspace confirmation dialog. */}
            <AlertDialog
                open={openDialog === "delete"}
                onOpenChange={(open) =>
                    !open && setOpenDialog(null)
                }
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete &ldquo;{selected?.name}&rdquo;?
                        </AlertDialogTitle>

                        <AlertDialogDescription>
                            This permanently deletes the workspace, including
                            its doc and canvas. It can&apos;t be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            Cancel
                        </AlertDialogCancel>

                        <AlertDialogAction
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={!!isDeleting}
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DragDropContext>
    );
}
