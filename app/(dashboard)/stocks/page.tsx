"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation" // <-- added useSearchParams
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import {
  Package,
  AlertTriangle,
  Minus,
  TrendingUp,
  Truck,
  Plus,
  ScanBarcode,
  ArrowLeftRight,
  FolderTree,
  RefreshCw,
  Coins,
  Calendar,
} from "lucide-react"
import { toast } from "sonner"
import InventorySummaryStrip from "./components/InventorySummaryStrip"
import ItemsTable from "./components/ItemsTable"
import StockMovementsTable from "./components/StockMovementsTable"
import SuppliersTab from "./components/SuppliersTab"
import CategoriesTab from "./components/CategoriesTab"
import AddEditItemSheet from "./components/AddEditItemSheet"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import LimitReachedModal from "@/components/billing/limit-reached-modal"
import ScanBarcodeDialog from "./components/ScanBarcodeDialog"

interface InventoryMetrics {
  totalItems: number
  lowStockCount: number
  outOfStockCount: number
  totalInventoryValue: number
  partsUsedThisMonth: number
}

export default function StocksPage() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams() // <-- get query params
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<InventoryMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("items")
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [scanDialogOpen, setScanDialogOpen] = useState(false)

  // Plan limits
  const { maxInventory, currentInventoryCount, status, planName, isLoading: limitsLoading } = usePlanLimits(currentOrgId)

  // Limit modal state
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalType, setLimitModalType] = useState<'expired' | 'resource-limit'>('expired')
  const [limitModalCustom, setLimitModalCustom] = useState<{ title?: string; description?: string }>({})

  // ── Read tab query param ──
  const tabParam = searchParams.get('tab')
  useEffect(() => {
    if (tabParam && ['items', 'movements', 'categories', 'suppliers'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("memberships")
        .select("org_id")
        .eq("user_id", user.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Failed to fetch organization:", error)
            toast.error("Could not determine your organization")
          } else if (data?.org_id) {
            setCurrentOrgId(data.org_id)
          }
        })
    }
  }, [user?.id])

  useEffect(() => {
    if (currentOrgId) {
      loadMetrics()
      loadCategories()
    }
  }, [currentOrgId, refreshTrigger])

  const loadMetrics = async () => {
    if (!currentOrgId) return
    setLoading(true)
    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from("inventory_items")
        .select("id, current_stock, min_stock_level, purchase_price")
        .eq("org_id", currentOrgId)
        .eq("is_active", true)

      if (itemsError) throw itemsError

      const items = itemsData || []

      const totalItems = items.length
      const lowStockCount = items.filter(
        (item) => item.current_stock <= item.min_stock_level && item.current_stock > 0
      ).length
      const outOfStockCount = items.filter((item) => item.current_stock <= 0).length
      const totalInventoryValue = items.reduce((sum, item) => {
        return sum + (item.current_stock * (item.purchase_price || 0))
      }, 0)

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0]

      const { data: partsData, error: partsError } = await supabase
        .from("service_parts_used")
        .select("quantity")
        .eq("org_id", currentOrgId)
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd)

      if (partsError) throw partsError

      const { data: usedMovementsData, error: usedMovementsError } = await supabase
        .from("inventory_stock_movements")
        .select("quantity")
        .eq("org_id", currentOrgId)
        .eq("movement_type", "out")
        .eq("reason", "Used")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd)

      if (usedMovementsError) throw usedMovementsError

      const partsUsedThisMonth =
        (partsData || []).reduce((sum, part) => sum + (part.quantity || 0), 0) +
        (usedMovementsData || []).reduce((sum, movement) => sum + (movement.quantity || 0), 0)

      setMetrics({
        totalItems,
        lowStockCount,
        outOfStockCount,
        totalInventoryValue,
        partsUsedThisMonth,
      })
    } catch (error) {
      console.error("Error loading metrics:", error)
      toast.error("Failed to load inventory metrics")
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    if (!currentOrgId) return
    try {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .eq("org_id", currentOrgId)

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error("Error loading categories:", error)
    }
  }

  const checkAndShowLimitModal = () => {
    if (status === 'expired' || status === 'cancelled') {
      setLimitModalType('expired')
      setLimitModalCustom({
        title: `Your ${planName || 'current'} plan has expired`,
        description: `Renew your ${planName || 'current'} plan to continue adding inventory items.`,
      })
      setShowLimitModal(true)
      return true
    }
    if (maxInventory > 0 && currentInventoryCount >= maxInventory) {
      setLimitModalType('resource-limit')
      setLimitModalCustom({
        title: "You've reached your inventory limit",
        description: `Your current plan allows a maximum of ${maxInventory} inventory items. You currently have ${currentInventoryCount} items. Upgrade to add more items.`,
      })
      setShowLimitModal(true)
      return true
    }
    return false
  }

  const handleAddItem = () => {
    if (limitsLoading) {
      toast.error("Checking your plan status, please try again in a moment...")
      return
    }
    if (checkAndShowLimitModal()) return
    setEditingItem(null)
    setSheetOpen(true)
  }

  const handleEditItem = (item: any) => {
    setEditingItem(item)
    setSheetOpen(true)
  }

  const handleSheetSuccess = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const handleUpgrade = () => {
    window.location.href = '/billing'
  }

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const formatINR = (amount: number) => `₹${(amount || 0).toLocaleString("en-IN")}`

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:gap-6">

        {/* ── MOBILE header: compact with icon-only secondary buttons ── */}
        <div className="flex items-center justify-between md:hidden">
          <div>
            <h1 className="text-xl font-bold text-foreground">Inventory</h1>
            <p className="text-xs text-muted-foreground">Stock, items &amp; parts</p>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setScanDialogOpen(true)}
              disabled={loading}
              title="Scan Barcode"
            >
              <ScanBarcode className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>

        {/* ── DESKTOP header: full layout ── */}
        <div className="hidden md:flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
            <p className="text-muted-foreground">Manage your stock, items, and parts inventory</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScanDialogOpen(true)} disabled={loading}>
              <ScanBarcode className="mr-2 size-4" />
              Scan Barcode
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {/* ── MOBILE: Summary stats in two rows (3+2) ── */}
        <div className="flex flex-col gap-2 md:hidden">
          {/* Row 1: Total, Low Stock, Out of Stock */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-card p-2 text-center">
              <Package className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-1 text-lg font-bold leading-none">
                {loading ? "—" : metrics?.totalItems ?? 0}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="rounded-lg border bg-card p-2 text-center">
              <AlertTriangle className="mx-auto size-5 text-amber-500" />
              <p className="mt-1 text-lg font-bold leading-none text-amber-600">
                {loading ? "—" : metrics?.lowStockCount ?? 0}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Low Stock</p>
            </div>
            <div className="rounded-lg border bg-card p-2 text-center">
              <Minus className="mx-auto size-5 text-red-500" />
              <p className="mt-1 text-lg font-bold leading-none text-red-600">
                {loading ? "—" : metrics?.outOfStockCount ?? 0}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Out of Stock</p>
            </div>
          </div>

          {/* Row 2: Inventory Value, Parts Used (2 columns) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-card p-2 text-center">
              <Coins className="mx-auto size-5 text-green-500" />
              <p className="mt-1 text-lg font-bold leading-none">
                {loading ? "—" : formatINR(metrics?.totalInventoryValue ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Value</p>
            </div>
            <div className="rounded-lg border bg-card p-2 text-center">
              <Calendar className="mx-auto size-5 text-blue-500" />
              <p className="mt-1 text-lg font-bold leading-none">
                {loading ? "—" : metrics?.partsUsedThisMonth ?? 0}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Parts Used</p>
            </div>
          </div>
        </div>

        {/* ── DESKTOP: Full Inventory Summary Strip ── */}
        {currentOrgId && (
          <div className="hidden md:block">
            <InventorySummaryStrip
              metrics={metrics}
              loading={loading}
              orgId={currentOrgId}
            />
          </div>
        )}

        {/* ── TABS – Icon‑only on mobile, icon+label on desktop ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList
            className={`
              w-full justify-around rounded-none border-b border-border bg-transparent p-0 h-auto
              md:justify-center md:rounded-md md:border-0 md:bg-muted md:p-1 md:h-10
            `}
          >
            <TabsTrigger
              value="items"
              className={`
                flex flex-1 items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent
                px-3 py-3 text-sm font-medium text-muted-foreground transition-all
                data-[state=active]:border-primary data-[state=active]:text-primary
                hover:text-foreground hover:border-muted-foreground/30
                md:flex-none md:rounded-md md:border-0 md:px-4 md:py-1.5
                md:data-[state=active]:bg-background md:data-[state=active]:shadow-sm
                md:data-[state=active]:border-0
              `}
            >
              <Package className="size-5 shrink-0 md:size-4" />
              <span className="hidden md:inline">Items</span>
              <span className="text-xs text-muted-foreground hidden md:inline">
                ({currentInventoryCount || 0})
              </span>
              <span className="ml-1 text-xs font-semibold text-muted-foreground md:hidden">
                {currentInventoryCount || 0}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="movements"
              className={`
                flex flex-1 items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent
                px-3 py-3 text-sm font-medium text-muted-foreground transition-all
                data-[state=active]:border-primary data-[state=active]:text-primary
                hover:text-foreground hover:border-muted-foreground/30
                md:flex-none md:rounded-md md:border-0 md:px-4 md:py-1.5
                md:data-[state=active]:bg-background md:data-[state=active]:shadow-sm
                md:data-[state=active]:border-0
              `}
            >
              <ArrowLeftRight className="size-5 shrink-0 md:size-4" />
              <span className="hidden md:inline">Movements</span>
            </TabsTrigger>

            <TabsTrigger
              value="categories"
              className={`
                flex flex-1 items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent
                px-3 py-3 text-sm font-medium text-muted-foreground transition-all
                data-[state=active]:border-primary data-[state=active]:text-primary
                hover:text-foreground hover:border-muted-foreground/30
                md:flex-none md:rounded-md md:border-0 md:px-4 md:py-1.5
                md:data-[state=active]:bg-background md:data-[state=active]:shadow-sm
                md:data-[state=active]:border-0
              `}
            >
              <FolderTree className="size-5 shrink-0 md:size-4" />
              <span className="hidden md:inline">Categories</span>
            </TabsTrigger>

            <TabsTrigger
              value="suppliers"
              className={`
                flex flex-1 items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent
                px-3 py-3 text-sm font-medium text-muted-foreground transition-all
                data-[state=active]:border-primary data-[state=active]:text-primary
                hover:text-foreground hover:border-muted-foreground/30
                md:flex-none md:rounded-md md:border-0 md:px-4 md:py-1.5
                md:data-[state=active]:bg-background md:data-[state=active]:shadow-sm
                md:data-[state=active]:border-0
              `}
            >
              <Truck className="size-5 shrink-0 md:size-4" />
              <span className="hidden md:inline">Suppliers</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="mt-4">
            {currentOrgId && (
              <ItemsTable
                orgId={currentOrgId}
                onItemsChange={handleSheetSuccess}
                onAddItem={handleAddItem}
                onEditItem={handleEditItem}
                categories={categories}
                refreshTrigger={refreshTrigger}
              />
            )}
          </TabsContent>

          <TabsContent value="movements" className="mt-4">
            {currentOrgId && <StockMovementsTable orgId={currentOrgId} />}
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            {currentOrgId && <CategoriesTab orgId={currentOrgId} />}
          </TabsContent>

          <TabsContent value="suppliers" className="mt-4">
            {currentOrgId && <SuppliersTab orgId={currentOrgId} />}
          </TabsContent>
        </Tabs>

        {/* Add/Edit Item Sheet */}
        <AddEditItemSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          editingItem={editingItem}
          categories={categories}
          orgId={currentOrgId || ''}
          onSuccess={handleSheetSuccess}
        />

        {/* Limit Reached Modal */}
        <LimitReachedModal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          type={limitModalType}
          onUpgrade={handleUpgrade}
          customTitle={limitModalCustom.title}
          customDescription={limitModalCustom.description}
        />

        {/* Scan Barcode Dialog */}
        {currentOrgId && (
          <ScanBarcodeDialog
            open={scanDialogOpen}
            onOpenChange={setScanDialogOpen}
            orgId={currentOrgId}
            categories={categories}
            onRefresh={handleRefresh}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
