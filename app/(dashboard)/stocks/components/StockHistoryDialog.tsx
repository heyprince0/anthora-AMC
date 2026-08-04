"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "@/components/ui/skeleton"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface InventoryItem {
  id: string
  name: string
}

interface StockMovement {
  id: string
  movement_type: "in" | "out"
  quantity: number
  reason: string
  notes: string | null
  supplier_id: string | null
  created_at: string
}

interface StockHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null
  orgId: string
}

export default function StockHistoryDialog({
  open,
  onOpenChange,
  item,
  orgId,
}: StockHistoryDialogProps) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [movementToDelete, setMovementToDelete] = useState<StockMovement | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open && item) {
      loadHistory()
    }
  }, [open, item?.id, orgId])

  const loadHistory = async () => {
    if (!item) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("inventory_stock_movements")
        .select("*")
        .eq("org_id", orgId)
        .eq("item_id", item.id)
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) throw error
      setMovements(data || [])
    } catch (error) {
      console.error("Error loading stock history:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (movement: StockMovement) => {
    setMovementToDelete(movement)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!movementToDelete) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from("inventory_stock_movements")
        .delete()
        .eq("id", movementToDelete.id)
        .eq("org_id", orgId)

      if (error) throw error

      setMovements((prev) => prev.filter((m) => m.id !== movementToDelete.id))
      toast.success("Stock movement deleted")
      setDeleteDialogOpen(false)
      setMovementToDelete(null)
    } catch (error) {
      console.error("Error deleting stock movement:", error)
      toast.error("Failed to delete stock movement")
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-5xl max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl">Stock History: {item?.name}</DialogTitle>
          <DialogDescription>
            Chronological record of all stock movements
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-3 px-4 whitespace-nowrap">Date &amp; Time</TableHead>
                <TableHead className="py-3 px-4">Type</TableHead>
                <TableHead className="py-3 px-4 text-right">Quantity</TableHead>
                <TableHead className="py-3 px-4">Reason</TableHead>
                <TableHead className="py-3 px-4">Notes</TableHead>
                <TableHead className="py-3 px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-3 px-4"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="py-3 px-4"><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell className="py-3 px-4"><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell className="py-3 px-4"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="py-3 px-4"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="py-3 px-4"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    No stock movements recorded
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="py-3 px-4 text-sm whitespace-nowrap">{formatDate(movement.created_at)}</TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge
                        className={movement.movement_type === "in" 
                          ? "bg-green-500/10 text-green-600 border-green-500/20" 
                          : "bg-red-500/10 text-red-600 border-red-500/20"
                        }
                      >
                        {movement.movement_type === "in" ? "In" : "Out"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right font-medium whitespace-nowrap">
                      {movement.movement_type === "in" ? "+" : "-"}{movement.quantity}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm">{movement.reason}</TableCell>
                    <TableCell className="py-3 px-4 text-sm text-muted-foreground">
                      {movement.notes || "—"}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={() => handleDeleteClick(movement)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Stock Movement</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this{" "}
                {movementToDelete?.movement_type === "in" ? "stock in" : "stock out"} entry of{" "}
                {movementToDelete?.quantity} unit(s)? This will remove it from the history
                permanently and will not adjust the item&apos;s current stock quantity.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} disabled={deleting} className="bg-red-600">
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
