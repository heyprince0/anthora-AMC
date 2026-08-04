"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabase"
import { Plus, Search, MoreHorizontal, Edit, Trash2, History, ArrowUp, ArrowDown } from "lucide-react"
import { toast } from "sonner"
import StockInOutDialog from "./StockInOutDialog"
import StockHistoryDialog from "./StockHistoryDialog"
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
  org_id: string
  name: string
  sku: string
  category_id: string | null
  brand: string | null
  unit: string
  purchase_price: number
  selling_price: number
  current_stock: number
  min_stock_level: number
  storage_location: string | null
  notes: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface Category {
  id: string
  name: string
}

interface ItemsTableProps {
  orgId: string
  onItemsChange: () => void
  onAddItem: () => void
  onEditItem: (item: InventoryItem) => void
  categories: Category[]
  refreshTrigger?: number
}

function getStockStatus(current: number, min: number) {
  if (current <= 0) return { status: "Out of Stock", color: "bg-red-500/10 text-red-600 border-red-500/20" }
  if (current <= min) return { status: "Low Stock", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" }
  return { status: "In Stock", color: "bg-green-500/10 text-green-600 border-green-500/20" }
}

export default function ItemsTable({
  orgId,
  onItemsChange,
  onAddItem,
  onEditItem,
  categories,
  refreshTrigger,
}: ItemsTableProps) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [filterLocation, setFilterLocation] = useState("all")

  const [stockDialogOpen, setStockDialogOpen] = useState(false)
  const [stockDialogMode, setStockDialogMode] = useState<"in" | "out">("in")
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadData()
  }, [orgId, refreshTrigger])

  const loadData = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)

      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error("Error loading items:", error)
      toast.error("Failed to load inventory items")
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = items

    if (searchTerm) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter((item) => {
        const status = getStockStatus(item.current_stock, item.min_stock_level).status
        if (filterStatus === "in-stock") return status === "In Stock"
        if (filterStatus === "low") return status === "Low Stock"
        if (filterStatus === "out") return status === "Out of Stock"
        return true
      })
    }

    if (filterCategory !== "all") {
      filtered = filtered.filter((item) => item.category_id === filterCategory)
    }

    if (filterLocation !== "all") {
      filtered = filtered.filter((item) => item.storage_location === filterLocation)
    }

    setFilteredItems(filtered)
  }

  useEffect(() => {
    applyFilters()
  }, [searchTerm, filterStatus, filterCategory, filterLocation, items])

  // Unique, non-empty storage locations pulled from the current items list
  const locations = Array.from(
    new Set(
      items
        .map((item) => item.storage_location)
        .filter((loc): loc is string => !!loc && loc.trim() !== "")
    )
  ).sort((a, b) => a.localeCompare(b))

  const handleDelete = async () => {
    if (!itemToDelete) return
    setDeleting(true)
    try {
      // Soft delete: set is_active = false (preserves movement history)
      const { error } = await supabase
        .from("inventory_items")
        .update({ is_active: false })
        .eq("id", itemToDelete.id)
        .eq("org_id", orgId)

      if (error) throw error

      setItems(items.filter((i) => i.id !== itemToDelete.id))
      toast.success("Item deleted successfully")
      setDeleteDialogOpen(false)
      setItemToDelete(null)
      onItemsChange()
    } catch (error) {
      console.error("Error deleting item:", error)
      toast.error("Failed to delete item")
    } finally {
      setDeleting(false)
    }
  }

  const handleStockClick = (item: InventoryItem, mode: "in" | "out") => {
    setSelectedItem(item)
    setStockDialogMode(mode)
    setStockDialogOpen(true)
  }

  const handleHistoryClick = (item: InventoryItem) => {
    setHistoryItem(item)
    setHistoryDialogOpen(true)
  }

  const handleStockSuccess = () => {
    loadData()
    onItemsChange()
  }

  const formatINR = (amount: number) => {
    return `₹${(amount || 0).toLocaleString("en-IN")}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Items</CardTitle>
        <CardDescription>Manage your inventory and track stock levels</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center flex-wrap">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, SKU, or brand..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in-stock">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={onAddItem}>
              <Plus className="mr-2 size-4" />
              Add Item
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading inventory items...
                  </TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {searchTerm || filterStatus !== "all" || filterCategory !== "all" || filterLocation !== "all"
                      ? "No items found matching filters"
                      : "No inventory items yet"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const stockStatus = getStockStatus(item.current_stock, item.min_stock_level)
                  const category = categories.find((c) => c.id === item.category_id)
                  const itemValue = item.current_stock * item.purchase_price

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.sku || "—"}</TableCell>
                      <TableCell className="text-sm">{item.brand || "—"}</TableCell>
                      <TableCell className="text-sm">{category?.name || "—"}</TableCell>
                      <TableCell className="text-right">
                        {item.current_stock} {item.unit}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${stockStatus.color}`}>{stockStatus.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatINR(itemValue)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEditItem(item)}>
                              <Edit className="mr-2 size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStockClick(item, "in")}>
                              <ArrowUp className="mr-2 size-4" />
                              Stock In
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStockClick(item, "out")}>
                              <ArrowDown className="mr-2 size-4" />
                              Stock Out
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleHistoryClick(item)}>
                              <History className="mr-2 size-4" />
                              History
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setItemToDelete(item)
                                setDeleteDialogOpen(true)
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Stock In/Out Dialog */}
        <StockInOutDialog
          open={stockDialogOpen}
          onOpenChange={setStockDialogOpen}
          item={selectedItem}
          mode={stockDialogMode}
          orgId={orgId}
          onSuccess={handleStockSuccess}
        />

        {/* Stock History Dialog */}
        <StockHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          item={historyItem}
          orgId={orgId}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Item</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{itemToDelete?.name}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600">
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
