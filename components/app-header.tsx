const loadDates = async () => {
  if (!orgId) return
  setDateLoading(true)
  try {
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
      subDays = Math.max(diff, -30) // clamp at -30 to avoid huge negatives
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
