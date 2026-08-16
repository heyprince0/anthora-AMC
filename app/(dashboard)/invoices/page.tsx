"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation" // 👈 added
import { DashboardLayout } from "@/components/dashboard-layout"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase, type Invoice } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import LimitReachedModal from "@/components/billing/limit-reached-modal"
import { Plus, Search, Eye, Trash2, Settings, Bell } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

function getPaymentStatusBadge(status: string) {
  const statusLower = (status || "").toLowerCase()
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    unpaid: { bg: "bg-red-100", text: "text-red-700", label: "Unpaid" },
    partial: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Partial" },
    paid: { bg: "bg-green-100", text: "text-green-700", label: "Paid" },
  }
  const config = statusConfig[statusLower] || statusConfig.unpaid
  return <Badge className={`${config.bg} ${config.text} border-0`}>{config.label}</Badge>
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const router = useRouter() // 👈 added
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [profileSetupDialogOpen, setProfileSetupDialogOpen] = useState(false)
  const [checkingProfile, setCheckingProfile] = useState(false)
  const [subscriptionAlertOpen, setSubscriptionAlertOpen] = useState(false)
  const [subscriptionAlertInvoice, setSubscriptionAlertInvoice] = useState<Invoice | null>(null)

  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  const { maxInvoicesMonthly, currentInvoicesThisMonth, status, planName, isLoading: limitsLoading } = usePlanLimits(currentOrgId)

  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalType, setLimitModalType] = useState<'expired' | 'resource-limit'>('expired')
  const [limitModalCustom, setLimitModalCustom] = useState<{ title?: string; description?: string }>({})

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
      loadInvoices()
    }
  }, [currentOrgId])

  const handleFilter = () => {
    let filtered = invoices
    if (searchTerm) {
      filtered = filtered.filter(inv =>
        (inv.client_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.invoice_no || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    if (filterStatus !== "all") {
      filtered = filtered.filter(inv => (inv.payment_status || "").toLowerCase() === filterStatus.toLowerCase())
    }
    setFilteredInvoices(filtered)
  }

  useEffect(() => {
    handleFilter()
  }, [searchTerm, filterStatus, invoices])

  const loadInvoices = async () => {
    try {
      if (!currentOrgId) return
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("org_id", currentOrgId)
        .order("created_at", { ascending: false })
      if (error) throw error
      setInvoices((data as Invoice[]) || [])
      setFilteredInvoices((data as Invoice[]) || [])
    } catch (error) {
      console.error("Error loading invoices:", error)
      toast.error("Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete || !currentOrgId) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceToDelete.id)
        .eq("org_id", currentOrgId)
      if (error) throw error
      setInvoices(invoices.filter(inv => inv.id !== invoiceToDelete.id))
      setFilteredInvoices(filteredInvoices.filter(inv => inv.id !== invoiceToDelete.id))
      toast.success("Invoice deleted successfully")
      setDeleteDialogOpen(false)
      setInvoiceToDelete(null)
    } catch (error) {
      console.error("Error deleting invoice:", error)
      toast.error("Failed to delete invoice")
    } finally {
      setDeleting(false)
    }
  }

  const checkAndShowLimitModal = () => {
    if (status === 'expired' || status === 'cancelled') {
      setLimitModalType('expired')
      setLimitModalCustom({
        title: `Your ${planName || 'current'} plan has expired`,
        description: `Renew your ${planName || 'current'} plan to continue creating invoices.`,
      })
      setShowLimitModal(true)
      return true
    }
    if (maxInvoicesMonthly > 0 && currentInvoicesThisMonth >= maxInvoicesMonthly) {
      setLimitModalType('resource-limit')
      setLimitModalCustom({
        title: "You've reached your monthly invoice limit",
        description: `Your current plan allows a maximum of ${maxInvoicesMonthly} invoices per month. You have already created ${currentInvoicesThisMonth} this month. Upgrade to increase your limit.`,
      })
      setShowLimitModal(true)
      return true
    }
    return false
  }

  // ✅ Navigate to the dedicated new invoice page
  const handleNewInvoiceClick = async () => {
    if (!user?.id || !currentOrgId) return

    // ✅ Don't let the click through until we actually know the plan status.
    // Without this, a fast click right after page load could sneak past the
    // expired/limit check because `status` hasn't been fetched yet.
    if (limitsLoading) {
      toast.error("Checking your plan status, please try again in a moment...")
      return
    }

    // ✅ Check limits before anything else
    if (checkAndShowLimitModal()) return

    // Then check company profile
    setCheckingProfile(true)
    try {
      const { data, error } = await supabase
        .from("company_profile")
        .select("company_name, address, phone")
        .eq("org_id", currentOrgId)
        .maybeSingle()

      if (error && error.code !== "PGRST116") throw error

      const isComplete = !!(
        data?.company_name?.trim() &&
        data?.address?.trim() &&
        data?.phone?.trim()
      )

      if (isComplete) {
        router.push("/invoices/new")
      } else {
        setProfileSetupDialogOpen(true)
      }
    } catch (error) {
      console.error("Error checking company profile:", error)
      // Fail open — don't block invoice creation if the check itself fails
      router.push("/invoices/new")
    } finally {
      setCheckingProfile(false)
    }
  }

  const handleUpgrade = () => {
    window.location.href = '/billing'
  }

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <p className="text-muted-foreground">Manage and track your invoices</p>
          </div>
          <Button
            onClick={handleNewInvoiceClick}
            disabled={checkingProfile || limitsLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-2 size-4" />
            New Invoice
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by client name or invoice number..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Invoices</CardTitle>
            <CardDescription>
              You have {filteredInvoices.length} invoices {filterStatus !== "all" ? "matching filters" : "in total"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading invoices...</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  {invoices.length === 0 
                    ? "No invoices yet. Accept a quotation and convert it to generate your first invoice."
                    : "No invoices matching your filters"}
                </p>
                {invoices.length === 0 && (
                  <Link href="/quotations">
                    <Button>Go to Quotations</Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Valid Till</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoice_no}</TableCell>
                        <TableCell>{invoice.client_name}</TableCell>
                        <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                        <TableCell>{formatDate(invoice.due_date)}</TableCell>
                        <TableCell>{formatCurrency(invoice.grand_total)}</TableCell>
                        <TableCell>{getPaymentStatusBadge(invoice.payment_status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link href={`/invoices/${invoice.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="size-4" />
                                <span className="sr-only">View</span>
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSubscriptionAlertInvoice(invoice)
                                setSubscriptionAlertOpen(true)
                              }}
                            >
                              <Bell className="size-4 text-yellow-600" />
                              <span className="sr-only">Subscription Alert</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setInvoiceToDelete(invoice)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="size-4 text-red-600" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {invoiceToDelete?.invoice_no}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteInvoice}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Limit Modal */}
        <LimitReachedModal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          type={limitModalType}
          onUpgrade={handleUpgrade}
          customTitle={limitModalCustom.title}
          customDescription={limitModalCustom.description}
        />
      </div>

      <Dialog open={profileSetupDialogOpen} onOpenChange={setProfileSetupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Your Company Profile</DialogTitle>
            <DialogDescription>
              Before creating an invoice, please add your company name, address, and contact
              details in Settings. This information appears on your invoice PDF header.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileSetupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => router.push("/settings")}>
              <Settings className="mr-2 size-4" />
              Go to Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={subscriptionAlertOpen} onOpenChange={setSubscriptionAlertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscription Alert</DialogTitle>
            <DialogDescription>
              {status === 'expired' || status === 'cancelled'
                ? `Your ${planName || 'current'} plan has expired. Renew your plan to keep creating and managing invoices without interruption.`
                : `Your ${planName || 'current'} plan is active. Keep an eye on your plan status so your invoicing stays uninterrupted.`}
            </DialogDescription>
          </DialogHeader>
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
