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
import { Plus, Search, MoreHorizontal, Edit, Trash2, FolderOpen } from "lucide-react"
import { toast } from "sonner"
import AddEditCategorySheet from "./AddEditCategorySheet"
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

interface Category {
  id: string
  org_id: string
  name: string
  is_active: boolean
  created_at: string
}

interface CategoryWithCount extends Category {
  itemCount: number
}

interface CategoriesTabProps {
  orgId: string
}

export default function CategoriesTab({ orgId }: CategoriesTabProps) {
  const [categories, setCategories] = useState<CategoryWithCount[]>([])
  const [filteredCategories, setFilteredCategories] = useState<CategoryWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [orgId])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) throw error

      const { data: itemsData, error: itemsError } = await supabase
        .from("inventory_items")
        .select("category_id")
        .eq("org_id", orgId)
        .eq("is_active", true)

      if (itemsError) throw itemsError

      const countsByCategory = (itemsData || []).reduce((acc: Record<string, number>, item) => {
        if (item.category_id) {
          acc[item.category_id] = (acc[item.category_id] || 0) + 1
        }
        return acc
      }, {})

      const categoriesWithCount: CategoryWithCount[] = (data || []).map((category) => ({
        ...category,
        itemCount: countsByCategory[category.id] || 0,
      }))

      setCategories(categoriesWithCount)
      setFilteredCategories(categoriesWithCount)
    } catch (error) {
      console.error("Error loading categories:", error)
      toast.error("Failed to load categories")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const filtered = categories.filter((category) =>
      category.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredCategories(filtered)
  }, [searchTerm, categories])

  const handleDelete = async () => {
    if (!categoryToDelete) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from("inventory_categories")
        .update({ is_active: false })
        .eq("id", categoryToDelete.id)
        .eq("org_id", orgId)

      if (error) throw error

      setCategories(categories.filter((c) => c.id !== categoryToDelete.id))
      toast.success("Category deleted successfully")
      setDeleteDialogOpen(false)
      setCategoryToDelete(null)
    } catch (error) {
      console.error("Error deleting category:", error)
      toast.error("Failed to delete category")
    } finally {
      setDeleting(false)
    }
  }

  const handleAddCategory = () => {
    setEditingCategory(null)
    setSheetOpen(true)
  }

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category)
    setSheetOpen(true)
  }

  const handleSheetSuccess = () => {
    loadCategories()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Filter Bar (plain, no card) ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search categories..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={handleAddCategory}>
          <Plus className="mr-2 size-4" />
          Add Category
        </Button>
      </div>

      {/* ── DESKTOP: Table inside a Card ── */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Manage inventory item categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category Name</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading categories...
                    </TableCell>
                  </TableRow>
                ) : filteredCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? "No categories found matching your search" : "No categories yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCategories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{category.itemCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(category.created_at).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditCategory(category)}>
                              <Edit className="mr-2 size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setCategoryToDelete(category)
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

      {/* ── MOBILE: Category Cards ── */}
      <div className="flex flex-col gap-4 md:hidden">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading categories...</div>
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? "No categories found matching your search" : "No categories yet"}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">{filteredCategories.length}</span>{" "}
              categories{" "}
              {searchTerm ? "matching filters" : "in total"}
            </p>

            {filteredCategories.map((category) => (
              <Card key={category.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FolderOpen className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold leading-tight truncate">
                          {category.name}
                        </CardTitle>
                        <CardDescription className="text-xs truncate mt-0.5">
                          {category.itemCount} item{category.itemCount !== 1 && 's'}
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
                          <DropdownMenuItem onClick={() => handleEditCategory(category)}>
                            <Edit className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCategoryToDelete(category)
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
                      <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                      <p className="text-sm font-medium">
                        {new Date(category.created_at).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Items</p>
                      <p className="text-sm font-medium">{category.itemCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* Add/Edit Category Sheet */}
      <AddEditCategorySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingCategory={editingCategory}
        orgId={orgId}
        onSuccess={handleSheetSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{categoryToDelete?.name}&quot;? This action cannot be undone.
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
