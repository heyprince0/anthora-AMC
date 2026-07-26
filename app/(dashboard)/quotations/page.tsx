"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
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
import { supabase, type Quotation } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import LimitReachedModal from "@/components/billing/limit-reached-modal"
import { Plus, Search, Eye, Trash2, Edit, Settings } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
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

export default function QuotationsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [filteredQuotations, setFilteredQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [quotationToDelete, setQuotationToDelete] = useState<Quotation | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [profileSetupDialogOpen, setProfileSetupDialogOpen] = useState(false)
  const [checkingProfile, setCheckingProfile] = useState(false)

  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  const { maxQuotationsMonthly, currentQuotationsThisMonth, status, isLoading: limitsLoading } = usePlanLimits(currentOrgId)

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
      loadQuotations()
    }
  }, [currentOrgId])

  // ✅ REMOVED auto-show on page load – modal only from button

  const handleFilter = () => {
    let filtered = quotations
    if (searchTerm) {
      filtered = filtered.filter(q =>
        (q.client_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.quote_no || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.client_gstin || "").includes(searchTerm)
      )
    }
    setFilteredQuotations(filtered)
  }

  useEffect(() => {
    handleFilter()
  }, [searchTerm, quotations])

  const handleDelete = async () => {
    if (!quotationToDelete || !currentOrgId) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from("quotations")
        .delete()
        .eq("id", quotationToDelete.id)
        .eq("org_id", currentOrgId)
      if (error) throw error
      setQuotations(quotations.filter(q => q.id !== quotationToDelete.id))
      toast.success("Quotation deleted successfully")
      setDeleteDialogOpen(false)
      setQuotationToDelete(null)
    } catch (error) {
      console.error("Error deleting quotation:", error)
      toast.error("Failed to delete quotation")
    } finally {
      setDeleting(false)
    }
  }

  const loadQuotations = async () => {
    try {
      if (!currentOrgId) return

      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("org_id", currentOrgId)
        .order("created_at", { ascending: false })

      if (error) throw error

      setQuotations((data as Quotation[]) || [])
      setFilteredQuotations((data as Quotation[]) || [])
    } catch (error) {
      console.error("Error loading quotations:", error)
      toast.error("Failed to load quotations")
    } finally {
      setLoading(false)
    }
  }

  // ✅ Check limits – only called from New Quotation button
  const checkAndShowLimitModal = () => {
    if (status === 'expired' || status === 'cancelled') {
      setLimitModalType('expired')
      setLimitModalCustom({})
      setShowLimitModal(true)
      return true
    }
    if (maxQuotationsMonthly > 0 && currentQuotationsThisMonth >= maxQuotationsMonthly) {
      setLimitModalType('resource-limit')
      setLimitModalCustom({
        title: "You've reached your monthly quotation limit",
        description: `Your current plan allows a maximum of ${maxQuotationsMonthly} quotations per month. You have already created ${currentQuotationsThisMonth} this month. Upgrade to increase your limit.`,
      })
      setShowLimitModal(true)
      return true
    }
    return false
  }

  const handleNewQuotationClick = async () => {
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
        router.push("/quotations/new")
      } else {
        setProfileSetupDialogOpen(true)
      }
    } catch (error) {
      console.error("Error checking company profile:", error)
      // Fail open — don't block quotation creation if the check itself fails
      router.push("/quotations/new")
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

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quotation</h1>
            <p className="text-muted-foreground">Create and manage customers quotations</p>
          </div>
          <Button onClick={handleNewQuotationClick} disabled={checkingProfile || limitsLoading}>
            <Plus className="mr-2 size-4" />
            New Quotation
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
                  placeholder="Search by customer name, phone, or quotation number..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quotations Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Quotations</CardTitle>
            <CardDescription>
              You have {filteredQuotations.length} quotations in total
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading quotations...</div>
            ) : filteredQuotations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {quotations.length === 0 ? "No quotations yet. Create your first quotation!" : "No quotations matching your filters"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quote No</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Grand Total</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotations.map((quotation) => (
                      <TableRow key={quotation.id}>
                        <TableCell className="font-medium">{quotation.quote_no}</TableCell>
                        <TableCell>{quotation.client_name}</TableCell>
                        <TableCell>
                          {new Date(quotation.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>{formatCurrency(quotation.grand_total)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Link href={`/quotations/${quotation.id}`}>
                              <Button variant="ghost" size="sm" title="View Quotation">
                                <Eye className="size-4" />
                                <span className="sr-only">View</span>
                              </Button>
                            </Link>
                            <Link href={`/quotations/${quotation.id}/edit`}>
                              <Button variant="ghost" size="sm" title="Edit Quotation">
                                <Edit className="size-4" />
                                <span className="sr-only">Edit</span>
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setQuotationToDelete(quotation); setDeleteDialogOpen(true) }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete Quotation"
                            >
                              <Trash2 className="size-4" />
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
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {quotationToDelete?.quote_no}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={profileSetupDialogOpen} onOpenChange={setProfileSetupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Your Company Profile</DialogTitle>
            <DialogDescription>
              Before creating a quotation, please add your company name, address, and contact
              details in Settings. This information appears on your quotation PDF header.
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

      {/* Limit Reached Modal – only from button */}
      <LimitReachedModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        type={limitModalType}
        onUpgrade={handleUpgrade}
        customTitle={limitModalCustom.title}
        customDescription={limitModalCustom.description}
      />
    </DashboardLayout>
  )
}
