"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface InventoryItem {
  id: string
  org_id: string
  name: string
  current_stock: number
  unit: string
}

interface StockInOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null
  mode: "in" | "out"
  orgId: string
  onSuccess: () => void
}

const OUT_REASONS = ["Sold", "Used", "Returned", "Adjustment", "Damage", "Sample", "Other"]
const IN_REASONS = ["Purchase", "Returned", "Adjustment", "Other"]

const REASON_DISPLAY_MAP: Record<string, string> = {
  Sold: "Sell",
  Purchase: "Purchase",
  Used: "Used",
  Returned: "Returned",
  Adjustment: "Adjustment",
  Damage: "Damage",
  Sample: "Sample",
  Other: "Other",
}

export default function StockInOutDialog({
  open,
  onOpenChange,
  item,
  mode,
  orgId,
  onSuccess,
}: StockInOutDialogProps) {
  const [quantity, setQuantity] = useState(0)
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [technicianId, setTechnicianId] = useState("")
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([])
  const [technicians, setTechnicians] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setQuantity(0)
      setReason("")
      setNotes("")
      setSupplierId("")
      setCustomerName("")
      setTechnicianId("")
      setError("")
      loadSuppliers()
      loadTechnicians()
    }
  }, [open, orgId])

  const loadSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_suppliers")
        .select("id, name")
        .eq("org_id", orgId)

      if (error) throw error
      setSuppliers(data || [])
    } catch (error) {
      console.error("Error loading suppliers:", error)
    }
  }

  const loadTechnicians = async () => {
    try {
      const { data, error } = await supabase
        .from("technicians")
        .select("id, name")
        .eq("org_id", orgId)

      if (error) throw error
      setTechnicians(data || [])
    } catch (error) {
      console.error("Error loading technicians:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!item) return
    if (!quantity || quantity <= 0) {
      setError("Quantity must be greater than 0")
      return
    }
    if (!reason) {
      setError("Please select a reason")
      return
    }

    setLoading(true)
    try {
      const newStock = mode === "in" 
        ? item.current_stock + quantity 
        : item.current_stock - quantity

      if (mode === "out" && newStock < 0) {
        setError(`Cannot reduce stock below 0. Current stock: ${item.current_stock} ${item.unit}`)
        return
      }

      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ current_stock: newStock })
        .eq("id", item.id)
        .eq("org_id", orgId)

      if (updateError) throw updateError

      const movementData: any = {
        org_id: orgId,
        item_id: item.id,
        movement_type: mode,
        quantity: quantity,
        reason: reason,
        supplier_id: supplierId || null,
        technician_id: technicianId || null,
        notes: notes || null,
      }

      if (mode === "out" && customerName.trim()) {
        movementData.customer_name = customerName.trim()
      }

      const { error: movementError } = await supabase
        .from("inventory_stock_movements")
        .insert([movementData])

      if (movementError) throw movementError

      toast.success(`Stock ${mode === "in" ? "added" : "removed"} successfully`)
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error("Error updating stock:", error)
      toast.error("Failed to update stock")
    } finally {
      setLoading(false)
    }
  }

  const allReasons = mode === "out" ? OUT_REASONS : IN_REASONS
  const primaryReasons = mode === "out" ? ["Sold", "Used"] : ["Purchase"]
  const otherReasons = allReasons.filter(r => !primaryReasons.includes(r))

  const getDisplayName = (r: string) => REASON_DISPLAY_MAP[r] || r

  // Determine visibility for customer and technician fields (only for stock out)
  const showCustomer = mode === "out" && reason === "Sold"
  const showTechnician = mode === "out" && reason === "Used"
  // For other reasons, hide both (only "Sell" and "Used" have dedicated fields)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "in" ? "Stock In" : "Stock Out"}: {item?.name}
          </DialogTitle>
          <DialogDescription>
            Current Stock: {item?.current_stock} {item?.unit}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Quantity */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="quantity">Quantity {item?.unit && `(${item.unit})`} *</Label>
            <Input
              id="quantity"
              type="number"
              placeholder="0"
              value={quantity === 0 ? "" : quantity}
              onChange={(e) => setQuantity(e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
              min="0"
              step="0.01"
              required
            />
          </div>

          {/* Reason */}
          <div className="flex flex-col gap-2">
            <Label>Reason *</Label>
            <div className="flex flex-wrap items-center gap-2">
              {primaryReasons.map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant={reason === r ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReason(r)}
                  className="flex-1 sm:flex-none"
                >
                  {getDisplayName(r)}
                </Button>
              ))}
              <Select
                value={otherReasons.includes(reason) ? reason : ""}
                onValueChange={(val) => setReason(val)}
              >
                <SelectTrigger className="flex-1 sm:flex-none sm:w-[160px]">
                  <SelectValue placeholder="More reasons" />
                </SelectTrigger>
                <SelectContent>
                  {otherReasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {getDisplayName(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reason && (
              <p className="text-sm text-muted-foreground">
                Selected: <span className="font-medium">{getDisplayName(reason)}</span>
              </p>
            )}
          </div>

          {/* Supplier (only for Stock In) */}
          {mode === "in" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="supplier">Supplier (optional)</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Customer Name – only for Stock Out with "Sell" reason */}
          {showCustomer && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                placeholder="Enter customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          )}

          {/* Technician – only for Stock Out with "Used" reason */}
          {showTechnician && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="technician">Used By Technician</Label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this movement..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Processing..." : mode === "in" ? "Add Stock" : "Remove Stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
