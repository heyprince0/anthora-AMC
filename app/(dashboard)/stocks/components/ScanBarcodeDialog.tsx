"use client"

import { useEffect, useRef, useState } from "react"
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import StockInOutDialog from "./StockInOutDialog"
import AddEditItemSheet from "./AddEditItemSheet"

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
  max_stock_level: number | null
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

interface ScanBarcodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  categories: Category[]
  onRefresh: () => void
}

export default function ScanBarcodeDialog({
  open,
  onOpenChange,
  orgId,
  categories,
  onRefresh,
}: ScanBarcodeDialogProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [foundItem, setFoundItem] = useState<InventoryItem | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [stockDialogOpen, setStockDialogOpen] = useState(false)
  const [stockDialogMode, setStockDialogMode] = useState<"in" | "out">("in")
  const [addItemSheetOpen, setAddItemSheetOpen] = useState(false)
  const [limitsLoading, setLimitsLoading] = useState(false)
  const [maxInventory, setMaxInventory] = useState<number>(0)
  const [currentInventoryCount, setCurrentInventoryCount] = useState<number>(0)
  const [planStatus, setPlanStatus] = useState<'active' | 'expired' | 'cancelled'>('active')
  const [planName, setPlanName] = useState<string>('')
  const [showLimitModal, setShowLimitModal] = useState(false)

  useEffect(() => {
    if (open && scanning === false) {
      waitForElementAndStart()
    }
  }, [open])

  useEffect(() => {
    return () => {
      stopScanning()
    }
  }, [])

  // Waits for the Dialog portal to actually mount "barcode-scanner-container"
  // into the DOM before starting the scanner. Radix/shadcn Dialog renders its
  // content through a portal, which lands one render tick after `open`
  // becomes true — so calling startScanning() directly on [open] can race
  // ahead of the DOM and fail with "Element with id=... not found".
  const waitForElementAndStart = () => {
    const el = document.getElementById("barcode-scanner-container")
    if (el) {
      startScanning()
    } else {
      requestAnimationFrame(waitForElementAndStart)
    }
  }

  const startScanning = async () => {
    try {
      setScanning(true)

      const formats = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE,
      ]

      scannerRef.current = new Html5QrcodeScanner(
        "barcode-scanner-container",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          supportedFormats: formats,
          rememberLastUsedCamera: true,
        },
        false
      )

      scannerRef.current.render(
        (decodedText) => {
          handleScan(decodedText)
        },
        (error) => {
          // Suppress error messages for continuous scanning
          if (error && !error.includes("QuotaExceededError")) {
            console.debug("[v0] Scan error:", error)
          }
        }
      )
    } catch (error: any) {
      console.error("[v0] Failed to start scanner:", error)

      if (error.message?.includes("NotAllowedError") || error.message?.includes("permission")) {
        toast.error("Camera access denied")
      } else if (error.message?.includes("NotFoundError")) {
        toast.error("No camera found on this device")
      } else {
        toast.error("Failed to start barcode scanner")
      }

      setScanning(false)
      onOpenChange(false)
    }
  }

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.clear()
        scannerRef.current = null
      } catch (error) {
        console.error("[v0] Error stopping scanner:", error)
      }
    }
    setScanning(false)
  }

  const handleScan = async (code: string) => {
    // Stop scanning immediately
    await stopScanning()
    setScannedCode(code)

    try {
      // Look up item by SKU
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("org_id", orgId)
        .eq("sku", code)
        .eq("is_active", true)
        .maybeSingle()

      if (error) throw error

      if (data) {
        // Item found - show confirmation dialog
        setFoundItem(data)
        setShowConfirmDialog(true)
      } else {
        // Item not found - load plan limits before opening add sheet
        await loadPlanLimits()
        if (checkAndShowLimitModal()) {
          onOpenChange(false)
          return
        }
        setAddItemSheetOpen(true)
      }
    } catch (error) {
      console.error("[v0] Error looking up item:", error)
      toast.error("Failed to look up item")
      onOpenChange(false)
    }
  }

  const loadPlanLimits = async () => {
    try {
      setLimitsLoading(true)

      // Get organization
      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .select("org_id")
        .eq("org_id", orgId)
        .single()

      if (membershipError) throw membershipError

      // Get plan
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("plan_id")
        .eq("id", orgId)
        .single()

      if (orgError) throw orgError

      // Get plan details
      const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("name, max_inventory, status")
        .eq("id", org.plan_id)
        .single()

      if (planError) throw planError

      setPlanName(plan.name)
      setPlanStatus(plan.status)
      setMaxInventory(plan.max_inventory || 0)

      // Get current inventory count
      const { data: items, error: itemsError } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true)

      if (itemsError) throw itemsError

      setCurrentInventoryCount(items?.length || 0)
    } catch (error) {
      console.error("[v0] Error loading plan limits:", error)
    } finally {
      setLimitsLoading(false)
    }
  }

  const checkAndShowLimitModal = () => {
    if (planStatus === 'expired' || planStatus === 'cancelled') {
      toast.error(
        `Your ${planName || 'current'} plan has expired. Renew your plan to add inventory items.`
      )
      return true
    }
    if (maxInventory > 0 && currentInventoryCount >= maxInventory) {
      toast.error(
        `You've reached your inventory limit of ${maxInventory} items. Upgrade your plan to add more.`
      )
      return true
    }
    return false
  }

  const handleStockAction = (mode: "in" | "out") => {
    setStockDialogMode(mode)
    setShowConfirmDialog(false)
    setStockDialogOpen(true)
  }

  const handleStockSuccess = () => {
    setStockDialogOpen(false)
    onRefresh()
    onOpenChange(false)
  }

  const handleAddItemSuccess = () => {
    setAddItemSheetOpen(false)
    onRefresh()
    onOpenChange(false)
  }

  const handleDialogClose = () => {
    setShowConfirmDialog(false)
    setScannedCode(null)
    setFoundItem(null)
    if (scanning) {
      waitForElementAndStart()
    }
  }

  const handleMainDialogClose = (isOpen: boolean) => {
    if (!isOpen) {
      stopScanning()
    }
    onOpenChange(isOpen)
  }

  return (
    <>
      {/* Main Scan Dialog */}
      <Dialog open={open && !showConfirmDialog && !stockDialogOpen && !addItemSheetOpen} onOpenChange={handleMainDialogClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Scan Barcode or QR Code</DialogTitle>
            <DialogDescription>
              Position the barcode or QR code in front of your camera to scan
            </DialogDescription>
          </DialogHeader>

          <div
            id="barcode-scanner-container"
            className="rounded-lg overflow-hidden bg-background"
            style={{ width: "100%", minHeight: "300px" }}
          />
        </DialogContent>
      </Dialog>

      {/* Found Item Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Item Found</AlertDialogTitle>
            <AlertDialogDescription>
              {foundItem && (
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">{foundItem.name}</p>
                  <p className="text-sm">Current Stock: {foundItem.current_stock} {foundItem.unit}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2">
            <Button
              variant="destructive"
              onClick={() => handleStockAction("out")}
              className="w-full"
            >
              Stock Out
            </Button>
            <Button
              variant="default"
              onClick={() => handleStockAction("in")}
              className="w-full"
            >
              Stock In
            </Button>
            <AlertDialogCancel onClick={handleDialogClose} className="w-full">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stock In/Out Dialog */}
      {foundItem && (
        <StockInOutDialog
          open={stockDialogOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              handleStockSuccess()
            } else {
              setStockDialogOpen(isOpen)
            }
          }}
          item={foundItem}
          mode={stockDialogMode}
          orgId={orgId}
          onSuccess={handleStockSuccess}
        />
      )}

      {/* Add New Item Sheet */}
      <AddEditItemSheet
        open={addItemSheetOpen}
        onOpenChange={setAddItemSheetOpen}
        editingItem={null}
        categories={categories}
        orgId={orgId}
        onSuccess={handleAddItemSuccess}
        prefillSku={scannedCode || ""}
      />
    </>
  )
}
