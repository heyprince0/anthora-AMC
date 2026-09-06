"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Search, ArrowUp, ArrowDown } from "lucide-react"
import { toast } from "sonner"

interface StockMovement {
  id: string
  org_id: string
  item_id: string
  movement_type: "in" | "out"
  quantity: number
  reason: string
  reference_type: string | null
  reference_id: string | null
  supplier_id: string | null
  technician_id: string | null
  customer_name: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

interface InventoryItem {
  id: string
  name: string
}

interface TechnicianOption {
  id: string
  name: string
}

interface SupplierOption {
  id: string
  name: string
}

interface StockMovementsTableProps {
  orgId: string
}

export default function StockMovementsTable({ orgId }: StockMovementsTableProps) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterReason, setFilterReason] = useState("all")
  const [filterDate, setFilterDate] = useState("")

  useEffect(() => {
    loadData()
  }, [orgId])

  const loadData = async () => {
    try {
      setLoading(true)

      const [movementsRes, itemsRes, techniciansRes, suppliersRes] = await Promise.all([
        supabase
          .from("inventory_stock_movements")
          .select("*")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("inventory_items").select("id, name").eq("org_id", orgId),
        supabase.from("technicians").select("id, name").eq("org_id", orgId),
        supabase.from("inventory_suppliers").select("id, name").eq("org_id", orgId),
      ])

      if (movementsRes.error) throw movementsRes.error
      if (itemsRes.error) throw itemsRes.error
      if (techniciansRes.error) throw techniciansRes.error
      if (suppliersRes.error) throw suppliersRes.error

      setMovements(movementsRes.data || [])
      setItems(itemsRes.data || [])
      setTechnicians(techniciansRes.data || [])
      setSuppliers(suppliersRes.data || [])
    } catch (error) {
      console.error("Error loading stock movements:", error)
      toast.error("Failed to load stock movements")
    } finally {
      setLoading(false)
    }
  }

  const getItemName = (itemId: string) => items.find((i) => i.id === itemId)?.name || "Unknown Item"
  const getTechnicianName = (id: string | null) => { if (!id) return "—"; return technicians.find((t) => t.id === id)?.name || "—" }
  const getSupplierName = (id: string | null) => { if (!id) return "—"; return suppliers.find((s) => s.id === id)?.name || "—" }

  const filteredMovements = movements.filter((movement) => {
    const itemName = getItemName(movement.item_id).toLowerCase()
    const matchesSearch = itemName.includes(searchTerm.toLowerCase())
    const matchesType = filterType === "all" || movement.movement_type === filterType
    const matchesReason = filterReason === "all" || movement.reason === filterReason
    const matchesDate = !filterDate || movement.created_at.split("T")[0] === filterDate
    return matchesSearch && matchesType && matchesReason && matchesDate
  })

  const uniqueReasons = Array.from(new Set(movements.map((m) => m.reason).filter(Boolean))).sort()

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

  // Shared filters JSX — used in both desktop card and mobile section
  const FiltersRow = (
    <div className="flex flex-col gap-4 md:flex-row md:items-center flex-wrap">
      <div className="relative flex-1 min-w-[150px]">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search items..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="in">Stock In</SelectItem>
            <SelectItem value="out">Stock Out</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterReason} onValueChange={setFilterReason}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            {uniqueReasons.map((reason) => (
              <SelectItem key={reason} value={reason}>{reason}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-[160px]">
          <Input
            type="date"
            className="w-full"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          {!filterDate && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              Date
            </span>
          )}
        </div>
        {filterDate && (
          <Button variant="ghost" size="sm" onClick={() => setFilterDate("")}>
            Clear
          </Button>
        )}
      </div>
    </div>
  )

  const emptyMessage = searchTerm || filterType !== "all" || filterReason !== "all"
    ? "No movements found matching filters"
    : "No stock movements recorded"

  return (
    <div className="flex flex-col gap-4">

      {/* ── DESKTOP: wrapper Card with table ── */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Stock Movements</CardTitle>
          <CardDescription>Complete audit ledger of all inventory movements</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {FiltersRow}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Loading stock movements...
                    </TableCell>
                  </TableRow>
                ) : filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(movement.created_at)}</TableCell>
                      <TableCell className="font-medium">{getItemName(movement.item_id)}</TableCell>
                      <TableCell>
                        <Badge className={movement.movement_type === "in" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"}>
                          {movement.movement_type === "in" ? "In" : "Out"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {movement.movement_type === "in" ? "+" : "-"}{movement.quantity}
                      </TableCell>
                      <TableCell className="text-sm">{movement.reason}</TableCell>
                      <TableCell className="text-sm">{getTechnicianName(movement.technician_id)}</TableCell>
                      <TableCell className="text-sm">{getSupplierName(movement.supplier_id)}</TableCell>
                      <TableCell className="text-sm">{movement.customer_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{movement.notes || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── MOBILE: individual Cards per movement ── */}
      <div className="flex flex-col gap-4 md:hidden">
        {/* Title */}
        <div>
          <h2 className="text-lg font-semibold">Stock Movements</h2>
          <p className="text-sm text-muted-foreground">Complete audit ledger of all inventory movements</p>
        </div>

        {/* Filters */}
        {FiltersRow}

        {/* Cards */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading stock movements...</div>
        ) : filteredMovements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{emptyMessage}</div>
        ) : (
          filteredMovements.map((movement) => (
            <Card key={movement.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  {/* Left: colored icon + item name + date */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${movement.movement_type === "in" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                      {movement.movement_type === "in"
                        ? <ArrowUp className="size-5 text-green-600" />
                        : <ArrowDown className="size-5 text-red-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold leading-tight truncate">
                        {getItemName(movement.item_id)}
                      </CardTitle>
                      <CardDescription className="text-xs truncate mt-0.5">
                        {formatDate(movement.created_at)}
                      </CardDescription>
                    </div>
                  </div>

                  {/* Right: In/Out badge + quantity */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={movement.movement_type === "in" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"}>
                      {movement.movement_type === "in" ? "In" : "Out"}
                    </Badge>
                    <span className={`text-sm font-bold ${movement.movement_type === "in" ? "text-green-600" : "text-red-600"}`}>
                      {movement.movement_type === "in" ? "+" : "-"}{movement.quantity}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
                    <p className="text-sm font-medium">{movement.reason}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Technician</p>
                    <p className="text-sm font-medium">{getTechnicianName(movement.technician_id)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Supplier</p>
                    <p className="text-sm font-medium">{getSupplierName(movement.supplier_id)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Customer</p>
                    <p className="text-sm font-medium">{movement.customer_name || "—"}</p>
                  </div>
                  {movement.notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                      <p className="text-sm font-medium">{movement.notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
