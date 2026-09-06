"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase, type Contract, type Customer, type Technician, type TechnicianJob, getDaysUntilService } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import LimitReachedModal, { LimitModalType } from "@/components/billing/limit-reached-modal"
import PlanSelectionModal from "@/components/billing/PlanSelectionModal"
import { AlertTriangle, Clock, CalendarClock, CheckCircle2, UserPlus } from "lucide-react"
import { MarkCompleteModal } from "@/components/mark-complete-modal"
import { AssignTechnicianModal } from "@/components/assign-technician-modal"
import { toast } from "sonner"

interface ServiceAlert {
  id: string
  customer: string
  contract: string
  serviceType: string
  dueDate: string
  daysOverdue?: number
  technician: string | null
  contractData?: Contract
}

function ServiceAlertCard({
  service,
  variant,
  onMarkComplete,
  onAssignTechnician,
}: {
  service: ServiceAlert
  variant: "overdue" | "due-today" | "upcoming"
  onMarkComplete: (contract: Contract) => void
  onAssignTechnician: (contract: Contract) => void
}) {
  const borderColor = {
    overdue: "border-l-alert-overdue",
    "due-today": "border-l-alert-due-today",
    upcoming: "border-l-alert-upcoming",
  }[variant]

  const bgColor = {
    overdue: "bg-alert-overdue/5",
    "due-today": "bg-alert-due-today/5",
    upcoming: "bg-alert-upcoming/5",
  }[variant]

  return (
    <Card className={`border-l-4 ${borderColor} ${bgColor}`}>
      <CardContent className="p-4">
        {/* Info row */}
        <div className="flex flex-col gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-card-foreground">{service.customer}</h3>
              <Badge variant="outline" className="text-xs font-normal">{service.serviceType}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{service.contract}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5 shrink-0" />
                <span>
                  {variant === "overdue"
                    ? `${service.daysOverdue} days expired`
                    : variant === "due-today"
                    ? "Today"
                    : service.dueDate}
                </span>
              </div>
              {service.technician && (
                <div className="flex items-center gap-1.5">
                  <span>Assigned:</span>
                  <span className="font-medium text-foreground">{service.technician}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons — full width on mobile, inline on desktop */}
          <div className="flex gap-2 md:flex-row md:justify-end">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 md:flex-none"
              onClick={() => service.contractData && onAssignTechnician(service.contractData)}
            >
              <UserPlus className="mr-1.5 size-4 shrink-0" />
              <span className="hidden sm:inline">{service.technician ? "Reassign" : "Assign Technician"}</span>
              <span className="sm:hidden">{service.technician ? "Reassign" : "Assign"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 md:flex-none"
              onClick={() => service.contractData && onMarkComplete(service.contractData)}
            >
              <CheckCircle2 className="mr-1.5 size-4 shrink-0" />
              <span className="hidden sm:inline">Mark Complete</span>
              <span className="sm:hidden">Complete</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ServiceAlertsPage() {
  const { user } = useAuth()
  const [overdueServices, setOverdueServices] = useState<ServiceAlert[]>([])
  const [dueTodayServices, setDueTodayServices] = useState<ServiceAlert[]>([])
  const [upcomingServices, setUpcomingServices] = useState<ServiceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [contractToAssign, setContractToAssign] = useState<Contract | null>(null)

  const { status, plan, isLoading: limitsLoading } = usePlanLimits(currentOrgId)

  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalType, setLimitModalType] = useState<LimitModalType>('expired')
  const [limitModalCustom, setLimitModalCustom] = useState<{ title?: string; description?: string }>({})
  const [limitValue, setLimitValue] = useState(0)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [autoShown, setAutoShown] = useState(false)

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
    if (currentOrgId) loadServices()
  }, [currentOrgId])

  useEffect(() => {
    if (limitsLoading || !currentOrgId || autoShown) return
    const isExpired = status === 'expired' || status === 'cancelled'
    if (isExpired) {
      setLimitModalType('expired')
      setLimitModalCustom({
        title: `Your ${plan?.name || 'current'} plan has expired`,
        description: `Renew your ${plan?.name || 'current'} plan to continue using service alerts.`,
      })
      setShowLimitModal(true)
      setAutoShown(true)
    }
  }, [limitsLoading, status, plan, currentOrgId, autoShown])

  const checkAndShowLimitModal = (): boolean => {
    const isExpired = status === 'expired' || status === 'cancelled'
    if (isExpired) {
      setLimitModalType('expired')
      setLimitModalCustom({
        title: `Your ${plan?.name || 'current'} plan has expired`,
        description: `Renew your ${plan?.name || 'current'} plan to continue using service alerts.`,
      })
      setShowLimitModal(true)
      return true
    }
    return false
  }

  const loadServices = async () => {
    try {
      if (!currentOrgId) return

      const { data: contractsData } = await supabase
        .from("contracts").select("*").eq("org_id", currentOrgId)

      const { data: customersData } = await supabase
        .from("customers").select("*").eq("org_id", currentOrgId)

      const { data: assignedJobsData } = await supabase
        .from("technician_jobs").select("*").eq("org_id", currentOrgId)
        .eq("source", "service_alert").eq("status", "pending")

      const { data: techniciansData } = await supabase
        .from("technicians").select("*").eq("org_id", currentOrgId)

      const overdue: ServiceAlert[] = []
      const dueToday: ServiceAlert[] = []
      const upcoming: ServiceAlert[] = []

      for (const contract of (contractsData as Contract[]) || []) {
        const customer = (customersData as Customer[])?.find(c => c.id === contract.customer_id)
        const days = getDaysUntilService(contract.next_service_date)
        const assignedJob = (assignedJobsData as TechnicianJob[])?.find(j => j.contract_id === contract.id)
        const assignedTechnician = assignedJob
          ? (techniciansData as Technician[])?.find(t => t.id === assignedJob.technician_id)
          : null

        const alert: ServiceAlert = {
          id: contract.id,
          customer: customer?.name || "Unknown Customer",
          contract: contract.contract_name,
          serviceType: contract.service_type || "Service",
          dueDate: contract.next_service_date,
          technician: assignedTechnician?.name || null,
          contractData: contract,
        }

        if (days < 0) overdue.push({ ...alert, daysOverdue: Math.abs(days) })
        else if (days === 0) dueToday.push(alert)
        else if (days <= 7) upcoming.push(alert)
      }

      setOverdueServices(overdue)
      setDueTodayServices(dueToday)
      setUpcomingServices(upcoming)
    } catch (error) {
      console.error("Error loading service alerts:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkComplete = (contract: Contract) => {
    if (checkAndShowLimitModal()) return
    setSelectedContract(contract)
    setModalOpen(true)
  }

  const handleAssignTechnician = (contract: Contract) => {
    if (checkAndShowLimitModal()) return
    setContractToAssign(contract)
    setAssignModalOpen(true)
  }

  const handleAssignSuccess = () => loadServices()
  const handleModalSuccess = () => loadServices()

  const handleViewPlans = () => {
    setShowLimitModal(false)
    setShowPlanModal(true)
  }

  const handleSelectPlan = (plan: any, billingCycle: any) => {
    alert(`Selected plan: ${plan.name} (${billingCycle})`)
    setShowPlanModal(false)
  }

  const totalAlerts = overdueServices.length + dueTodayServices.length + upcomingServices.length

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:gap-6">

        {/* ── MOBILE header: compact ── */}
        <div className="flex items-center justify-between md:hidden">
          <div>
            <h1 className="text-xl font-bold text-foreground">Service Alerts</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading..." : `${totalAlerts} alert${totalAlerts !== 1 ? "s" : ""} need attention`}
            </p>
          </div>
        </div>

        {/* ── DESKTOP header: full ── */}
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold text-foreground">Service Alerts</h1>
          <p className="text-muted-foreground">Monitor and manage upcoming and overdue services</p>
        </div>

        {/* ── MOBILE: compact 3-column stat row ── */}
        <div className="grid grid-cols-3 gap-2 md:hidden">
          <div className="rounded-lg border-l-4 border-l-alert-overdue bg-alert-overdue/5 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="size-3.5 text-alert-overdue shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-tight">Expired</p>
            </div>
            <p className="text-2xl font-bold">{loading ? "—" : overdueServices.length}</p>
          </div>
          <div className="rounded-lg border-l-4 border-l-alert-due-today bg-alert-due-today/5 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarClock className="size-3.5 text-alert-due-today shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-tight">Today</p>
            </div>
            <p className="text-2xl font-bold">{loading ? "—" : dueTodayServices.length}</p>
          </div>
          <div className="rounded-lg border-l-4 border-l-alert-upcoming bg-alert-upcoming/5 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="size-3.5 text-alert-upcoming shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-tight">Soon</p>
            </div>
            <p className="text-2xl font-bold">{loading ? "—" : upcomingServices.length}</p>
          </div>
        </div>

        {/* ── DESKTOP: full 3-card grid (unchanged) ── */}
        <div className="hidden md:grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-alert-overdue bg-alert-overdue/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-alert-overdue" />
                Expired Services
              </CardDescription>
              <CardTitle className="text-3xl">{overdueServices.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Requires immediate attention</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-alert-due-today bg-alert-due-today/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <CalendarClock className="size-4 text-alert-due-today" />
                Due Today
              </CardDescription>
              <CardTitle className="text-3xl">{dueTodayServices.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Scheduled for today</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-alert-upcoming bg-alert-upcoming/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="size-4 text-alert-upcoming" />
                Expiring Soon
              </CardDescription>
              <CardTitle className="text-3xl">{upcomingServices.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Coming up soon</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="overdue" className="w-full">
          {/* Mobile: full-width 3-col tabs with short labels */}
          <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
            <TabsTrigger value="overdue" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="size-2 rounded-full bg-alert-overdue shrink-0" />
              <span className="hidden sm:inline">Expired </span>
              <span>({overdueServices.length})</span>
            </TabsTrigger>
            <TabsTrigger value="today" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="size-2 rounded-full bg-alert-due-today shrink-0" />
              <span className="hidden sm:inline">Today </span>
              <span className="sm:hidden">Today </span>
              <span>({dueTodayServices.length})</span>
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="size-2 rounded-full bg-alert-upcoming shrink-0" />
              <span className="hidden sm:inline">Expiring Soon </span>
              <span className="sm:hidden">Soon </span>
              <span>({upcomingServices.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overdue" className="mt-4 md:mt-6">
            <div className="flex flex-col gap-3 md:gap-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : overdueServices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No expired services</div>
              ) : (
                overdueServices.map((service) => (
                  <ServiceAlertCard
                    key={service.id}
                    service={service}
                    variant="overdue"
                    onMarkComplete={handleMarkComplete}
                    onAssignTechnician={handleAssignTechnician}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="today" className="mt-4 md:mt-6">
            <div className="flex flex-col gap-3 md:gap-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : dueTodayServices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No services due today</div>
              ) : (
                dueTodayServices.map((service) => (
                  <ServiceAlertCard
                    key={service.id}
                    service={service}
                    variant="due-today"
                    onMarkComplete={handleMarkComplete}
                    onAssignTechnician={handleAssignTechnician}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="upcoming" className="mt-4 md:mt-6">
            <div className="flex flex-col gap-3 md:gap-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : upcomingServices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No services expiring soon</div>
              ) : (
                upcomingServices.map((service) => (
                  <ServiceAlertCard
                    key={service.id}
                    service={service}
                    variant="upcoming"
                    onMarkComplete={handleMarkComplete}
                    onAssignTechnician={handleAssignTechnician}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Modals — untouched */}
        {user && currentOrgId && (
          <MarkCompleteModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            contract={selectedContract}
            userId={user.id}
            orgId={currentOrgId}
            onSuccess={handleModalSuccess}
          />
        )}

        {currentOrgId && (
          <AssignTechnicianModal
            open={assignModalOpen}
            onOpenChange={setAssignModalOpen}
            contract={contractToAssign}
            orgId={currentOrgId}
            onSuccess={handleAssignSuccess}
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
      </div>
    </DashboardLayout>
  )
}
