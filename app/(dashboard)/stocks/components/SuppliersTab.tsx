"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabase"
import { Plus, Search, MoreHorizontal, Edit, Trash2, Building2 } from "lucide-react"
import { toast } from "sonner"
import AddEditSupplierSheet from "./AddEditSupplierSheet"
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

interface Supplier {
  id: string
  org_id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  gstin: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

interface SuppliersTabProps {
  orgId: string
}

export default function SuppliersTab({ orgId }: SuppliersTabProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadSuppliers()
  }, [orgId])

  const loadSuppliers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("inventory_suppliers")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) throw error
      setSuppliers(data || [])
      setFilteredSuppliers(data || [])
    } catch (error) {
      console.error("Error loading suppliers:", error)
      toast.error("Failed to load suppliers")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const filtered = suppliers.filter((supplier) =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (supplier.email && supplier.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (supplier.phone && supplier.phone.includes(searchTerm))
    )
    setFilteredSuppliers(filtered)
  }, [searchTerm, suppliers])

  const handleDelete = async () => {
    if (!supplierToDelete) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from("inventory_suppliers")
        .update({ is_active: false })
        .eq("id", supplierToDelete.id)
        .eq("org_id", orgId)

      if (error) throw error

      setSuppliers(suppliers.filter((s) => s.id !== supplierToDelete.id))
      toast.success("Supplier deleted successfully")
      setDeleteDialogOpen(false)
      setSupplierToDelete(null)
    } catch (error) {
      console.error("Error deleting supplier:", error)
      toast.error("Failed to delete supplier")
    } finally {
      setDeleting(false)
    }
  }

  const handleAddSupplier = () => {
    setEditingSupplier(null)
    setSheetOpen(true)
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setSheetOpen(true)
  }

  const handleSheetSuccess = () => {
    loadSuppliers()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Filter Bar (plain, no card) ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, email, or phone..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={handleAddSupplier}>
          <Plus className="mr-2 size-4" />
          Add Supplier
        </Button>
      </div>

      {/* ── DESKTOP: Table inside a Card ── */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>Manage your inventory suppliers and vendors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? "No suppliers found matching your search" : "No suppliers yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell className="text-sm">{supplier.contact_person || "—"}</TableCell>
                      <TableCell className="text-sm">{supplier.phone || "—"}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{supplier.address || "—"}</TableCell>
                      <TableCell className="text-sm">{supplier.gstin || "—"}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditSupplier(supplier)}>
                              <Edit className="mr-2 size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSupplierToDelete(supplier)
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── MOBILE: Supplier Cards ── */}
      <div className="flex flex-col gap-4 md:hidden">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading suppliers...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? "No suppliers found matching your search" : "No suppliers yet"}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">{filteredSuppliers.length}</span>{" "}
              suppliers{" "}
              {searchTerm ? "matching filters" : "in total"}
            </p>

            {filteredSuppliers.map((supplier) => (
              <Card key={supplier.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold leading-tight truncate">
                          {supplier.name}
                        </CardTitle>
                        <CardDescription className="text-xs truncate mt-0.5">
                          {supplier.contact_person || "—"}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditSupplier(supplier)}>
                            <Edit className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSupplierToDelete(supplier)
                              setDeleteDialogOpen(true)
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
                      <p className="text-sm font-medium">{supplier.phone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">GSTIN</p>
                      <p className="text-sm font-medium">{supplier.gstin || "—"}</p>
                    </div>
                    {supplier.address && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground mb-0.5">Address</p>
                        <p className="text-sm font-medium line-clamp-2">{supplier.address}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* Add/Edit Supplier Sheet */}
      <AddEditSupplierSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingSupplier={editingSupplier}
        orgId={orgId}
        onSuccess={handleSheetSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{supplierToDelete?.name}&quot;? This action cannot be undone.
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
    </div>
  )
}
