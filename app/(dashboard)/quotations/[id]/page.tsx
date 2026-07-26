"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase, type Quotation, type CompanyProfile } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import {
  ArrowLeft,
  Download,
  MessageCircle,
  Edit,
  Loader2,
  FileText,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
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

export default function ViewQuotationPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [includeStamp, setIncludeStamp] = useState<boolean>(false)
  const [convertLoading, setConvertLoading] = useState(false)
  const [invoiceNo, setInvoiceNo] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 14)
    return date.toISOString().split('T')[0]
  })
  const [selectedPaymentTerms, setSelectedPaymentTerms] = useState("")
  const [invoiceNotes, setInvoiceNotes] = useState("")
  const [orderNo, setOrderNo] = useState("")
  const [orderDate, setOrderDate] = useState("")
  const id = params.id as string

  // Organization ID state
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  // Fetch org_id
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

  // Load stamp toggle from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`stamp_toggle_q_${id}`)
    if (saved === "true") setIncludeStamp(true)
  }, [id])

  const handleStampToggle = () => {
    const newVal = !includeStamp
    setIncludeStamp(newVal)
    localStorage.setItem(`stamp_toggle_q_${id}`, String(newVal))
  }

  // Load data when org ID is available
  useEffect(() => {
    if (user?.id && id && currentOrgId) {
      loadData()
    }
  }, [id, user?.id, currentOrgId])

  useEffect(() => {
    if (profile?.payment_terms) {
      setSelectedPaymentTerms(profile.payment_terms)
    }
  }, [profile?.payment_terms])

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: qData, error: qErr } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", id)
        .eq("org_id", currentOrgId)
        .single()

      if (qErr) throw qErr

      const { data: pData } = await supabase
        .from("company_profile")
        .select("*")
        .eq("org_id", currentOrgId)
        .single()

      setQuotation(qData as Quotation)
      if (pData) setProfile(pData as CompanyProfile)
    } catch (err) {
      console.error(err)
      toast.error("Failed to load quotation")
    } finally {
      setLoading(false)
    }
  }

  const generateNextInvoiceNo = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_no")
        .eq("org_id", currentOrgId)
      if (error) throw error
      if (!data || data.length === 0) return "INV-001"
      const numbers = data
        .map(inv => {
          const match = (inv.invoice_no || "").match(/(\d+)$/)
          return match ? parseInt(match[1]) : 0
        })
        .filter(n => n > 0)
      if (numbers.length === 0) return "INV-001"
      const maxNumber = Math.max(...numbers)
      return `INV-${String(maxNumber + 1).padStart(3, '0')}`
    } catch (err) {
      console.error(err)
      return "INV-001"
    }
  }

  const handleOpenConvertModal = async () => {
    const nextNo = await generateNextInvoiceNo()
    setInvoiceNo(nextNo)
    setShowConvertModal(true)
  }

  const handleConvertToInvoice = async () => {
    if (!quotation || !user?.id || !currentOrgId) return
    setConvertLoading(true)
    try {
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          org_id: currentOrgId,
          quotation_id: quotation.id,
          invoice_no: invoiceNo,
          order_no: orderNo || null,
          order_date: orderDate || null,
          invoice_date: invoiceDate,
          due_date: dueDate,
          payment_terms: selectedPaymentTerms,
          payment_status: "Unpaid",
          notes: invoiceNotes,
          client_name: quotation.client_name,
          client_address: quotation.client_address,
          client_district: quotation.client_district,
          client_state: quotation.client_state,
          client_pin_code: quotation.client_pin_code,
          subject: quotation.subject,
          body_text: quotation.body_text,
          items: quotation.items,
          subtotal: quotation.subtotal,
          sgst: quotation.sgst,
          cgst: quotation.cgst,
          grand_total: quotation.grand_total,
          include_gst: quotation.include_gst,
        })
        .select()
        .single()

      if (error) throw error

      const { error: updateErr } = await supabase
        .from("quotations")
        .update({ invoice_id: data.id })
        .eq("id", quotation.id)

      if (updateErr) throw updateErr

      setQuotation({ ...quotation, invoice_id: data.id })
      toast.success("Invoice generated successfully")
      setShowConvertModal(false)

      setTimeout(() => {
        router.push(`/invoices/${data.id}`)
      }, 500)
    } catch (err) {
      console.error(err)
      toast.error("Failed to generate invoice: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setConvertLoading(false)
    }
  }

  const getMappedItems = () => {
    return (quotation?.items ?? []).map((item: any, index: number) => ({
      sr: index + 1,
      description: item.particulars ?? item.description ?? item.name ?? "-",
      qty: item.qty ?? item.quantity ?? 1,
      rate: Number(item.rate ?? item.unit_price ?? 0),
      amount: Number(item.amount ?? ((item.qty ?? item.quantity ?? 0) * (item.rate ?? item.unit_price ?? 0)) ?? 0),
    }))
  }

  // ============================================================
  // UPDATED: calculate totals using stored discount fields
  // ============================================================
  const getTotals = () => {
    if (!quotation) return { subtotal: 0, discountAmount: 0, discountType: null, discountValue: 0, discountedSubtotal: 0, sgst: 0, cgst: 0, grandTotal: 0 }
    const subtotal = quotation.subtotal || 0
    const discountAmount = quotation.discount_amount || 0
    const discountedSubtotal = subtotal - discountAmount
    const sgst = quotation.sgst || 0
    const cgst = quotation.cgst || 0
    const grandTotal = quotation.grand_total || 0
    return { subtotal, discountAmount, discountType: quotation.discount_type, discountValue: quotation.discount_value || 0, discountedSubtotal, sgst, cgst, grandTotal }
  }

  const handleWhatsApp = () => {
    if (!quotation) return
    const { subtotal, discountAmount, discountedSubtotal, sgst, cgst, grandTotal } = getTotals()
    const items = quotation.items ?? []
    const includeGst = quotation.include_gst ?? true
    let msg =
      `*Quotation - ${safeStr(profile?.company_name)}*\n` +
      `Quote No: ${safeStr(quotation.quote_no)}\n` +
      `Date: ${safeDate(quotation.created_at)}\n` +
      `Valid till: ${safeDate(quotation.valid_till)}\n\n` +
      `*Customer:* ${safeStr(quotation.client_name)}\n\n` +
      `─────────────────────\n` +
      `*Services:*\n` +
      items.map((i: any) =>
        `• ${i.particulars ?? i.description ?? i.name ?? "-"} - Rs.${Number(i.amount ?? 0).toLocaleString("en-IN")}`
      ).join("\n") + "\n" +
      `─────────────────────\n` +
      `*Subtotal:* Rs.${subtotal.toLocaleString("en-IN")}\n`
    if (discountAmount > 0) {
      const discountLabel = quotation.discount_type === "percentage" ? `${quotation.discount_value}%` : `₹${quotation.discount_value}`
      msg += `*Discount (${discountLabel}):* -Rs.${discountAmount.toLocaleString("en-IN")}\n`
      msg += `*Subtotal after Discount:* Rs.${discountedSubtotal.toLocaleString("en-IN")}\n`
    }
    if (includeGst) {
      msg += `*SGST (9%):* Rs.${sgst.toLocaleString("en-IN")}\n*CGST (9%):* Rs.${cgst.toLocaleString("en-IN")}\n`
    }
    msg += `*Total:* Rs.${grandTotal.toLocaleString("en-IN")}\n` +
      `─────────────────────\n\n` +
      `To confirm reply YES or call ${safeStr(profile?.company_phone)}\n\n` +
      `_Powered by Remindi_`
    window.open("https://wa.me/?text=" + encodeURIComponent(msg))
  }

  // ============================================================
  // PDF GENERATION – with discount rows
  // ============================================================
  const handleDownloadPdf = async (stampToggle: boolean = false) => {
    if (!quotation) return

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

      // ===== PRE-FETCH ALL IMAGES ONCE =====
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

          const naturalSize = await new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
            img.onerror = reject
            img.src = bannerBase64 as string
          })

          const bannerW = pageW - (margin * 2)
          bannerH = Math.round(bannerW / (naturalSize.w / naturalSize.h))
          const maxBannerH = 60
          if (bannerH > maxBannerH) bannerH = maxBannerH
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
        try {
          const { data: publicUrlData } = supabase.storage
            .from('company-assets')
            .getPublicUrl(profile.stamp_url)
          const stampResponse = await fetch(publicUrlData.publicUrl)
          if (!stampResponse.ok) throw new Error(`HTTP ${stampResponse.status}`)
          const stampBlob = await stampResponse.blob()
          stampBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(stampBlob)
          })
          stampFormat = stampBlob.type.includes('jpeg') ? 'JPEG' : 'PNG'
        } catch (e) {
          console.warn('[Stamp] Failed to load stamp image:', e)
          toast.warning('Stamp image could not be loaded – skipping stamp')
        }
      }

      const items = quotation.items ?? []
      const { subtotal, discountAmount, discountType, discountValue, discountedSubtotal, sgst, cgst, grandTotal } = getTotals()

      // ===== SINGLE RENDER FUNCTION =====
      const renderQuotation = (doc: jsPDF): number => {
        let y = margin

        // ===== HEADER =====
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

        // ===== QUOTATION HEADER =====
        doc.setFontSize(16)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(tr, tg, tb)
        doc.text('QUOTATION', pageW - margin, y, { align: 'right' })

        y += 6
        doc.setFontSize(10)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 0, 0)
        doc.text(safeStr(quotation.quote_no ?? ("QT-" + quotation.id)), margin, y)
        const formattedDate = quotation.created_at
          ? new Date(quotation.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        doc.text('DATE: ' + formattedDate, pageW - margin, y, { align: 'right' })

        y += 5
        if (quotation.valid_till) {
          doc.setFontSize(9)
          doc.setTextColor(220, 38, 38)
          doc.text('Valid till: ' + safeDate(quotation.valid_till), pageW - margin, y, { align: 'right' })
          y += 5
        }
        if (quotation.order_no) {
          doc.setFontSize(9)
          doc.setFont("helvetica", "normal")
          doc.setTextColor(0, 0, 0)
          doc.text('Order No: ' + safeStr(quotation.order_no), pageW - margin, y, { align: 'right' })
          y += 5
        }
        if (quotation.order_date) {
          const orderDateFormatted = new Date(quotation.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
          doc.text('Order Date: ' + orderDateFormatted, pageW - margin, y, { align: 'right' })
        }
        doc.setTextColor(0, 0, 0)

        // ===== CLIENT BLOCK =====
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(150, 150, 150)
        doc.text("TO,", margin, y)
        y += 5
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0, 0, 0)
        doc.text(safeStr(quotation.client_name).toUpperCase(), margin, y)
        y += 5
        doc.setFont("helvetica", "normal")
        doc.setTextColor(40, 40, 40)
        if (quotation.client_address) {
          doc.text(safeStr(quotation.client_address), margin, y)
          y += 5
        }
        const cityStateZip = [
          quotation.client_district,
          quotation.client_state,
          quotation.client_pin_code
        ].filter(Boolean).join(', ')
        if (cityStateZip) {
          doc.text(cityStateZip, margin, y)
          y += 5
        }
        y += 3

        // ===== SUBJECT & BODY =====
        if (quotation.subject) {
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 0, 0)
          doc.text('Sub: ' + safeStr(quotation.subject), margin, y)
          y += 5
        }
        if (quotation.body_text) {
          doc.setFont("helvetica", "normal")
          doc.setTextColor(80, 80, 80)
          const bodyLines = doc.splitTextToSize(safeStr(quotation.body_text), pageW - 2 * margin)
          doc.text(bodyLines, margin, y)
          y += (bodyLines.length * 4) + 3
        }

        // ===== ITEMS TABLE =====
        const tableBody = items.map((item: any, idx: number) => [
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

        // ===== TOTALS (with discount) =====
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)

        // Subtotal
        doc.text('Subtotal:', 160, y, { align: 'right' })
        doc.text('Rs. ' + subtotal.toLocaleString('en-IN'), 195, y, { align: 'right' })
        y += 4

        // Discount row (if any)
        if (discountAmount > 0) {
          const discountLabel = discountType === "percentage" ? `${discountValue}%` : `₹${discountValue}`
          doc.text(`Discount (${discountLabel}):`, 160, y, { align: 'right' })
          doc.setTextColor(200, 0, 0)
          doc.text('- Rs. ' + discountAmount.toLocaleString('en-IN'), 195, y, { align: 'right' })
          doc.setTextColor(0, 0, 0)
          y += 4
        }

        // Subtotal after Discount
        doc.text('Subtotal after Discount:', 160, y, { align: 'right' })
        doc.text('Rs. ' + discountedSubtotal.toLocaleString('en-IN'), 195, y, { align: 'right' })
        y += 4

        if (quotation.include_gst) {
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
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          doc.text('Total:', 160, y, { align: 'right' })
          doc.text('Rs. ' + grandTotal.toLocaleString('en-IN'), 195, y, { align: 'right' })
        }

        // ===== IN WORDS =====
        y += 2
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)
        const inWordsAmount = grandTotal
        doc.text(('RUPEES ' + toWords(Math.round(inWordsAmount)) + ' ONLY').toUpperCase(), margin, y)
        y += 20

        // ===== PAYMENT DETAILS =====
        if (profile?.bank_name || profile?.account_no || profile?.ifsc_code || profile?.upi_id || quotation.payment_terms) {
          y += 10
          doc.setFontSize(9)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 0, 0)
          doc.text("Payment Details:", margin, y)
          y += 5
          doc.setFont("helvetica", "normal")
          doc.setTextColor(40, 40, 40)
          if (profile?.bank_name) { doc.text(`Bank: ${safeStr(profile.bank_name)}`, margin, y); y += 4 }
          if (profile?.account_no) { doc.text(`Account No: ${safeStr(profile.account_no)}`, margin, y); y += 4 }
          if (profile?.ifsc_code) { doc.text(`IFSC: ${safeStr(profile.ifsc_code)}`, margin, y); y += 4 }
          if (profile?.upi_id) { doc.text(`UPI: ${safeStr(profile.upi_id)}`, margin, y); y += 4 }
          if (quotation.payment_terms) { doc.text(`Payment Terms: ${safeStr(quotation.payment_terms)}`, margin, y); y += 4 }
        }

        // ===== TAX INFORMATION =====
        if (quotation.include_gst) {
          y += 6
          doc.setFontSize(9)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 0, 0)
          doc.text("Tax Information:", margin, y)
          y += 5
          doc.setFont("helvetica", "normal")
          doc.setTextColor(40, 40, 40)
          if (profile?.gstin) { doc.text(`GSTIN: ${safeStr(profile.gstin)}`, margin, y); y += 4 }
          if (profile?.pan_number) { doc.text(`PAN: ${safeStr(profile.pan_number)}`, margin, y); y += 4 }
          doc.text("GST @ 18% will be charged as per applicable rules.", margin, y)
          y += 4
          y += 6
        }

        // ===== NOTES =====
        if (quotation.notes) {
          y += 3
          doc.setFontSize(9)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(0, 0, 0)
          doc.text("Terms & Conditions:", margin, y)
          y += 4
          doc.setFont("helvetica", "normal")
          doc.setTextColor(80, 80, 80)
          const noteLines = doc.splitTextToSize(safeStr(quotation.notes), pageW - 2 * margin)
          doc.text(noteLines, margin, y)
          y += (noteLines.length * 4)
        }

        // ===== FOOTER (signature block) =====
        y += 10
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)
        doc.text('Thanking you,', 195, y, { align: 'right' })
        doc.text('Yours faithfully,', 195, y + 6, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text('For ' + safeStr(profile?.company_name), 195, y + 12, { align: 'right' })

        let contentBottom = y + 12

        // ===== STAMP =====
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

        // ===== BOTTOM LINE =====
        const footerY = contentBottom + 12
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.setFont("helvetica", "normal")
        doc.text("Generated by Remindi · remindi.online", pageW / 2, footerY, { align: "center" })

        return footerY + 8
      }

      // ===== PASS 1: measure =====
      const scratchDoc = new jsPDF({ orientation: "portrait", unit: "mm", format: [pageW, 2000] })
      const measuredHeight = renderQuotation(scratchDoc)

      // ===== PASS 2: final =====
      const finalPageHeight = Math.max(measuredHeight, 100)
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [pageW, finalPageHeight] })
      renderQuotation(doc)

      const filename = `Quotation-${safeStr(quotation.quote_no ?? quotation.id)}-${safeStr(quotation.client_name ?? "Client")}.pdf`
      doc.save(filename)
      toast.success("PDF downloaded")
    } catch (err) {
      console.error("PDF error:", err)
      toast.error("PDF failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setGeneratingPdf(false)
    }
  }

  // ===== RENDER =====
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  if (!quotation) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <p className="text-muted-foreground">Quotation not found</p>
          <Link href="/quotations">
            <Button>Back to Quotations</Button>
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  // ===== Totals for UI =====
  const { subtotal, discountAmount, discountType, discountValue, discountedSubtotal, sgst, cgst, grandTotal } = getTotals()
  const includeGst = quotation.include_gst ?? true
  const mappedItems = getMappedItems()

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 max-w-4xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/quotations">
              <Button variant="outline" size="icon" className="shrink-0 mt-1">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {quotation.quote_no ?? ("QT-" + quotation.id)}
              </h1>
              {quotation.order_no && (
                <p className="text-sm text-muted-foreground">
                  Order No: <span className="font-medium text-foreground">{quotation.order_no}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatDate(quotation.created_at)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
            {quotation.invoice_id ? (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
                onClick={() => router.push(`/invoices/${quotation.invoice_id}`)}
              >
                <FileText className="mr-1.5 size-4" />
                View Invoice
              </Button>
            ) : (
              <Button
                onClick={handleOpenConvertModal}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <FileText className="mr-2 size-4" />
                Convert to Invoice
              </Button>
            )}
            <Link href={`/quotations/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="mr-1.5 size-4" />
                Edit
              </Button>
            </Link>
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
                <div className="space-y-0.5">
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
            </CardContent>
          </Card>
        )}

        {/* CUSTOMER INFORMATION */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client Name</p>
              <p className="font-medium">{quotation.client_name ?? "-"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Client Address</p>
              <p className="font-medium">{quotation.client_address ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">District</p>
              <p className="font-medium">{quotation.client_district ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">State</p>
              <p className="font-medium">{quotation.client_state ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Pin Code</p>
              <p className="font-medium">{quotation.client_pin_code ?? "-"}</p>
            </div>
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
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground w-12">SR</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Description</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground w-16">Qty</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground w-28">Rate</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">No items</td>
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

        {/* ===== TOTALS (with discount) ===== */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-end gap-3 max-w-xs ml-auto">
              {/* Subtotal */}
              <div className="flex justify-between w-full text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>

              {/* Discount (if any) */}
              {discountAmount > 0 && (
                <div className="flex justify-between w-full text-sm">
                  <span className="text-muted-foreground">
                    Discount ({discountType === "percentage" ? `${discountValue}%` : `₹${discountValue}`}):
                  </span>
                  <span className="font-medium text-red-600">- ₹{discountAmount.toLocaleString("en-IN")}</span>
                </div>
              )}

              {/* Subtotal after Discount */}
              <div className="flex justify-between w-full text-sm border-t border-border/50 pt-1">
                <span className="text-muted-foreground">Subtotal after Discount:</span>
                <span className="font-medium">₹{discountedSubtotal.toLocaleString("en-IN")}</span>
              </div>

              {/* GST */}
              {includeGst && (
                <>
                  <div className="flex justify-between w-full text-sm">
                    <span className="text-muted-foreground">SGST (9%):</span>
                    <span className="font-medium">₹{sgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between w-full text-sm">
                    <span className="text-muted-foreground">CGST (9%):</span>
                    <span className="font-medium">₹{cgst.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}

              {/* Grand Total */}
              <div className="border-t border-border pt-2 mt-1 flex justify-between w-full">
                <span className="text-lg font-bold">Grand Total:</span>
                <span className="text-lg font-bold text-blue-600">
                  ₹{grandTotal.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NOTES */}
        {quotation.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quotation.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Convert to Invoice Modal */}
      <Dialog open={showConvertModal} onOpenChange={setShowConvertModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convert to Invoice</DialogTitle>
            {quotation && (
              <p className="text-xs text-muted-foreground mt-1">From {quotation.quote_no}</p>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="order-no">Order Number (Optional)</Label>
              <Input
                id="order-no"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                placeholder="e.g. PO-2026-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-date">Order Date (Optional)</Label>
              <Input
                id="order-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-no">Invoice Number</Label>
              <Input
                id="invoice-no"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="INV-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-date">Invoice Date</Label>
              <Input
                id="invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-date">Valid till</Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-terms">Payment Terms</Label>
              <Select value={selectedPaymentTerms} onValueChange={setSelectedPaymentTerms}>
                <SelectTrigger id="payment-terms">
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
              <Label htmlFor="invoice-notes">Terms and Conditions</Label>
              <Textarea
                id="invoice-notes"
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="e.g. Please transfer to bank account..."
                className="min-h-[80px] resize-none"
              />
            </div>

            {quotation && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Client:</span> {quotation.client_name}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Subtotal:</span> ₹{quotation.subtotal.toLocaleString("en-IN")}
                </p>
                {quotation.discount_amount && quotation.discount_amount > 0 && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Discount:</span> -₹{quotation.discount_amount.toLocaleString("en-IN")}
                  </p>
                )}
                {quotation.include_gst && (
                  <>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">SGST 9%:</span> ₹{quotation.sgst.toLocaleString("en-IN")}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">CGST 9%:</span> ₹{quotation.cgst.toLocaleString("en-IN")}
                    </p>
                  </>
                )}
                <p className="text-foreground font-semibold border-t border-border pt-2">
                  Grand Total: ₹{quotation.grand_total.toLocaleString("en-IN")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConvertToInvoice}
              disabled={convertLoading || !invoiceNo}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {convertLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Invoice"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
