"use client"

import { useEffect, useState } from "react"
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
import { supabase, type Contract, type Customer, getDaysUntilService } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { Plus, Search, Edit, Trash2, Download, Eye } from "lucide-react"
import { toast } from "sonner"
import { AddContractModal } from "@/components/add-contract-modal"
import Link from "next/link"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import LimitReachedModal, { LimitModalType } from "@/components/billing/limit-reached-modal"
import PlanSelectionModal from "@/components/billing/PlanSelectionModal"

interface ContractDisplay extends Contract {
  customerName: string
  endDate: string | null
}

function getContractEndDate(startDate: string | null, durationYears: number | null): string | null {
  if (!startDate || !durationYears || durationYears <= 0) return null
  const start = new Date(startDate)
  const end = new Date(start)
  end.setFullYear(end.getFullYear() + durationYears)
  return end.toISOString().split('T')[0]
}

function getStatusBadge(days: number, status: string) {
  if (days < 0) {
    return <Badge className="bg-alert-overdue/10 text-alert-overdue border-alert-overdue/20">Expired</Badge>
  } else if (days === 0) {
    return <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20">Today Servicing</Badge>
  } else if (days <= 3) {
    return <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20">Expiring Soon</Badge>
  } else if (status === "active") {
    return <Badge className="bg-alert-success/10 text-alert-success border-alert-success/20">Active</Badge>
  }
  return <Badge variant="outline">{status}</Badge>
}

function getStatusLabel(days: number, status: string): string {
  if (days < 0) return 'Expired'
  if (days === 0) return 'Today Servicing'
  if (days <= 3) return 'Expiring Soon'
  if (status === 'active') return 'Active'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getFilterStatusValue(days: number, status: string): string {
  if (days < 0) return 'expired'
  if (days === 0) return 'today-servicing'
  if (days <= 3) return 'expiring-soon'
  if (status === 'active') return 'active'
  return status
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [22, 45, 60]
}

// Month options for filter
const MONTHS = [
  { value: 'all', label: 'All Months' },
  { value: '0', label: 'Jan' },
  { value: '1', label: 'Feb' },
  { value: '2', label: 'Mar' },
  { value: '3', label: 'Apr' },
  { value: '4', label: 'May' },
  { value: '5', label: 'Jun' },
  { value: '6', label: 'Jul' },
  { value: '7', label: 'Aug' },
  { value: '8', label: 'Sep' },
  { value: '9', label: 'Oct' },
  { value: '10', label: 'Nov' },
  { value: '11', label: 'Dec' },
]

export default function ContractsPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<ContractDisplay[]>([])
  const [filteredContracts, setFilteredContracts] = useState<ContractDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterMonth, setFilterMonth] = useState("all") // new month filter
  const [filterLocation, setFilterLocation] = useState("all") // new location filter
  const [modalOpen, setModalOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<ContractDisplay | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null) // NEW: current user's role

  const [subscription, setSubscription] = useState<any>(null)
  const [plan, setPlan] = useState<any>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const [contractCount, setContractCount] = useState(0)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalType, setLimitModalType] = useState<LimitModalType>('expired')
  const [limitModalCustom, setLimitModalCustom] = useState<{ title?: string; description?: string }>({})
  const [limitValue, setLimitValue] = useState(0)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [autoShown, setAutoShown] = useState(false)

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("memberships")
        .select("org_id, role")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error("Failed to fetch organization:", error)
            toast.error("Could not determine your organization")
            setLoading(false)
          } else if (data?.org_id) {
            setCurrentOrgId(data.org_id)
            setUserRole(data.role) // store role
          } else {
            setLoading(false)
          }
        })
    } else {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!currentOrgId) return
      setSubscriptionLoading(true)
      try {
        const { data: subData, error } = await supabase
          .from('subscriptions')
          .select('*, plan:plan_id(*)')
          .eq('org_id', currentOrgId)
          .maybeSingle()

        if (error) throw error

        if (subData) {
          setSubscription(subData)
          setPlan(subData.plan)
        } else {
          const { data: freePlan } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', 'free')
            .single()
          setPlan(freePlan)
        }
      } catch (error) {
        console.error('Error fetching subscription:', error)
      } finally {
        setSubscriptionLoading(false)
      }
    }
    fetchSubscription()
  }, [currentOrgId])

  const fetchContractCount = async () => {
    if (!currentOrgId) return
    try {
      const { count, error } = await supabase
        .from('contracts')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', currentOrgId)

      if (error) throw error
      setContractCount(count || 0)
    } catch (error) {
      console.error('Error fetching contract count:', error)
    }
  }

  useEffect(() => {
    if (currentOrgId) {
      const loadData = async () => {
        setLoading(true)
        await Promise.all([loadContracts(), fetchContractCount()])
        setLoading(false)
        setDataReady(true)
      }
      loadData()
    }
  }, [currentOrgId])

  const checkAndShowLimitModal = (showOnLoad = false) => {
    // Technicians should not see the limit modal (they can't add anyway)
    if (userRole === 'technician') return false

    if (showOnLoad && autoShown) return

    let isExpired = false
    if (subscription) {
      if (subscription.status === 'expired') {
        isExpired = true
      } else if (subscription.trial_end_date) {
        const trialEnd = new Date(subscription.trial_end_date)
        const today = new Date()
        if (trialEnd < today && subscription.status !== 'active') {
          isExpired = true
        }
      }
    }

    if (isExpired) {
      setLimitModalType('expired')
      setLimitModalCustom({
        title: `Your ${plan?.name || 'current'} plan has expired`,
        description: `Renew your ${plan?.name || 'current'} plan to continue adding contracts.`,
      })
      setShowLimitModal(true)
      if (showOnLoad) setAutoShown(true)
      return true
    }

    const maxContracts = plan?.max_contracts ?? 99999
    if (contractCount >= maxContracts) {
      setLimitModalType('contracts-limit')
      setLimitModalCustom({})
      setLimitValue(maxContracts)
      setShowLimitModal(true)
      if (showOnLoad) setAutoShown(true)
      return true
    }

    return false
  }

  useEffect(() => {
    if (dataReady && !autoShown && userRole !== 'technician') {
      checkAndShowLimitModal(true)
    }
  }, [dataReady, autoShown, subscription, plan, contractCount, userRole])

  const handleFilter = () => {
    let filtered = contracts

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.contract_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.customerName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(c => {
        const days = getDaysUntilService(c.next_service_date)
        const statusLabel = getFilterStatusValue(days, c.status)
        return statusLabel === filterStatus
      })
    }

    // Month filter (by next_service_date)
    if (filterMonth !== 'all') {
      const monthNum = parseInt(filterMonth)
      filtered = filtered.filter(c => {
        if (!c.next_service_date) return false
        const date = new Date(c.next_service_date)
        return date.getMonth() === monthNum
      })
    }

    // Location filter
    if (filterLocation !== 'all') {
      filtered = filtered.filter(c => c.location === filterLocation)
    }

    setFilteredContracts(filtered)
  }

  useEffect(() => {
    handleFilter()
  }, [searchTerm, filterStatus, filterMonth, filterLocation, contracts])

  // Distinct, non-empty locations pulled from existing contracts — the Location
  // filter dropdown populates itself from whatever locations users have typed in.
  const availableLocations = Array.from(
    new Set(
      contracts
        .map(c => c.location?.trim())
        .filter((loc): loc is string => !!loc)
    )
  ).sort()

  const handleDelete = async () => {
    if (!contractToDelete || !currentOrgId) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', contractToDelete.id)
        .eq('org_id', currentOrgId)
      if (error) throw error
      setContracts(contracts.filter(c => c.id !== contractToDelete.id))
      toast.success('Contract deleted successfully')
      setDeleteDialogOpen(false)
      setContractToDelete(null)
    } catch (error) {
      toast.error('Failed to delete contract')
    } finally {
      setDeleting(false)
    }
  }

  const handleEditClick = (contract: ContractDisplay) => {
    setEditingContract(contract as Contract)
    setModalOpen(true)
  }

  const handleViewPlans = () => {
    setShowLimitModal(false)
    setShowPlanModal(true)
  }

  const handleSelectPlan = (plan: any, billingCycle: any) => {
    alert(`Selected plan: ${plan.name} (${billingCycle})`)
    setShowPlanModal(false)
  }

  const handleAddClick = () => {
    if (userRole === 'technician') return // safety
    if (subscriptionLoading) {
      toast.error("Checking your plan status, please try again in a moment...")
      return
    }
    const blocked = checkAndShowLimitModal(false)
    if (blocked) return
    setEditingContract(null)
    setModalOpen(true)
  }

  const handleModalSuccess = () => {
    const refresh = async () => {
      setLoading(true)
      await Promise.all([loadContracts(), fetchContractCount()])
      setLoading(false)
    }
    refresh()
  }

  const loadContracts = async () => {
    try {
      if (!currentOrgId) return

      const { data: contractsData, error: contractsError } = await supabase
        .from('contracts')
        .select('*')
        .eq('org_id', currentOrgId)

      if (contractsError) throw contractsError

      const { data: customersData } = await supabase
        .from('customers')
        .select('*')
        .eq('org_id', currentOrgId)

      const displayed = (contractsData as Contract[]).map(contract => {
        const customer = (customersData as Customer[])?.find(c => c.id === contract.customer_id)
        // Old-mode contracts have a manually-entered End Year saved directly in
        // contract.end_date — show it as-is, don't recalculate it from start_date.
        // New-mode contracts keep the existing auto-calculated behavior, unchanged.
        const endDate = contract.contract_type === 'old'
          ? (contract.end_date || null)
          : getContractEndDate(contract.start_date, contract.duration_years)
        return {
          ...contract,
          customerName: customer?.name || 'Unknown',
          endDate,
        }
      })

      setContracts(displayed)
      setFilteredContracts(displayed)
    } catch (error) {
      console.error('Error loading contracts:', error)
      toast.error('Failed to load contracts')
    }
  }

  const getStatusCounts = (data: ContractDisplay[]) => {
    let active = 0, expired = 0, todayServicing = 0, expiringSoon = 0
    data.forEach(c => {
      const days = getDaysUntilService(c.next_service_date)
      if (days < 0) expired++
      else if (days === 0) todayServicing++
      else if (days <= 3) expiringSoon++
      else if (c.status === 'active') active++
    })
    return { active, expired, todayServicing, expiringSoon }
  }

  const exportContractsPDF = () => {
    if (filteredContracts.length === 0) {
      toast.error("No contracts to export")
      return
    }

    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
      const pageW = 297
      const margin = 15
      const themeColor = "#162d3c"
      const [r, g, b] = hexToRgb(themeColor)

      doc.setFillColor(r, g, b)
      doc.rect(0, 0, pageW, 14, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.text("Contracts Report", margin, 9)
      doc.setTextColor(200, 200, 200)
      doc.setFontSize(8)
      doc.text("AMC CONTRACTS", pageW - margin, 9, { align: "right" })

      const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      const counts = getStatusCounts(filteredContracts)
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(8)
      doc.text(`Exported: ${dateStr}  |  Total: ${filteredContracts.length}  |  Active: ${counts.active}  |  Expired: ${counts.expired}  |  Today Servicing: ${counts.todayServicing}  |  Expiring Soon: ${counts.expiringSoon}`, margin, 22)

      const tableData = filteredContracts.map(c => {
        const days = getDaysUntilService(c.next_service_date)
        const statusLabel = getStatusLabel(days, c.status)
        const frequencyMonths = Math.round(c.frequency_days / 30)
        return [
          c.contract_name || '—',
          c.customerName || '—',
          `${frequencyMonths} months`,
          c.contracts_price != null ? `Rs. ${Number(c.contracts_price).toLocaleString('en-IN')}` : '—',
          c.endDate || '—',
          c.start_date || '—',
          c.next_service_date || '—',
          statusLabel,
        ]
      })

      autoTable(doc, {
        startY: 28,
        head: [["Contract Name", "Customer", "Frequency", "Price (Rs.)", "Contract End", "Last Service", "Next Service", "Status"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [r, g, b],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
        },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 30 },
          2: { cellWidth: 22 },
          3: { cellWidth: 28 },
          4: { cellWidth: 28 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 },
          7: { cellWidth: 25 },
        },
        margin: { left: margin, right: margin },
      })

      const finalY = (doc as any).lastAutoTable.finalY + 8
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text("Generated by Remindi · remindi.online", pageW / 2, finalY, { align: "center" })

      doc.save(`Contracts_Report_${new Date().toISOString().split('T')[0]}.pdf`)
      toast.success("PDF exported successfully")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF")
    }
  }

  // Determine if the user is a technician
  const isTechnician = userRole === 'technician'

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 min-w-0">
        {/* Page Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contracts</h1>
            <p className="text-muted-foreground">Manage your AMC contracts and service agreements</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exportContractsPDF} disabled={filteredContracts.length === 0}>
              <Download className="mr-2 size-4" />
              Export PDF
            </Button>
            {/* Hide Add Contract button for technicians */}
            {!isTechnician && (
              <Button onClick={handleAddClick} disabled={subscriptionLoading}>
                <Plus className="mr-2 size-4" />
                Add Contract
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center flex-wrap">
              <div className="relative flex-1 min-w-[150px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search contracts..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="today-servicing">Today Servicing</SelectItem>
                    <SelectItem value="expiring-soon">Expiring Soon</SelectItem>
                  </SelectContent>
                </Select>

                {/* Month Filter */}
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Location Filter — options populate automatically from whatever
                    locations users have entered on their contracts */}
                <Select value={filterLocation} onValueChange={setFilterLocation}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {availableLocations.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contracts Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Contracts</CardTitle>
            <CardDescription>
              You have {filteredContracts.length} contracts {filterStatus !== 'all' || filterMonth !== 'all' || filterLocation !== 'all' ? 'matching filters' : 'in total'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading contracts...</div>
            ) : filteredContracts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No contracts found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract Name</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Contract End</TableHead>
                      <TableHead>Last Service</TableHead>
                      <TableHead>Next Service</TableHead>
                      <TableHead>Status</TableHead>
                      {/* Hide Actions column for technicians */}
                      {!isTechnician && <TableHead className="w-[70px]">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContracts.map((contract) => {
                      const days = getDaysUntilService(contract.next_service_date)
                      const frequencyMonths = Math.round(contract.frequency_days / 30)
                      return (
                        <TableRow key={contract.id}>
                          <TableCell className="font-medium">{contract.contract_name}</TableCell>
                          <TableCell>{contract.customerName}</TableCell>
                          <TableCell>{frequencyMonths} months</TableCell>
                          <TableCell>
                            {contract.contracts_price != null
                              ? `₹${contract.contracts_price.toLocaleString('en-IN')}`
                              : '—'}
                          </TableCell>
                          <TableCell>{contract.endDate || '—'}</TableCell>
                          <TableCell>{contract.start_date || '—'}</TableCell>
                          <TableCell>{contract.next_service_date || '—'}</TableCell>
                          <TableCell>{getStatusBadge(days, contract.status)}</TableCell>
                          {/* Hide Actions cell for technicians */}
                          {!isTechnician && (
                            <TableCell>
                              <div className="flex gap-2">
                                <Link href={`/contracts/${contract.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="View Contract Details"
                                  >
                                    <Eye className="size-4" />
                                    <span className="sr-only">View</span>
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(contract)}
                                  title="Edit Contract"
                                >
                                  <Edit className="size-4" />
                                  <span className="sr-only">Edit</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setContractToDelete(contract); setDeleteDialogOpen(true) }}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete Contract"
                                >
                                  <Trash2 className="size-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Contract Modal */}
        {user && currentOrgId && !isTechnician && (
          <AddContractModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSuccess={handleModalSuccess}
            editingContract={editingContract}
            userId={user.id}
            orgId={currentOrgId}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Contract</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {contractToDelete?.contract_name}? This action cannot be undone.
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

        {/* Limit Reached Modal */}
        <LimitReachedModal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          type={limitModalType}
          onUpgrade={handleViewPlans}
          limitValue={limitValue}
          customTitle={limitModalCustom.title}
          customDescription={limitModalCustom.description}
        />

        {/* Plan Selection Modal */}
        <PlanSelectionModal
          isOpen={showPlanModal}
          onClose={() => setShowPlanModal(false)}
          onSelectPlan={handleSelectPlan}
        />
      </div>
    </DashboardLayout>
  )
}
