"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase, type Invoice, type CompanyProfile } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import {
  ArrowLeft,
  Download,
  MessageCircle,
  Edit,
  ChevronDown,
  Loader2,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { renderSingleLogoHeader } from "@/lib/pdf-header-utils"

const safeStr = (val: any) => String(val ?? "-")
const safeNum = (val: any) => Number(val ?? 0).toLocaleString("en-IN")
const safeDate = (val: any) =>
  val ? new Date(val).toLocaleDateString("en-IN") : "-"

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "-"
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function getPaymentStatusBadge(status: string) {
  const s = (status ?? "unpaid").toLowerCase()
  if (s === "unpaid") return <Badge className="bg-red-100 text-red-700 border-0">Unpaid</Badge>
  if (s === "partial") return <Badge className="bg-yellow-100 text-yellow-700 border-0">Partial</Badge>
  if (s === "paid") return <Badge className="bg-green-100 text-green-700 border-0">Paid</Badge>
  return <Badge className="bg-slate-100 text-slate-700 border-0">{status}</Badge>
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [24, 95, 165]
}

function toWords(n: number): string {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  if (n === 0) return "Zero"
  if (n < 20) return a[n]
  if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "")
  if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + toWords(n % 100) : "")
  if (n < 100000) return toWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + toWords(n % 1000) : "")
  if (n < 10000000) return toWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + toWords(n % 100000) : "")
  return toWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + toWords(n % 10000000) : "")
}

export default function ViewInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editInvoiceNo, setEditInvoiceNo] = useState("")
  const [editOrderNo, setEditOrderNo] = useState("")
  const [editOrderDate, setEditOrderDate] = useState("")
  const [editInvoiceDate, setEditInvoiceDate] = useState("")
  const [editDueDate, setEditDueDate] = useState("")
  const [editPaymentTerms, setEditPaymentTerms] = useState("")
  const [includeStamp, setIncludeStamp] = useState<boolean>(false)
  const [editNotes, setEditNotes] = useState("")
  const [editClientGstin, setEditClientGstin] = useState("")
  const [quotationData, setQuotationData] = useState<{ quote_no: string } | null>(null)
  const id = params.id as string

  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [subscriptionAlertOpen, setSubscriptionAlertOpen] = useState(false)

  const { status, planName, isLoading: limitsLoading } = usePlanLimits(currentOrgId)

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
          } else if (data?.org_id) {
            setCurrentOrgId(data.org_id)
          }
        })
    }
  }, [user?.id])

  useEffect(() => {
    const saved = localStorage.getItem(`stamp_toggle_inv_${id}`)
    if (saved === 'true') setIncludeStamp(true)
  }, [id])

  const handleStampToggle = () => {
    const newVal = !includeStamp
    setIncludeStamp(newVal)
    localStorage.setItem(`stamp_toggle_inv_${id}`, String(newVal))
  }

  useEffect(() => {
    if (user?.id && id && currentOrgId) {
      loadData()
    }
  }, [id, user?.id, currentOrgId])

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: iData, error: iErr } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("org_id", currentOrgId)
        .single()

      if (iErr) throw iErr

      const { data: pData } = await supabase
        .from("company_profile")
        .select("*")
        .eq("org_id", currentOrgId)
        .single()

      const invoiceData = iData as Invoice
      setInvoice(invoiceData)
      if (pData) setProfile(pData as CompanyProfile)

      if (invoiceData.quotation_id) {
        const { data: quotData } = await supabase
          .from("quotations")
          .select("quote_no")
          .eq("id", invoiceData.quotation_id)
          .single()
        if (quotData) setQuotationData(quotData)
      }
    } catch (err) {
      console.error(err)
      toast.error("Failed to load invoice")
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePaymentStatus = async (newStatus: string) => {
    if (!invoice || !currentOrgId) return
    setUpdating(true)
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ payment_status: newStatus })
        .eq("id", invoice.id)
        .eq("org_id", currentOrgId)
      if (error) throw error
      setInvoice({ ...invoice, payment_status: newStatus as Invoice["payment_status"] })
      toast.success(`Payment status updated to ${newStatus}`)
    } catch (err) {
      console.error(err)
      toast.error("Failed to update payment status")
    } finally {
      setUpdating(false)
    }
  }

  const handleEditClick = () => {
    if (limitsLoading) {
      toast.error("Checking your plan status, please try again in a moment...")
      return
    }
    if (status === 'expired' || status === 'cancelled') {
      setSubscriptionAlertOpen(true)
      return
    }
    router.push(`/invoices/${id}/edit`)
  }

  const handleOpenEditModal = () => {
    if (!invoice) return
    setEditInvoiceNo(invoice.invoice_no || "")
    setEditOrderNo(invoice.order_no || "")
    setEditOrderDate(invoice.order_date || "")
    setEditInvoiceDate(invoice.invoice_date || "")
    setEditDueDate(invoice.due_date || "")
    setEditPaymentTerms(invoice.payment_terms || "")
    setEditNotes(invoice.notes || "")
    setEditClientGstin(invoice.client_gstin || "")
    setShowEditModal(true)
  }

  const handleSaveChanges = async () => {
    if (!invoice || !user?.id || !currentOrgId) return
    setEditLoading(true)
    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          invoice_no: editInvoiceNo,
          order_no: editOrderNo || null,
          order_date: editOrderDate || null,
          invoice_date: editInvoiceDate,
          due_date: editDueDate,
          payment_terms: editPaymentTerms,
          notes: editNotes,
          client_gstin: editClientGstin || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("org_id", currentOrgId)
      
      if (error) throw error
      toast.success("Invoice updated successfully")
      setShowEditModal(false)
      loadData()
    } catch (err) {
      console.error(err)
      toast.error("Failed to update invoice")
    } finally {
      setEditLoading(false)
    }
  }

  const getMappedItems = () => {
    return (invoice?.items ?? []).map((item: any, index: number) => ({
      sr: index + 1,
      description: item.particulars ?? item.description ?? item.name ?? "-",
      qty: item.qty ?? item.quantity ?? 1,
      rate: Number(item.rate ?? item.unit_price ?? 0),
      amount: Number(item.amount ?? ((item.qty ?? item.quantity ?? 0) * (item.rate ?? item.unit_price ?? 0)) ?? 0),
    }))
  }

  const getTotals = () => {
    if (!invoice) return { subtotal: 0, discountAmount: 0, discountType: null, discountValue: 0, sgst: 0, cgst: 0, grandTotal: 0 }
    const subtotal = invoice.subtotal || 0
    const discountAmount = invoice.discount_amount || 0
    const sgst = invoice.sgst || 0
    const cgst = invoice.cgst || 0
    const grandTotal = invoice.grand_total || 0
    return { subtotal, discountAmount, discountType: invoice.discount_type, discountValue: invoice.discount_value || 0, sgst, cgst, grandTotal }
  }

  const handleWhatsApp = () => {
    if (!invoice) return
    const { subtotal, discountAmount, discountType, discountValue, sgst, cgst, grandTotal } = getTotals()
    const items = invoice.items ?? []
    const includeGst = invoice.include_gst ?? true
    let msg =
      `*Invoice - ${safeStr(profile?.company_name)}\n` +
      `Invoice No: ${safeStr(invoice.invoice_no)}\n` +
      `Date: ${safeDate(invoice.invoice_date)}\n` +
      `Due Date: ${safeDate(invoice.due_date)}\n\n` +
      `*Customer:* ${safeStr(invoice.client_name)}\n\n` +
      `─────────────────────\n` +
      `*Services:*\n` +
      items.map((i: any) =>
        `• ${i.particulars ?? i.description ?? i.name ?? "-"} - Rs.${Number(i.amount ?? 0).toLocaleString("en-IN")}`
      ).join("\n") + "\n" +
      `─────────────────────\n` +
      `*Subtotal:* Rs.${subtotal.toLocaleString("en-IN")}\n`
    if (discountAmount > 0) {
      const discountVal = Number(discountValue).toString()
      const label = discountType === "percentage" ? `${discountVal}%` : `₹${discountVal}`
      msg += `*Discount (${label}):* -Rs.${discountAmount.toLocaleString("en-IN")}\n`
    }
    if (includeGst) {
      msg += `*SGST (9%):* Rs.${sgst.toLocaleString("en-IN")}\n*CGST (9%):* Rs.${cgst.toLocaleString("en-IN")}\n`
    }
    msg += `*Total:* Rs.${grandTotal.toLocaleString("en-IN")}\n` +
      `─────────────────────\n\n` +
      `To confirm please reply or call ${safeStr(profile?.company_phone)}\n\n` +
      `_Powered by Remindi_`
    window.open("https://wa.me/?text=" + encodeURIComponent(msg))
  }

  // =============================================
  // PDF GENERATION – discount label fixed
  // =============================================
  const handleDownloadPdf = async (stampToggle: boolean = false) => {
    if (!invoice) return

    if (stampToggle && (!profile?.stamp_url && !profile?.signature_url)) {
      toast.error('Please upload your stamp/signature in Settings first')
      router.push('/settings')
      return
    }

    setGeneratingPdf(true)
    try {
      const pageW = 210
      const margin = 15
      const themeColor = profile?.theme_color ?? "#185FA5"
      const [tr, tg, tb] = hexToRgb(themeColor)

      // ===== PRE-FETCH IMAGES =====
      const headerStyle = profile?.header_style ?? "single_logo"
      let bannerBase64: string | null = null
      let bannerH = 0
      if (headerStyle === "thumbnail" && profile?.header_thumbnail_url) {
        try {
          const response = await fetch(profile.header_thumbnail_url)
          const blob = await response.blob()
          bannerBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
          const bannerW = pageW - (margin * 2)
          bannerH = Math.round(bannerW / (1462 / 396))
        } catch (e) { /* skip banner silently */ }
      }

      let logoBase64: string | null = null
      if (headerStyle !== "thumbnail" && profile?.logo_url) {
        try {
          const response = await fetch(profile.logo_url)
          const blob = await response.blob()
          logoBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        } catch (e) { /* skip logo silently */ }
      }

      let stampBase64: string | null = null
      let stampFormat: "JPEG" | "PNG" = "PNG"
      if (stampToggle && profile?.stamp_url) {
        const stampPublicUrl = profile.stamp_url.startsWith('http')
          ? profile.stamp_url
          : supabase.storage.from('company-assets').getPublicUrl(profile.stamp_url).data.publicUrl

        const MAX_STAMP_ATTEMPTS = 3
        for (let attempt = 1; attempt <= MAX_STAMP_ATTEMPTS; attempt++) {
          try {
            const stampResponse = await fetch(stampPublicUrl, { cache: 'no-store' })
            if (!stampResponse.ok) throw new Error('Failed to fetch stamp image')
            const stampBlob = await stampResponse.blob()
            stampBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(stampBlob)
            })
            stampFormat = stampBlob.type.includes('jpeg') ? 'JPEG' : 'PNG'
            break
          } catch (e) {
            console.error(`Error loading stamp for PDF (attempt ${attempt}):`, e)
            if (attempt < MAX_STAMP_ATTEMPTS) {
              await new Promise(res => setTimeout(res, 400 * attempt))
            }
          }
        }
      }

      const items = invoice.items ?? []
      const { subtotal, discountAmount, discountType, discountValue, sgst, cgst, grandTotal } = getTotals()

      // ===== SINGLE RENDER FUNCTION =====
      const renderInvoice = (doc: jsPDF, pageH: number): number => {
        let y = margin

        // HEADER
        if (headerStyle === "thumbnail" && bannerBase64) {
          const bannerW = pageW - (margin * 2)
          doc.addImage(bannerBase64, "PNG", margin, y, bannerW, bannerH)
          y += bannerH +6
        } else if (headerStyle === "single_logo") {
          y = renderSingleLogoHeader(doc, profile, y, logoBase64, pageW, margin, [tr, tg, tb])
        } else {
          // Legacy header
          let logoX = margin
          let logoAdded = false
          if (logoBase64) {
            doc.addImage(logoBase64, "PNG", logoX, y, 22, 22)
            logoAdded = true
          }

          const infoX = logoAdded ? logoX + 24 : logoX
          doc.setFontSize(14)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 0, 0)
          doc.text(safeStr(profile?.company_name), infoX, y + 2)

          doc.setFontSize(9)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(120, 120, 120)
          let infoY = y + 8

          if (profile?.tagline) { doc.text(safeStr(profile.tagline), infoX, infoY); infoY += 4 }
          if (profile?.address) { doc.text(safeStr(profile.address), infoX, infoY); infoY += 4 }
          if (profile?.city || profile?.state || profile?.zip_code) {
            const locationStr = [profile.city, profile.state, profile.zip_code].filter(Boolean).join(", ")
            doc.text(locationStr, infoX, infoY); infoY += 4
          }
          if (profile?.phone) { doc.text(`Phone: ${safeStr(profile.phone)}`, infoX, infoY); infoY += 4 }
          if (profile?.email) { doc.text(`Email: ${safeStr(profile.email)}`, infoX, infoY); infoY += 4 }
          if (profile?.gstin) { doc.text(`GSTIN: ${safeStr(profile.gstin)}`, infoX, infoY) }

          y += 31

          doc.setDrawColor(tr, tg, tb)
          doc.setLineWidth(0.5)
          doc.line(margin, y, pageW - margin, y)
          y += 6
        }

        doc.setFontSize(16)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(tr, tg, tb)
        doc.text('TAX INVOICE', pageW - margin, y, { align: 'right' })

        y += 6
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 0, 0)
        doc.text(safeStr(invoice.invoice_no ?? ("INV-" + invoice.id)), margin, y)
        const formattedDate = invoice.invoice_date
          ? new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        doc.text('DATE: ' + formattedDate, pageW - margin, y, { align: 'right' })

        y += 5
        doc.setFontSize(9)
        doc.setTextColor(220, 38, 38)
        doc.text('Valid Till:' + safeDate(invoice.due_date), pageW - margin, y, { align: 'right' })

        y += 5
        doc.setFontSize(9)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(0, 0, 0)
        if (invoice.order_no) {
          doc.text('Order No: ' + safeStr(invoice.order_no), pageW - margin, y, { align: 'right' })
          y += 5
        }
        if (invoice.order_date) {
          const orderDateFormatted = new Date(invoice.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
          doc.text('Order Date: ' + orderDateFormatted, pageW - margin, y, { align: 'right' })
        }
        doc.setTextColor(0, 0, 0)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(150, 150, 150)
        doc.text("BILL TO:", margin, y)
        y += 5

        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 0, 0)
        doc.text(safeStr(invoice.client_name).toUpperCase(), margin, y)
        y += 5

        doc.setFont("helvetica", "normal")
        doc.setTextColor(40, 40, 40)
        if (invoice.client_address) {
          doc.text(safeStr(invoice.client_address), margin, y)
          y += 5
        }

        const cityStateZip = [
          invoice.client_district,
          invoice.client_state,
          invoice.client_pin_code
        ].filter(Boolean).join(', ')
        if (cityStateZip) {
          doc.text(cityStateZip, margin, y)
          y += 5
        }

        if (invoice.client_gstin) {
          doc.text(`GSTIN: ${invoice.client_gstin}`, margin, y)
          y += 5
        }

        y += 3

        // ITEMS TABLE
        const tableBody = items.map((item, idx) => [
          String(idx + 1),
          safeStr(item.particulars ?? item.description ?? item.name ?? "-"),
          String(item.qty ?? item.quantity ?? 1),
          `Rs. ${Number(item.rate ?? item.unit_price ?? 0).toLocaleString("en-IN")}`,
          `Rs. ${Number(item.amount ?? ((Number(item.qty ?? item.quantity ?? 0)) * (Number(item.rate ?? item.unit_price ?? 0)))).toLocaleString("en-IN")}`,
        ])

        autoTable(doc, {
          startY: y,
          head: [["SR.NO", "PARTICULARS", "QTY.", "RATE", "AMOUNT"]],
          body: tableBody,
          theme: "grid",
          headStyles: {
            fillColor: [tr, tg, tb],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
            halign: "center",
          },
          bodyStyles: {
            fontSize: 9,
            textColor: [0, 0, 0],
          },
          columnStyles: {
            0: { cellWidth: 15, halign: "center" },
            1: { cellWidth: "auto" },
            2: { cellWidth: 20, halign: "center" },
            3: { cellWidth: 35, halign: "right" },
            4: { cellWidth: 35, halign: "right" },
          },
          margin: { left: margin, right: margin },
          pageBreak: "avoid",
          rowPageBreak: "avoid",
        })

        y = (doc as any).lastAutoTable.finalY + 8

        // ---- TOTALS ----
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)

        doc.text('Subtotal:', 160, y, { align: 'right' })
        doc.text('Rs. ' + subtotal.toLocaleString('en-IN'), 195, y, { align: 'right' })
        y += 4

        // Discount line – uses "Rs." like the other totals lines above/below it.
        // (The ₹ glyph isn't in jsPDF's standard helvetica font encoding, which
        // was breaking the whole line's letter-spacing in the rendered PDF.)
        if (discountAmount > 0) {
          const discountVal = Number(discountValue).toString() // ensures integer without decimals
          const discountLabel = discountType === "percentage" ? `${discountVal}%` : `Rs. ${discountVal}`
          doc.text(`Discount (${discountLabel}):`, 160, y, { align: 'right' })
          doc.setTextColor(200, 0, 0)
          doc.text('- Rs. ' + discountAmount.toLocaleString('en-IN'), 195, y, { align: 'right' })
          doc.setTextColor(0, 0, 0)
          y += 4
        }

        if (invoice.include_gst) {
          doc.text('SGST (9%):', 160, y, { align: 'right' })
          doc.text('Rs. ' + sgst.toLocaleString('en-IN'), 195, y, { align: 'right' })
          y += 4
          doc.text('CGST (9%):', 160, y, { align: 'right' })
          doc.text('Rs. ' + cgst.toLocaleString('en-IN'), 195, y, { align: 'right' })
          y += 3
          doc.setDrawColor(0, 0, 0)
          doc.setLineWidth(0.3)
          doc.line(140, y, 195, y)
          y += 4
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          doc.text('Total:', 160, y, { align: 'right' })
          doc.text('Rs. ' + grandTotal.toLocaleString('en-IN'), 195, y, { align: 'right' })
        } else {
          y += 3
          doc.setDrawColor(0, 0, 0)
          doc.setLineWidth(0.3)
          doc.line(140, y, 195, y)
          y += 4
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          doc.text('Total:', 160, y, { align: 'right' })
          doc.text('Rs. ' + grandTotal.toLocaleString('en-IN'), 195, y, { align: 'right' })
        }

        y += 2
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)
        const inWordsAmount = grandTotal
        doc.text(('RUPEES ' + toWords(Math.round(inWordsAmount)) + ' ONLY').toUpperCase(), margin, y)
        y += 20

        // PAYMENT DETAILS
        y += 10
        doc.setFontSize(9)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 0, 0)
        doc.text("Payment Details:", margin, y)
        y += 5
        doc.setFont("helvetica", "normal")
        doc.setTextColor(40, 40, 40)

        if (profile?.bank_name) {
          doc.text(`Bank: ${safeStr(profile.bank_name)}`, margin, y)
          y += 4
        }
        if (profile?.account_no) {
          doc.text(`Account No: ${safeStr(profile.account_no)}`, margin, y)
          y += 4
        }
        if (profile?.ifsc_code) {
          doc.text(`IFSC: ${safeStr(profile.ifsc_code)}`, margin, y)
          y += 4
        }
        if (profile?.upi_id) {
          doc.text(`UPI: ${safeStr(profile.upi_id)}`, margin, y)
          y += 4
        }
        if (invoice.payment_terms) {
          doc.text(`Payment Terms: ${safeStr(invoice.payment_terms)}`, margin, y)
          y += 4
        }

        // TAX INFORMATION
        if (invoice.include_gst) {
          y += 6
          doc.setFontSize(9)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 0, 0)
          doc.text("Tax Information:", margin, y)
          y += 5
          doc.setFont("helvetica", "normal")
          doc.setTextColor(40, 40, 40)

          if (profile?.gstin) {
            doc.text(`GSTIN: ${safeStr(profile.gstin)}`, margin, y)
            y += 4
          }
          if (profile?.pan_number) {
            doc.text(`PAN: ${safeStr(profile.pan_number)}`, margin, y)
            y += 4
          }

          doc.text("GST @ 18% will be charged as per applicable rules.", margin, y)
          y += 4
          y += 6
        }

        // NOTES
        if (invoice.notes) {
          y += 3
          doc.setFontSize(9)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 0, 0)
          doc.text("Terms & Conditions:", margin, y)
          y += 4
          doc.setFont("helvetica", "normal")
          doc.setTextColor(80, 80, 80)
          const noteLines = doc.splitTextToSize(safeStr(invoice.notes), pageW - 2 * margin)
          doc.text(noteLines, margin, y)
          y += (noteLines.length * 4)
        }

        // FOOTER
        y += 10
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)
        doc.text('Thanking you,', 195, y, { align: 'right' })
        doc.text('Yours faithfully,', 195, y + 6, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text('For ' + safeStr(profile?.company_name), 195, y + 12, { align: 'right' })

        let contentBottom = y + 12

        // STAMP
        if (stampToggle && stampBase64) {
          let stampY = y + 18
          const stampW = 30
          const stampH = 30
          const stampX = pageW - margin - stampW
          doc.addImage(stampBase64, stampFormat, stampX, stampY, stampW, stampH)
          stampY += stampH + 2

          doc.setDrawColor(200, 200, 200)
          doc.setLineWidth(0.5)
          doc.line(pageW - margin - 40, stampY, pageW - margin, stampY)
          stampY += 4

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(120, 120, 120)
          doc.text('Authorized Signatory', pageW - margin, stampY, { align: 'right' })

          contentBottom = Math.max(contentBottom, stampY)
        }

        // BOTTOM LINE
        const footerY = contentBottom + 12
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.setFont("helvetica", "normal")
        doc.text("Generated by Remindi · remindi.online", pageW / 2, footerY, { align: "center" })

        return footerY + 8
      }

      // PASS 1: measure
      const scratchDoc = new jsPDF({ orientation: "portrait", unit: "mm", format: [pageW, 2000] })
      const measuredHeight = renderInvoice(scratchDoc, 2000)

      // PASS 2: final
      const finalPageHeight = Math.max(measuredHeight, 100)
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [pageW, finalPageHeight] })
      renderInvoice(doc, finalPageHeight)

      const filename = `Invoice-${safeStr(invoice.invoice_no ?? invoice.id)}-${safeStr(invoice.client_name ?? "Client")}.pdf`
      doc.save(filename)
      toast.success("PDF downloaded")
    } catch (err) {
      console.error("PDF error:", err)
      toast.error("PDF failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setGeneratingPdf(false)
    }
  }

  // ========== RENDER ==========
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  if (!invoice) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <p className="text-muted-foreground">Invoice not found</p>
          <Link href="/invoices">
            <Button>Back to Invoices</Button>
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const mappedItems = getMappedItems()
  const { subtotal, discountAmount, discountType, discountValue, sgst, cgst, grandTotal } = getTotals()
  const includeGst = invoice.include_gst ?? true

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 max-w-4xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/invoices">
              <Button variant="outline" size="icon" className="shrink-0 mt-1">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {invoice.invoice_no ?? ("INV-" + invoice.id)}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatDate(invoice.invoice_date)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {getPaymentStatusBadge(invoice.payment_status)}

            {profile?.stamp_url || profile?.signature_url ? (
              <Button
                onClick={handleStampToggle}
                disabled={generatingPdf}
                variant="outline"
                size="sm"
                className={includeStamp ? 'border-green-600 bg-green-50 text-green-700 hover:bg-green-100' : ''}
              >
                {includeStamp ? (
                  <CheckCircle2 className="mr-1.5 size-4" />
                ) : (
                  <CheckCircle2 className="mr-1.5 size-4 opacity-40" />
                )}
                Stamp: {includeStamp ? 'ON' : 'OFF'}
              </Button>
            ) : null}
            <Button
              onClick={() => handleDownloadPdf(includeStamp)}
              disabled={generatingPdf}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {generatingPdf ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 size-4" />
              )}
              Download PDF
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={updating}>
                  {updating ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <ChevronDown className="mr-1.5 size-4" />
                  )}
                  Payment Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleUpdatePaymentStatus("Unpaid")}>
                  <span className="size-2 rounded-full bg-red-500 mr-2 inline-block" />
                  Unpaid
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleUpdatePaymentStatus("Partial")}>
                  <span className="size-2 rounded-full bg-yellow-500 mr-2 inline-block" />
                  Partial
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleUpdatePaymentStatus("Paid")}>
                  <span className="size-2 rounded-full bg-green-500 mr-2 inline-block" />
                  Paid
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditClick}
            >
              <Edit className="mr-1.5 size-4" />
              Edit
            </Button>
          </div>
        </div>

        {/* COMPANY INFO */}
        {profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                {profile.logo_url && (
                  <img
                    src={profile.logo_url}
                    alt="Company logo"
                    className="h-16 w-16 object-contain rounded border"
                  />
                )}
                <div className="space-y-0.5 flex-1">
                  <p className="font-bold text-lg">{profile.company_name ?? "-"}</p>
                  {profile.tagline && (
                    <p className="text-xs text-muted-foreground">{profile.tagline}</p>
                  )}
                  {profile.address && (
                    <p className="text-xs text-muted-foreground">{profile.address}</p>
                  )}
                  {(profile.city || profile.state || profile.zip_code) && (
                    <p className="text-xs text-muted-foreground">
                      {[profile.city, profile.state, profile.zip_code].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {profile.phone && (
                    <p className="text-xs text-muted-foreground">Phone: {profile.phone}</p>
                  )}
                  {profile.email && (
                    <p className="text-xs text-muted-foreground">Email: {profile.email}</p>
                  )}
                  {profile.gstin && (
                    <p className="text-xs text-muted-foreground">GSTIN: {profile.gstin}</p>
                  )}
                </div>
              </div>
              
              {(profile.bank_name || profile.account_no || profile.ifsc_code || profile.upi_id) && (
                <div className="border-t border-border mt-4 pt-4">
                  <p className="font-semibold text-sm mb-2">Bank Details</p>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    {profile.bank_name && <p>Bank: {profile.bank_name}</p>}
                    {profile.account_no && <p>Account No: {profile.account_no}</p>}
                    {profile.ifsc_code && <p>IFSC: {profile.ifsc_code}</p>}
                    {profile.upi_id && <p>UPI: {profile.upi_id}</p>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* CUSTOMER INFORMATION */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billed To</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client Name</p>
              <p className="font-medium">{invoice.client_name ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Invoice Date</p>
              <p className="font-medium">{formatDate(invoice.invoice_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Valid till</p>
              <p className="font-medium">{invoice.due_date ? formatDate(invoice.due_date) : "-"}</p>
            </div>
            {invoice.order_no && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Order No</p>
                <p className="font-medium">{invoice.order_no}</p>
              </div>
            )}
            {invoice.payment_terms && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Payment Terms</p>
                <p className="font-medium text-sm">{invoice.payment_terms}</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client Address</p>
              <p className="font-medium">{invoice.client_address ?? "-"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client GSTIN</p>
              <p className="font-medium">{invoice.client_gstin || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client District</p>
              <p className="font-medium">{invoice.client_district ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client State</p>
              <p className="font-medium">{invoice.client_state ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client Pin Code</p>
              <p className="font-medium">{invoice.client_pin_code ?? "-"}</p>
            </div>
            {invoice.subject && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Subject</p>
                <p className="font-medium">{invoice.subject}</p>
              </div>
            )}
            {invoice.quotation_id && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Linked Quotation</p>
                <Link href={`/quotations/${invoice.quotation_id}`} className="text-blue-600 hover:underline text-sm font-medium">
                  View Quotation
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ITEMS TABLE */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-center py-3 px-4 font-semibold w-12">SR.</th>
                    <th className="text-left py-3 px-4 font-semibold">Description</th>
                    <th className="text-center py-3 px-4 font-semibold w-16">Qty</th>
                    <th className="text-right py-3 px-4 font-semibold w-32">Unit Price</th>
                    <th className="text-right py-3 px-4 font-semibold w-32">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        No items found
                      </td>
                    </tr>
                  ) : (
                    mappedItems.map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <td className="text-center py-3 px-4 text-muted-foreground">{item.sr}</td>
                        <td className="py-3 px-4">{item.description}</td>
                        <td className="text-center py-3 px-4">{item.qty}</td>
                        <td className="text-right py-3 px-4">₹{Number(item.rate).toLocaleString("en-IN")}</td>
                        <td className="text-right py-3 px-4 font-medium">₹{Number(item.amount).toLocaleString("en-IN")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* TOTALS – discount label fixed in UI too */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-end gap-3 max-w-xs ml-auto">
              <div className="flex justify-between w-full text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between w-full text-sm">
                  <span className="text-muted-foreground">
                    Discount {discountType === "percentage" ? `(${Number(discountValue).toString()}%)` : `(₹${Number(discountValue).toString()})`}:
                  </span>
                  <span className="font-medium text-red-600">- ₹{discountAmount.toLocaleString("en-IN")}</span>
                </div>
              )}

              {includeGst ? (
                <>
                  <div className="flex justify-between w-full text-sm">
                    <span className="text-muted-foreground">SGST (9%):</span>
                    <span className="font-medium">₹{sgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between w-full text-sm">
                    <span className="text-muted-foreground">CGST (9%):</span>
                    <span className="font-medium">₹{cgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="border-t border-border pt-2 mt-1 flex justify-between w-full">
                    <span className="text-lg font-bold">Total:</span>
                    <span className="text-lg font-bold text-blue-600">
                      ₹{grandTotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between w-full">
                  <span className="text-lg font-bold">Total:</span>
                  <span className="text-lg font-bold text-blue-600">
                    ₹{grandTotal.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* NOTES */}
        {invoice.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Invoice Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
            {quotationData && (
              <p className="text-xs text-muted-foreground mt-1">From {quotationData.quote_no}</p>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-order-no">Order Number (Optional)</Label>
              <Input
                id="edit-order-no"
                value={editOrderNo}
                onChange={(e) => setEditOrderNo(e.target.value)}
                placeholder="e.g. PO-2026-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-order-date">Order Date (Optional)</Label>
              <Input
                id="edit-order-date"
                type="date"
                value={editOrderDate}
                onChange={(e) => setEditOrderDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-invoice-no">Invoice Number</Label>
              <Input
                id="edit-invoice-no"
                value={editInvoiceNo}
                onChange={(e) => setEditInvoiceNo(e.target.value)}
                placeholder="INV-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-invoice-date">Invoice Date</Label>
              <Input
                id="edit-invoice-date"
                type="date"
                value={editInvoiceDate}
                onChange={(e) => setEditInvoiceDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-due-date">Valid till</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-payment-terms">Payment Terms</Label>
              <Select value={editPaymentTerms} onValueChange={setEditPaymentTerms}>
                <SelectTrigger id="edit-payment-terms">
                  <SelectValue placeholder="Select payment terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100% advance along with work order">100% advance along with work order</SelectItem>
                  <SelectItem value="50% advance, balance on completion">50% advance, balance on completion</SelectItem>
                  <SelectItem value="Net 7 days">Net 7 days</SelectItem>
                  <SelectItem value="Net 14 days">Net 14 days</SelectItem>
                  <SelectItem value="Net 30 days">Net 30 days</SelectItem>
                  <SelectItem value="On completion">On completion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-client-gstin">Client GSTIN (Optional)</Label>
              <Input
                id="edit-client-gstin"
                value={editClientGstin}
                onChange={(e) => setEditClientGstin(e.target.value)}
                placeholder="GSTIN"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-invoice-notes">Terms & Conditions</Label>
              <Textarea
                id="edit-invoice-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="e.g. Please transfer to bank account..."
                className="min-h-[80px] resize-none"
              />
            </div>

            {invoice && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Client:</span> {invoice.client_name}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Subtotal:</span> ₹{invoice.subtotal.toLocaleString("en-IN")}
                </p>
                {invoice.discount_amount && invoice.discount_amount > 0 && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Discount:</span> -₹{invoice.discount_amount.toLocaleString("en-IN")}
                  </p>
                )}
                {invoice.include_gst && (
                  <>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">SGST 9%:</span> ₹{invoice.sgst.toLocaleString("en-IN")}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">CGST 9%:</span> ₹{invoice.cgst.toLocaleString("en-IN")}
                    </p>
                  </>
                )}
                <p className="text-foreground font-semibold border-t border-border pt-2">
                  Total: ₹{invoice.grand_total.toLocaleString("en-IN")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveChanges}
              disabled={editLoading || !editInvoiceNo}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Subscription Alert Modal */}
      <Dialog open={subscriptionAlertOpen} onOpenChange={setSubscriptionAlertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscription Alert</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your {planName || 'current'} plan has expired. Renew your plan to edit this invoice.
          </p>
          <DialogFooter>
            <Button onClick={() => setSubscriptionAlertOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
