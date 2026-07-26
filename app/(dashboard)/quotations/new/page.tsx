"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase, type Quotation, type QuotationItem } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { Plus, Trash2, Save, ArrowLeft, Loader2, Percent } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

export default function NewQuotationPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [customerName, setCustomerName] = useState("")
  const [customerAddress, setCustomerAddress] = useState("")
  const [customerDistrict, setCustomerDistrict] = useState("")
  const [customerState, setCustomerState] = useState("")
  const [customerPinCode, setCustomerPinCode] = useState("")
  const [orderNo, setOrderNo] = useState("")
  const [subject, setSubject] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [items, setItems] = useState<QuotationItem[]>([
    { id: "1", description: "", quantity: 1, unit_price: 0, amount: 0 },
  ])
  const [includeGst, setIncludeGst] = useState(true)
  const [gstRate, setGstRate] = useState(18)
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage")
  const [discountValue, setDiscountValue] = useState(0)
  const [notes, setNotes] = useState("")

  // --- ADDED: organization ID ---
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  // --- fetch org_id ---
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

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const discountAmount = Math.min(
    subtotal,
    Math.max(0, discountType === "percentage" ? subtotal * (Number(discountValue) || 0) / 100 : Number(discountValue) || 0)
  )
  const discountedSubtotal = subtotal - discountAmount
  const gstRate_ = Number(gstRate ?? 18) / 100
  const gstAmount = includeGst ? Math.round(discountedSubtotal * gstRate_) : 0
  const total = discountedSubtotal + gstAmount

  const handleAddItem = () => {
    const newId = String(Math.max(...items.map(i => parseInt(i.id) || 0), 0) + 1)
    setItems([...items, { id: newId, description: "", quantity: 1, unit_price: 0, amount: 0 }])
  }

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id))
    } else {
      toast.error("You must have at least one item")
    }
  }

  const handleItemChange = (id: string, field: keyof QuotationItem, value: any) => {
    const updatedItems = items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value }
        if (field === "quantity" || field === "unit_price") {
          updated.amount = (updated.quantity || 0) * (updated.unit_price || 0)
        }
        return updated
      }
      return item
    })
    setItems(updatedItems)
  }

  const handleSave = async () => {
    if (!user?.id || !currentOrgId) return

    // Validation
    if (!customerName.trim()) {
      toast.error("Please enter customer name")
      return
    }

    if (items.some(item => !item.description.trim() || item.quantity <= 0 || item.unit_price <= 0)) {
      toast.error("Please fill in all item details")
      return
    }

    setSaving(true)
    try {
      // Generate quote_no based on org scope
      const { data: existingQuotes, error: countError } = await supabase
        .from("quotations")
        .select("quote_no", { count: "exact" })
        .eq("org_id", currentOrgId)   // <-- changed from user_id

      if (countError) throw countError

      const nextNumber = ((existingQuotes?.length || 0) + 1).toString().padStart(3, "0")
      const quoteNo = `QT-${nextNumber}`

      const calculatedSubtotal = (items ?? []).reduce((sum, item) => {
        return sum + (Number(item.quantity ?? 0) * Number(item.unit_price ?? 0))
      }, 0)
      const calculatedDiscountAmount = Math.min(
        calculatedSubtotal,
        Math.max(0, discountType === "percentage" ? calculatedSubtotal * (Number(discountValue) || 0) / 100 : Number(discountValue) || 0)
      )
      const discountedSubtotal = calculatedSubtotal - calculatedDiscountAmount
      const sgst = includeGst ? Math.round(discountedSubtotal * 0.09) : 0
      const cgst = includeGst ? Math.round(discountedSubtotal * 0.09) : 0
      const grandTotal = discountedSubtotal + sgst + cgst

      const { data, error } = await supabase
        .from("quotations")
        .insert({
          user_id: user.id,
          org_id: currentOrgId,           // <-- added
          quote_no: quoteNo,
          order_no: orderNo || null,
          client_name: customerName,
          client_address: customerAddress,
          client_district: customerDistrict,
          client_state: customerState,
          client_pin_code: customerPinCode,
          client_city: "",
          client_gstin: "",
          subject: subject,
          body_text: bodyText,
          items: items,
          subtotal: calculatedSubtotal,
          discount_type: discountType,
          discount_value: Number(discountValue) || 0,
          discount_amount: calculatedDiscountAmount,
          sgst: sgst,
          cgst: cgst,
          grand_total: grandTotal,
          include_gst: includeGst,
          gst_rate: includeGst ? 18 : 0,
          notes: notes,
          status: "Draft",
          valid_till: null,
        })
        .select()

      if (error) throw error
      
      const newQuotationId = data?.[0]?.id
      if (!newQuotationId) throw new Error("Failed to get quotation ID")

      toast.success("Quotation created successfully")
      router.push(`/quotations/${newQuotationId}`)
    } catch (error) {
      console.error("Error saving quotation:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save quotation")
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/quotations">
            <Button variant="outline" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Create Quotation</h1>
            <p className="text-muted-foreground">Prepare a new quotation for your customer</p>
          </div>
        </div>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
            <CardDescription>Enter the customer details for this quotation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer Name*</Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-no">
                Order Number <span className="text-xs text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                id="order-no"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                placeholder="e.g. PO-2026-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-address">Address</Label>
              <Textarea
                id="customer-address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Enter customer address"
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="customer-district">District</Label>
                <Input
                  id="customer-district"
                  value={customerDistrict}
                  onChange={(e) => setCustomerDistrict(e.target.value)}
                  placeholder="District"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-state">State</Label>
                <Input
                  id="customer-state"
                  value={customerState}
                  onChange={(e) => setCustomerState(e.target.value)}
                  placeholder="State"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-pin-code">Pin Code</Label>
                <Input
                  id="customer-pin-code"
                  value={customerPinCode}
                  onChange={(e) => setCustomerPinCode(e.target.value)}
                  placeholder="Pin Code"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subject and Letter Body */}
        <Card>
          <CardHeader>
            <CardTitle>Letter Details</CardTitle>
            <CardDescription>Add subject and letter body for this quotation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Regarding AC AMC works at above mention place"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body-text">Letter Body</Label>
              <Textarea
                id="body-text"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="e.g. Respected Sir/Madam, As per discussion held with you, regarding following works..."
                rows={4}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBodyText(bodyText + (bodyText ? "\n" : "") + "Respected Sir/Madam,")}
                >
                  "Respected Sir/Madam,"
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBodyText(bodyText + (bodyText ? "\n" : "") + "As per discussion held with you, regarding following works at above mention place. Details are given as below;")}
                >
                  "As per discussion..."
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>Add services or products to this quotation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`desc-${item.id}`} className="text-xs">
                    Description
                  </Label>
                  <Input
                    id={`desc-${item.id}`}
                    value={item.description}
                    onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                    placeholder="Service or product description"
                  />
                </div>
                <div className="w-20 space-y-2">
                  <Label htmlFor={`qty-${item.id}`} className="text-xs">
                    Qty
                  </Label>
                  <Input
                    id={`qty-${item.id}`}
                    type="number"
                    min="1"
                    value={item.quantity}
                    onFocus={(e) => e.target.value = ''}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      handleItemChange(item.id, "quantity", isNaN(val) || val <= 0 ? 1 : val);
                    }}
                    onChange={(e) => handleItemChange(item.id, "quantity", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="w-32 space-y-2">
                  <Label htmlFor={`price-${item.id}`} className="text-xs">
                    Unit Price (₹)
                  </Label>
                  <Input
                    id={`price-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onFocus={(e) => e.target.value = ''}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      handleItemChange(item.id, "unit_price", isNaN(val) ? 0 : val);
                    }}
                    onChange={(e) => handleItemChange(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="w-32 space-y-2">
                  <Label htmlFor={`amount-${item.id}`} className="text-xs">
                    Amount (₹)
                  </Label>
                  <div className="h-10 flex items-center px-3 bg-secondary rounded-md text-sm font-medium">
                    {item.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="flex items-end sm:items-end justify-end sm:justify-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(item.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={handleAddItem}
              className="w-full"
            >
              <Plus className="mr-2 size-4" />
              Add Item
            </Button>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 border-b border-border pb-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Percent className="size-4 text-muted-foreground shrink-0" />
                  <Label className="text-sm text-muted-foreground shrink-0">Discount</Label>
                  <Select value={discountType} onValueChange={(val) => setDiscountType(val as "percentage" | "fixed")}>
                    <SelectTrigger className="h-9 w-[104px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">%</SelectItem>
                      <SelectItem value="fixed">₹ Amount</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onFocus={(e) => e.target.value = ''}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value)
                      setDiscountValue(isNaN(val) || val < 0 ? 0 : val)
                    }}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder={discountType === "percentage" ? "0" : "0.00"}
                    className="h-9 w-28"
                  />
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-sm pl-6">
                    <span className="text-muted-foreground">Discount Amount:</span>
                    <span className="font-medium text-red-600">
                      − ₹{discountAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="include-gst"
                  checked={includeGst}
                  onCheckedChange={(checked) => setIncludeGst(checked as boolean)}
                />
                <Label htmlFor="include-gst" className="text-sm cursor-pointer">
                  Include GST ({gstRate}%)
                </Label>
              </div>

              {includeGst && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">GST Amount:</span>
                  <span className="font-medium">₹{gstAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total:</span>
              <span className="text-primary">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Terms & Conditions</CardTitle>
            <CardDescription>Add any additional terms or conditions</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any additional notes or terms..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Link href="/quotations">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="mr-2 size-4" />
                Create Quotation
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}
