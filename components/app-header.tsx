"use client"

import { useEffect, useState } from "react"
import { Bell, Sparkles, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { supabase, type Contract, getDaysUntilService } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import PlanSelectionModal from "@/components/billing/PlanSelectionModal"

interface NotificationItem {
  id: string
  title: string
  description: string
  type: "expired" | "today-servicing" | "expiring-soon"
}

// Module‑level cache
const headerCache: {
  trialDaysRemaining: number | null
  subscriptionDaysRemaining: number | null
  notifications: NotificationItem[]
  expiredCount: number
  todayServicingCount: number
  expiringSoonCount: number
  hasLoadedOnce: boolean
  status: string | null
  planName: string | null
} = {
  trialDaysRemaining: null,
  subscriptionDaysRemaining: null,
  notifications: [],
  expiredCount: 0,
  todayServicingCount: 0,
  expiringSoonCount: 0,
  hasLoadedOnce: false,
  status: null,
  planName: null,
}

export function AppHeader() {
  const { user, role, orgId, orgName } = useAuth()

  // Seed from cache
  const [notifications, setNotifications] = useState<NotificationItem[]>(headerCache.notifications)
  const [expiredCount, setExpiredCount] = useState(headerCache.expiredCount)
  const [todayServicingCount, setTodayServicingCount] = useState(headerCache.todayServicingCount)
  const [expiringSoonCount, setExpiringSoonCount] = useState(headerCache.expiringSoonCount)
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(headerCache.trialDaysRemaining)
  const [subscriptionDaysRemaining, setSubscriptionDaysRemaining] = useState<number | null>(headerCache.subscriptionDaysRemaining)

  const { status, planName, isLoading: limitsLoading, refetch: refetchLimits } = usePlanLimits(orgId)

  const [displayStatus, setDisplayStatus] = useState<string | null>(headerCache.status)
  const [displayPlanName, setDisplayPlanName] = useState<string | null>(headerCache.planName)

  useEffect(() => {
    if (!limitsLoading && status) {
      setDisplayStatus(status)
      headerCache.status = status
    }
    if (!limitsLoading && planName) {
      setDisplayPlanName(planName)
      headerCache.planName = planName
    }
  }, [status, planName, limitsLoading])

  const [dateLoading, setDateLoading] = useState(!headerCache.hasLoadedOnce)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // Load both trial and subscription expiry dates
  const loadDates = async () => {
    if (!orgId) return
    setDateLoading(true)
    try {
      // Try to fetch all possible date columns
      const { data, error } = await supabase
        .from("subscriptions")
        .select("trial_end_date, current_period_end, end_date, renewal_date")
        .eq("org_id", orgId)
        .maybeSingle()

      if (error) throw error

      // Trial days
      let trialDays: number | null = null
      if (data?.trial_end_date) {
        const end = new Date(data.trial_end_date)
        const today = new Date()
        end.setHours(0, 0, 0, 0)
        today.setHours(0, 0, 0, 0)
        const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        trialDays = Math.max(diff, 0)
      }
      setTrialDaysRemaining(trialDays)
      headerCache.trialDaysRemaining = trialDays

      // Subscription period end – try multiple fields
      let periodEnd: string | null = null
      if (data?.current_period_end) periodEnd = data.current_period_end
      else if (data?.end_date) periodEnd = data.end_date
      else if (data?.renewal_date) periodEnd = data.renewal_date

      let subDays: number | null = null
      if (periodEnd) {
        const end = new Date(periodEnd)
        const today = new Date()
        end.setHours(0, 0, 0, 0)
        today.setHours(0, 0, 0, 0)
        const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        subDays = Math.max(diff, -30)
      }
      setSubscriptionDaysRemaining(subDays)
      headerCache.subscriptionDaysRemaining = subDays
    } catch (error) {
      console.error("Error loading dates:", error)
      setTrialDaysRemaining(null)
      headerCache.trialDaysRemaining = null
      setSubscriptionDaysRemaining(null)
      headerCache.subscriptionDaysRemaining = null
    } finally {
      setDateLoading(false)
      headerCache.hasLoadedOnce = true
    }
  }

  const loadAlerts = async () => {
    if (!user?.id || !orgId) return
    try {
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("id, contract_name, next_service_date, status, customer_id")
        .eq("org_id", orgId)

      if (!contractsData) return

      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name")
        .eq("org_id", orgId)

      let expired = 0
      let todayServicing = 0
      let expiringSoon = 0
      const items: NotificationItem[] = []

      for (const contract of contractsData as Contract[]) {
        const days = getDaysUntilService(contract.next_service_date)
        const customer = customersData?.find((c) => c.id === contract.customer_id)
        const customerName = customer?.name || "Unknown"

        if (days < 0) {
          expired++
          items.push({
            id: contract.id,
            title: `Expired: ${contract.contract_name}`,
            description: `${customerName} — ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} expired`,
            type: "expired",
          })
        } else if (days === 0) {
          todayServicing++
          items.push({
            id: contract.id,
            title: `Today Servicing: ${contract.contract_name}`,
            description: `${customerName} — service due today`,
            type: "today-servicing",
          })
        } else if (days <= 3) {
          expiringSoon++
          items.push({
            id: contract.id,
            title: `Expiring Soon: ${contract.contract_name}`,
            description: `${customerName} — in ${days} day${days !== 1 ? "s" : ""}`,
            type: "expiring-soon",
          })
        }
      }

      setExpiredCount(expired)
      setTodayServicingCount(todayServicing)
      setExpiringSoonCount(expiringSoon)
      setNotifications(items.slice(0, 10))

      headerCache.expiredCount = expired
      headerCache.todayServicingCount = todayServicing
      headerCache.expiringSoonCount = expiringSoon
      headerCache.notifications = items.slice(0, 10)
    } catch (error) {
      console.error("Error loading notifications:", error)
    }
  }

  useEffect(() => {
    if (orgId) {
      loadAlerts()
      loadDates()
    }
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    const subscription = supabase
      .channel("header_contracts")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `org_id=eq.${orgId}` }, () => {
        loadAlerts()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [orgId])

  const totalCount = expiredCount + todayServicingCount + expiringSoonCount

  const handleUpgrade = () => setShowUpgradeModal(true)

  const handleUpgradeSuccess = () => {
    refetchLimits()
    loadDates()
  }

  const showTrialBanner = displayStatus === 'trial'
  const showSubscriptionBanner = !showTrialBanner &&
    (displayStatus === 'active' || displayStatus === 'expired') &&
    subscriptionDaysRemaining !== null &&
    subscriptionDaysRemaining <= 3

  // Urgency styles for both banners
  const getUrgencyStyles = (days: number | null) => {
    if (days === null) {
      return {
        wrapper: "from-blue-50 to-indigo-50 border-blue-200/60",
        iconBg: "bg-blue-100 text-blue-600",
        text: "text-blue-900",
        subtext: "text-blue-700/70",
        button: "bg-blue-600 hover:bg-blue-700",
      }
    }
    if (days <= 0) {
      return {
        wrapper: "from-red-50 to-orange-50 border-red-200/60",
        iconBg: "bg-red-100 text-red-600",
        text: "text-red-900",
        subtext: "text-red-700/70",
        button: "bg-red-600 hover:bg-red-700",
      }
    }
    if (days <= 3) {
      return {
        wrapper: "from-orange-50 to-amber-50 border-orange-200/60",
        iconBg: "bg-orange-100 text-orange-600",
        text: "text-orange-900",
        subtext: "text-orange-700/70",
        button: "bg-orange-600 hover:bg-orange-700",
      }
    }
    if (days <= 7) {
      return {
        wrapper: "from-amber-50 to-yellow-50 border-amber-200/60",
        iconBg: "bg-amber-100 text-amber-600",
        text: "text-amber-900",
        subtext: "text-amber-700/70",
        button: "bg-amber-600 hover:bg-amber-700",
      }
    }
    return {
      wrapper: "from-blue-50 to-indigo-50 border-blue-200/60",
      iconBg: "bg-blue-100 text-blue-600",
      text: "text-blue-900",
      subtext: "text-blue-700/70",
      button: "bg-blue-600 hover:bg-blue-700",
    }
  }

  const trialUrgency = getUrgencyStyles(trialDaysRemaining)
  const subscriptionUrgency = getUrgencyStyles(subscriptionDaysRemaining)

  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-card px-4 md:px-6">
        <SidebarTrigger className="md:hidden" />

        {/* Trial Banner */}
        {showTrialBanner && (
          <div
            className={`flex flex-1 items-center justify-between gap-2 rounded-xl border bg-gradient-to-r ${trialUrgency.wrapper} px-3 py-1.5 sm:px-4 sm:py-2 flex-wrap`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={`flex size-7 shrink-0 items-center justify-center rounded-full ${trialUrgency.iconBg} sm:size-8`}>
                <Sparkles className="size-3.5 sm:size-4" />
              </div>
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                <span className={`font-semibold text-xs sm:text-sm ${trialUrgency.text} truncate`}>
                  {trialDaysRemaining !== null ? (
                    <>
                      {trialDaysRemaining} {trialDaysRemaining === 1 ? "day" : "days"} left
                    </>
                  ) : (
                    "Free trial"
                  )}
                </span>
                <span className={`text-[10px] sm:text-xs ${trialUrgency.subtext} truncate hidden sm:inline`}>
                  {displayPlanName || "Free Trial"} plan
                </span>
              </div>
            </div>
            <Button
              size="sm"
              className={`${trialUrgency.button} text-white text-[10px] sm:text-xs px-2 sm:px-3 py-1 h-7 sm:h-8 gap-1 shrink-0`}
              onClick={handleUpgrade}
            >
              Upgrade
              <ArrowRight className="size-3 hidden sm:inline" />
            </Button>
          </div>
        )}

        {/* Subscription Expiry Banner */}
        {showSubscriptionBanner && (
          <div
            className={`flex flex-1 items-center justify-between gap-2 rounded-xl border bg-gradient-to-r ${subscriptionUrgency.wrapper} px-3 py-1.5 sm:px-4 sm:py-2 flex-wrap`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={`flex size-7 shrink-0 items-center justify-center rounded-full ${subscriptionUrgency.iconBg} sm:size-8`}>
                <Sparkles className="size-3.5 sm:size-4" />
              </div>
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                <span className={`font-semibold text-xs sm:text-sm ${subscriptionUrgency.text} truncate`}>
                  {subscriptionDaysRemaining !== null && subscriptionDaysRemaining > 0 ? (
                    <>
                      {subscriptionDaysRemaining} {subscriptionDaysRemaining === 1 ? "day" : "days"} until expiry
                    </>
                  ) : (
                    "Subscription expired"
                  )}
                </span>
                <span className={`text-[10px] sm:text-xs ${subscriptionUrgency.subtext} truncate hidden sm:inline`}>
                  {displayPlanName || "Plan"} — {displayStatus === 'expired' ? 'renew now' : 'renew to continue'}
                </span>
              </div>
            </div>
            <Button
              size="sm"
              className={`${subscriptionUrgency.button} text-white text-[10px] sm:text-xs px-2 sm:px-3 py-1 h-7 sm:h-8 gap-1 shrink-0`}
              onClick={handleUpgrade}
            >
              {displayStatus === 'expired' ? 'Renew' : 'Upgrade'}
              <ArrowRight className="size-3 hidden sm:inline" />
            </Button>
          </div>
        )}

        {/* Organization name (members only) */}
        {role === "member" && orgName && (
          <div className="hidden md:block ml-2 text-sm font-medium text-muted-foreground">
            {orgName}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="size-5" />
                {totalCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 size-5 p-0 flex items-center justify-center text-[10px]">
                    {totalCount > 9 ? "9+" : totalCount}
                  </Badge>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-80 max-w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                  <span className="text-sm text-muted-foreground">No alerts — all services are on track</span>
                </DropdownMenuItem>
              ) : (
                notifications.map((n) => (
                  <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1 py-3">
                    <span
                      className={`font-medium text-sm ${
                        n.type === "expired"
                          ? "text-red-600"
                          : n.type === "today-servicing"
                          ? "text-amber-600"
                          : "text-orange-600"
                      }`}
                    >
                      {n.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{n.description}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <PlanSelectionModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        orgId={orgId || undefined}
        onSuccess={handleUpgradeSuccess}
      />
    </>
  )
}
