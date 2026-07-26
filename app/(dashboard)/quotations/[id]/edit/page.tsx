"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, Edit, Download, Printer } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { format } from "date-fns"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface QuotationWithDetails {
  id: string
  quote_no: string
  order_no: string | null
  client_name: string
  client_address: string | null
  client_district: string | null
  client_state: string | null
  client_pin_code: string | null
  subject: string | null
  body_text: string | null
  items: any[]
  subtotal: number
  discount_type: "percentage" | "fixed" | null
  discount_value: number | null
  discount_amount: number | null
  sgst: number
  cgst: number
  grand_total: number
  include_gst: boolean
  gst_rate: number
  notes: string | null
  status: string
  created_at: string
  updated_at: string
  valid_till: string | null
}

export default function ViewQuotationPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const id = params.id as string
  const [loading, setLoading] = useState(true)
  const [quotation, setQuotation] = useState<QuotationWithDetails | null>(null)
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  // Fetch organization ID
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

  // Load quotation
  useEffect(() => {
    if (id && currentOrgId) {
      loadQuotation()
    }
  }, [id, currentOrgId])

  const loadQuotation = async () => {
    try {
      if (!user?.id || !id || !currentOrgId) return

      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", id)
        .eq("org_id", currentOrgId)
        .single()

      if (error) throw error
      setQuotation(data)
    } catch (error) {
      console.error("Error loading quotation:", error)
      toast.error("Failed to load quotation")
      router.push("/quotations")
    } finally {
      setLoading(false)
    }
  }

  // PDF generation
  const generatePDF = () => {
    if (!quotation) return

    try {
      const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
      const pageW = 210
      const margin = 15

      // Helper to convert hex to RGB
      const hexToRgb = (hex: string): [number, number, number] => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result
          ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
          : [22, 45, 60]
      }
      const [r, g, b] = hexToRgb("#162d3c")

      // Header
      doc.setFillColor(r, g, b)
      doc.rect(0, 0, pageW, 14, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.text("Quotation", margin, 9)

      doc.setTextColor(200, 200, 200)
      doc.setFontSize(8)
      doc.text(`#${quotation.quote_no}`, pageW - margin, 9, { align: "right" })

      // Customer info
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text("Service Details", margin, 25)

      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      const customerLines = [
        `Customer: ${quotation.client_name}`,
        quotation.client_address || "",
        [quotation.client_district, quotation.client_state, quotation.client_pin_code]
          .filter(Boolean)
          .join(", "),
        quotation.order_no ? `Order No: ${quotation.order_no}` : "",
      ].filter(Boolean)
      doc.text(customerLines, margin, 32)

      // Subject & body
      let yPos = 32 + customerLines.length * 5 + 5
      if (quotation.subject) {
        doc.setFont("helvetica", "bold")
        doc.text(`Subject: ${quotation.subject}`, margin, yPos)
        yPos += 5
      }
      if (quotation.body_text) {
        doc.setFont("helvetica", "normal")
        const bodyLines = doc.splitTextToSize(quotation.body_text, pageW - 2 * margin)
        doc.text(bodyLines, margin, yPos)
        yPos += bodyLines.length * 5 + 5
      }

      // Items table
      const tableHeaders = ["#", "Description", "Qty", "Unit Price (₹)", "Amount (₹)"]
      const tableRows = quotation.items.map((item, idx) => [
        String(idx + 1),
        item.description,
        String(item.quantity),
        `₹${Number(item.unit_price).toLocaleString("en-IN")}`,
        `₹${Number(item.amount).toLocaleString("en-IN")}`,
      ])

      autoTable(doc, {
        startY: yPos,
        head: [tableHeaders],
        body: tableRows,
        theme: "striped",
        headStyles: {
          fillColor: [r, g, b],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
        },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 15 },
          3: { cellWidth: 25 },
          4: { cellWidth: 25 },
        },
        margin: { left: margin, right: margin },
      })

      const finalY = (doc as any).lastAutoTable.finalY + 5

      // Totals (with discount)
      const subtotal = quotation.subtotal
      const discountAmount = quotation.discount_amount || 0
      const discountedSubtotal = subtotal - discountAmount
      const cgst = quotation.cgst || 0
      const sgst = quotation.sgst || 0
      const grandTotal = quotation.grand_total

      const totalX = pageW - margin - 60
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.text("Subtotal:", totalX, finalY + 5)
      doc.text(`₹${subtotal.toLocaleString("en-IN")}`, pageW - margin, finalY + 5, { align: "right" })

      if (discountAmount > 0) {
        const discountLabel =
          quotation.discount_type === "percentage"
            ? `Discount (${quotation.discount_value}%)`
            : `Discount (₹${quotation.discount_value})`
        doc.text(discountLabel, totalX, finalY + 10)
        doc.setTextColor(200, 0, 0)
        doc.text(`- ₹${discountAmount.toLocaleString("en-IN")}`, pageW - margin, finalY + 10, {
          align: "right",
        })
        doc.setTextColor(40, 40, 40)
      }

      doc.text("Subtotal after Discount:", totalX, finalY + 15)
      doc.text(`₹${discountedSubtotal.toLocaleString("en-IN")}`, pageW - margin, finalY + 15, {
        align: "right",
      })

      if (quotation.include_gst) {
        doc.text("CGST (9%):", totalX, finalY + 20)
        doc.text(`₹${cgst.toLocaleString("en-IN")}`, pageW - margin, finalY + 20, { align: "right" })
        doc.text("SGST (9%):", totalX, finalY + 25)
        doc.text(`₹${sgst.toLocaleString("en-IN")}`, pageW - margin, finalY + 25, { align: "right" })
        doc.setFont("helvetica", "bold")
        doc.text("Grand Total:", totalX, finalY + 32)
        doc.text(`₹${grandTotal.toLocaleString("en-IN")}`, pageW - margin, finalY + 32, {
          align: "right",
        })
      } else {
        doc.setFont("helvetica", "bold")
        doc.text("Total:", totalX, finalY + 22)
        doc.text(`₹${grandTotal.toLocaleString("en-IN")}`, pageW - margin, finalY + 22, {
          align: "right",
        })
      }

      // Notes
      if (quotation.notes) {
        const notesY = Math.max(finalY + 40, (doc as any).internal.pageSize.height - 30)
        doc.setFontSize(8)
        doc.setFont("helvetica", "bold")
        doc.text("Terms & Conditions:", margin, notesY)
        doc.setFont("helvetica", "normal")
        const notesLines = doc.splitTextToSize(quotation.notes, pageW - 2 * margin)
        doc.text(notesLines, margin, notesY + 5)
      }

      // Footer
      const lastY = (doc as any).internal.pageSize.height - 10
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text("Generated by Remindi · remindi.online", pageW / 2, lastY, { align: "center" })

      doc.save(`Quotation-${quotation.quote_no}.pdf`)
      toast.success("PDF downloaded successfully")
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to generate PDF")
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading quotation...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!quotation) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Quotation not found.</p>
        </div>
      </DashboardLayout>
    )
  }

  // Derived values
  const subtotal = quotation.subtotal
  const discountAmount = quotation.discount_amount || 0
  const discountedSubtotal = subtotal - discountAmount
  const cgst = quotation.cgst || 0
  const sgst = quotation.sgst || 0
  const grandTotal = quotation.grand_total

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header with actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/quotations">
              <Button variant="outline" size="icon">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Quotation #{quotation.quote_no}
              </h1>
              <p className="text-muted-foreground">
                Created on {format(new Date(quotation.created_at), "dd MMM yyyy")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 size-4" />
              Print
            </Button>
            <Button variant="outline" onClick={generatePDF}>
              <Download className="mr-2 size-4" />
              PDF
            </Button>
            <Link href={`/quotations/${id}/edit`}>
              <Button>
                <Edit className="mr-2 size-4" />
                Edit
              </Button>
            </Link>
          </div>
        </div>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
            <CardDescription>Client details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="text-sm text-muted-foreground">Customer Name</span>
                <p className="font-medium">{quotation.client_name}</p>
              </div>
              {quotation.order_no && (
                <div>
                  <span className="text-sm text-muted-foreground">Order Number</span>
                  <p className="font-medium">{quotation.order_no}</p>
                </div>
              )}
            </div>
            {quotation.client_address && (
              <div>
                <span className="text-sm text-muted-foreground">Address</span>
                <p>{quotation.client_address}</p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {quotation.client_district && (
                <div>
                  <span className="text-sm text-muted-foreground">District</span>
                  <p>{quotation.client_district}</p>
                </div>
              )}
              {quotation.client_state && (
                <div>
                  <span className="text-sm text-muted-foreground">State</span>
                  <p>{quotation.client_state}</p>
                </div>
              )}
              {quotation.client_pin_code && (
                <div>
                  <span className="text-sm text-muted-foreground">Pin Code</span>
                  <p>{quotation.client_pin_code}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Letter Details */}
        <Card>
          <CardHeader>
            <CardTitle>Letter Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quotation.subject && (
              <div>
                <span className="text-sm text-muted-foreground">Subject</span>
                <p className="font-medium">{quotation.subject}</p>
              </div>
            )}
            {quotation.body_text && (
              <div>
                <span className="text-sm text-muted-foreground">Body</span>
                <p className="whitespace-pre-wrap">{quotation.body_text}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <CardDescription>Services or products included</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">#</th>
                    <th className="py-2 text-left font-medium">Description</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Unit Price (₹)</th>
                    <th className="py-2 text-right font-medium">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.items.map((item, index) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2">{index + 1}</td>
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">
                        ₹{item.unit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 text-right font-medium">
                        ₹{item.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Totals – with discount display */}
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 border-b border-border pb-4">
              {/* Subtotal */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">
                  ₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>

              {/* Discount (only if > 0) */}
              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    Discount ({quotation.discount_type === "percentage"
                      ? `${quotation.discount_value}%`
                      : `₹${quotation.discount_value}`}):
                  </span>
                  <span className="font-medium text-red-600">
                    - ₹{discountAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}

              {/* Subtotal after Discount */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal after Discount:</span>
                <span className="font-medium">
                  ₹{discountedSubtotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>

              {/* GST section */}
              {quotation.include_gst && (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">CGST (9%):</span>
                    <span className="font-medium">
                      ₹{cgst.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">SGST (9%):</span>
                    <span className="font-medium">
                      ₹{sgst.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Grand Total */}
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Grand Total:</span>
              <span className="text-primary">
                ₹{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {quotation.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{quotation.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
