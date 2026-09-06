"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase, type Contract, type Customer, type Technician, getDaysUntilService } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import {
  FileText,
  Users,
  Wrench,
  CalendarClock,
  CalendarCheck,
  Plus,
  ArrowRight,
  Clock,
  Package,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  ScanBarcode,
  ArrowLeftRight,
} from "lucide-react"
import { AddContractModal } from "@/components/add-contract-modal"
import { subscribeToNotifications } from "@/lib/push-notifications"
import { toast } from "sonner"
import LimitReachedModal, { LimitModalType } from "@/components/billing/limit-reached-modal"
import PlanSelectionModal from "@/components/billing/PlanSelectionModal"
import ScanBarcodeDialog from "@/app/(dashboard)/stocks/components/ScanBarcodeDialog"

interface UpcomingService {
  id: string
  customer: string
  service: string
  date: string
  time: string
  technician: string | null
  status: "expired" | "today-servicing" | "expiring-soon"
}

interface InventoryMetrics {
  totalItems: number
  lowStockCount: number
  outOfStockCount: number
  totalInventoryValue: number
  partsUsedThisMonth: number
}

function getStatusBadge(status: string) {
  switch (status) {
    case "today-servicing":
      return <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20">Today Servicing</Badge>
    case "expiring-soon":
      return <Badge className="bg-alert-upcoming/10 text-alert-upcoming border-alert-upcoming/20">Expiring Soon</Badge>
    case "expired":
      return <Badge className="bg-alert-overdue/10 text-alert-overdue border-alert-overdue/20">Expired</Badge>
    default:
      return null
  }
}

export default function DashboardPage() {
  const { user, loading: authLoading, role, orgId, technicianId } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState({ 
    contracts: 0, 
    todayServicing: 0, 
    monthServicing: 0,
    expiringSoon: 0, 
    expired: 0,
    customers: 0, 
    technicians: 0 
  })
  const [upcomingServices, setUpcomingServices] = useState<UpcomingService[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [notificationLoading, setNotificationLoading] = useState(false)

  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  const [subscription, setSubscription] = useState<any>(null)
  const [plan, setPlan] = useState<any>(null)
  const [contractCount, setContractCount] = useState(0)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalType, setLimitModalType] = useState<LimitModalType>('expired')
  const [limitModalCustom, setLimitModalCustom] = useState<{ title?: string; description?: string }>({})
  const [limitValue, setLimitValue] = useState(0)

  const [showPlanModal, setShowPlanModal] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [autoShown, setAutoShown] = useState(false)

  const [inventoryMetrics, setInventoryMetrics] = useState<InventoryMetrics | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(true)

  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [categories, setCategories] = useState<any[]>([])

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

  const [isRedirecting, setIsRedirecting] = useState(true)
  const [orgCheckDone, setOrgCheckDone] = useState(false)

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("memberships")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error("Failed to fetch organization:", error)
            toast.error("Could not determine your organization")
          } else if (data?.org_id) {
            setCurrentOrgId(data.org_id)
          } else {
            toast.info("You are not part of any organization yet. Please complete your profile setup or contact your admin.", {
              duration: 5000,
            })
          }
        })
        .finally(() => {
          setOrgCheckDone(true)
        })
    }
  }, [user?.id])

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!currentOrgId) return
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

  const loadInventoryMetrics = async () => {
    if (!currentOrgId) return
    setInventoryLoading(true)
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
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

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

      setInventoryMetrics({ totalItems, lowStockCount, outOfStockCount, totalInventoryValue, partsUsedThisMonth })
    } catch (error) {
      console.error("Error loading inventory metrics:", error)
      toast.error("Failed to load inventory metrics")
    } finally {
      setInventoryLoading(false)
    }
  }

  const loadData = async () => {
    try {
      if (!user?.id || !currentOrgId) {
        setDataReady(true)
        return
      }

      const { data: contractsData, error: contractsError } = await supabase
        .from('contracts').select('*').eq('org_id', currentOrgId)
      if (contractsError) throw contractsError

      const { data: customersData, error: customersError } = await supabase
        .from('customers').select('*').eq('org_id', currentOrgId)
      if (customersError) throw customersError

      const { data: techniciansData, error: techniciansError } = await supabase
        .from('technicians').select('*').eq('org_id', currentOrgId)
      if (techniciansError) throw techniciansError

      const activeContracts = (contractsData as Contract[]).filter(c => c.status === 'active').length
      let todayServicing = 0
      let monthServicing = 0
      let expiringSoon = 0
      let expired = 0
      const services: UpcomingService[] = []
      const now = new Date()

      for (const contract of (contractsData as Contract[]) || []) {
        const customer = (customersData as Customer[])?.find(c => c.id === contract.customer_id)
        const days = getDaysUntilService(contract.next_service_date)

        if (contract.next_service_date) {
          const svcDate = new Date(contract.next_service_date)
          if (svcDate.getFullYear() === now.getFullYear() && svcDate.getMonth() === now.getMonth()) {
            monthServicing++
          }
        }

        if (days < 0) {
          expired++
          services.push({ id: contract.id, customer: customer?.name || 'Unknown', service: contract.contract_name, date: 'Expired', time: '', technician: null, status: 'expired' })
        } else if (days === 0) {
          todayServicing++
          services.push({ id: contract.id, customer: customer?.name || 'Unknown', service: contract.contract_name, date: 'Today', time: '', technician: null, status: 'today-servicing' })
        } else if (days <= 3) {
          expiringSoon++
          services.push({ id: contract.id, customer: customer?.name || 'Unknown', service: contract.contract_name, date: new Date(contract.next_service_date).toLocaleDateString(), time: '', technician: null, status: 'expiring-soon' })
        }
      }

      setStats({
        contracts: activeContracts,
        todayServicing,
        monthServicing,
        expiringSoon,
        expired,
        customers: (customersData as Customer[])?.length || 0,
        technicians: (techniciansData as Technician[])?.length || 0,
      })

      setUpcomingServices(services.slice(0, 4))
      await fetchContractCount()
      await loadInventoryMetrics()
      await loadCategories()
      setDataReady(true)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id && currentOrgId) {
      loadData()
    } else if (user?.id && !currentOrgId) {
      setDataReady(true)
      setLoading(false)
    }
  }, [user?.id, currentOrgId])

  const checkAndShowLimitModal = (showOnLoad = false) => {
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
      setLimitModalCustom({ title: `Your ${plan?.name || 'current'} plan has expired`, description: `Renew your ${plan?.name || 'current'} plan to keep using all features.` })
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
    if (dataReady && !autoShown) {
      checkAndShowLimitModal(true)
    }
  }, [dataReady, autoShown, subscription, plan, contractCount])

  useEffect(() => {
    if (!user?.id || !currentOrgId) return

    const contractsSubscription = supabase
      .channel('contracts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts', filter: `org_id=eq.${currentOrgId}` }, () => loadData())
      .subscribe()

    const customersSubscription = supabase
      .channel('customers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `org_id=eq.${currentOrgId}` }, () => loadData())
      .subscribe()

    const techniciansSubscription = supabase
      .channel('technicians_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technicians', filter: `org_id=eq.${currentOrgId}` }, () => loadData())
      .subscribe()

    return () => {
      contractsSubscription.unsubscribe()
      customersSubscription.unsubscribe()
      techniciansSubscription.unsubscribe()
    }
  }, [user?.id, currentOrgId])

  const handleEnableNotifications = async () => {
    if (!user?.id) { toast.error('User not found'); return }
    setNotificationLoading(true)
    const result = await subscribeToNotifications(user.id)
    if (result.success) {
      toast.success('Notifications enabled successfully!')
    } else {
      toast.error(result.error || 'Failed to enable notifications')
    }
    setNotificationLoading(false)
  }

  const handleAddClick = () => {
    const blocked = checkAndShowLimitModal(false)
    if (blocked) return
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

  const handleModalSuccess = () => { loadData() }

  useEffect(() => {
    if (authLoading || !user || !role) return
    if (role === 'technician') {
      if (technicianId) {
        router.push(`/technicians/${technicianId}`)
      } else {
        router.push('/technicians')
      }
    } else {
      setIsRedirecting(false)
    }
  }, [authLoading, user, role, technicianId, router])

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/landing.html'
    }
  }, [user, authLoading])

  if (authLoading || isRedirecting || !orgCheckDone) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="h-7 w-40 rounded-md bg-muted" />
              <div className="mt-2 h-4 w-64 rounded-md bg-muted" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="h-9 w-32 rounded-md bg-muted" />
              <div className="h-9 w-32 rounded-md bg-muted" />
              <div className="h-9 w-32 rounded-md bg-muted" />
              <div className="h-9 w-32 rounded-md bg-muted" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <div className="h-4 w-20 rounded-md bg-muted" />
                <div className="mt-3 h-7 w-12 rounded-md bg-muted" />
                <div className="mt-2 h-3 w-16 rounded-md bg-muted" />
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <div className="h-5 w-40 rounded-md bg-muted" />
              <div className="mt-1 h-3 w-56 rounded-md bg-muted" />
              <div className="mt-4 flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted" />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="h-5 w-40 rounded-md bg-muted" />
              <div className="mt-1 h-3 w-56 rounded-md bg-muted" />
              <div className="mt-4 grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-md bg-muted" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!user) return null

  if (!currentOrgId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="max-w-md text-center">
            <p className="text-muted-foreground">You are not part of any organization yet.</p>
            <p className="text-sm text-muted-foreground mt-2">Please complete your profile setup or contact your administrator.</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">

        {/* ── MOBILE header: compact with icon-only buttons ── */}
        <div className="flex items-center justify-between md:hidden">
          <div>
            <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Service overview</p>
          </div>
          <div className="flex gap-1.5">
            <Button size="icon" variant="outline" onClick={() => setScanDialogOpen(true)} title="Scan Barcode">
              <ScanBarcode className="size-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => router.push('/stocks?tab=movements')} title="Stock Movements">
              <ArrowLeftRight className="size-4" />
            </Button>
            <Button size="icon" onClick={handleAddClick} title="Add Contract">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {/* ── DESKTOP header: full layout (unchanged) ── */}
        <div className="hidden md:flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back! Here{"'"}s your service overview.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setScanDialogOpen(true)}>
              <ScanBarcode className="mr-2 size-4" />
              Scan Barcode
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push('/stocks?tab=movements')}>
              <ArrowLeftRight className="mr-2 size-4" />
              Stock Movements
            </Button>
            <Button size="sm" onClick={handleAddClick}>
              <Plus className="mr-2 size-4" />
              Add Contract
            </Button>
          </div>
        </div>

        {/* ── MOBILE: One compact summary Card (all 6 stats) ── */}
        <div className="md:hidden">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Active Contracts</p>
                  <p className="text-2xl font-bold">{loading ? "—" : stats.contracts}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">This Month</p>
                  <p className="text-2xl font-bold">{loading ? "—" : stats.monthServicing}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Expiring Soon</p>
                  <p className="text-2xl font-bold text-amber-600">{loading ? "—" : stats.expiringSoon}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Expired</p>
                  <p className="text-2xl font-bold text-red-600">{loading ? "—" : stats.expired}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Customers</p>
                  <p className="text-2xl font-bold">{loading ? "—" : stats.customers}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Technicians</p>
                  <p className="text-2xl font-bold">{loading ? "—" : stats.technicians}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── DESKTOP: 6 StatCards grid (unchanged) ── */}
        <div className="hidden md:grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard title="Active Contracts" value={stats.contracts} icon={FileText} description="Total" />
          <StatCard title="This Month Servicing" value={stats.monthServicing} icon={CalendarClock} description="This month" iconClassName="bg-alert-due-today/10" />
          <StatCard title="Expiring Soon" value={stats.expiringSoon} icon={CalendarCheck} description="In next 3 days" />
          <StatCard title="Expired" value={stats.expired} icon={Clock} description="Overdue contracts" iconClassName="bg-alert-overdue/10" />
          <StatCard title="Total Customers" value={stats.customers} icon={Users} description="All customers" />
          <StatCard title="Technicians" value={stats.technicians} icon={Wrench} description="Available" />
        </div>

        {/* ── Two-column section: Upcoming Services + Inventory Overview (unchanged) ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg">Upcoming Services</CardTitle>
                <CardDescription>Services scheduled for the next few days</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => window.location.href = '/alerts'}>
                View All <ArrowRight className="ml-2 size-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {loading ? (
                  <div className="text-center py-4 text-muted-foreground">Loading...</div>
                ) : upcomingServices.length > 0 ? (
                  upcomingServices.map((service) => (
                    <div key={service.id} className="flex items-start justify-between rounded-lg border border-border bg-secondary/30 p-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-card-foreground">{service.customer}</span>
                        <span className="text-sm text-muted-foreground">{service.service}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          <span>{service.date} {service.time}</span>
                        </div>
                      </div>
                      {getStatusBadge(service.status)}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">No upcoming services</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg">Inventory Overview</CardTitle>
                <CardDescription>Current stock and usage summary</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => window.location.href = '/stocks'}>
                View All <ArrowRight className="ml-2 size-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {inventoryLoading ? (
                <div className="text-center py-4 text-muted-foreground">Loading inventory data...</div>
              ) : inventoryMetrics ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Package className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Items</p>
                      <p className="text-xl font-semibold">{inventoryMetrics.totalItems}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-600">
                      <AlertTriangle className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Low Stock</p>
                      <p className="text-xl font-semibold">{inventoryMetrics.lowStockCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-red-500/10 text-red-600">
                      <AlertTriangle className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Out of Stock</p>
                      <p className="text-xl font-semibold">{inventoryMetrics.outOfStockCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-green-500/10 text-green-600">
                      <DollarSign className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <p className="text-xl font-semibold">₹{inventoryMetrics.totalInventoryValue.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-3 pt-2 border-t border-border">
                    <div className="flex size-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
                      <TrendingUp className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Parts Used This Month</p>
                      <p className="text-xl font-semibold">{inventoryMetrics.partsUsedThisMonth}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">No inventory data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        {user && currentOrgId && (
          <AddContractModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSuccess={handleModalSuccess}
            editingContract={null}
            userId={user.id}
            orgId={currentOrgId}
          />
        )}

        <LimitReachedModal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          type={limitModalType}
          onUpgrade={handleViewPlans}
          limitValue={limitValue}
          customTitle={limitModalCustom.title}
          customDescription={limitModalCustom.description}
        />

        <PlanSelectionModal
          isOpen={showPlanModal}
          onClose={() => setShowPlanModal(false)}
          onSelectPlan={handleSelectPlan}
        />

        {currentOrgId && (
          <ScanBarcodeDialog
            open={scanDialogOpen}
            onOpenChange={setScanDialogOpen}
            orgId={currentOrgId}
            categories={categories}
            onRefresh={loadInventoryMetrics}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
