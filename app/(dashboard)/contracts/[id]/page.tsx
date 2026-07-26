"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { supabase, type Contract, type Customer, getDaysUntilService } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, FileText, Phone, MapPin, Calendar, DollarSign } from "lucide-react"
import { toast } from "sonner"

interface ContractDisplay extends Contract {
  daysUntilService: number
  endDate: string | null
  customerName: string
}

// Helper to compute contract end date (same as Contracts page)
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

export default function ContractDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const contractId = params.id as string

  const [contract, setContract] = useState<ContractDisplay | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

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
    if (currentOrgId && contractId) {
      loadContractDetails()
    }
  }, [currentOrgId, contractId])

  const loadContractDetails = async () => {
    try {
      if (!currentOrgId) return

      // Fetch contract
      const { data: contractData, error: contractError } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .eq('org_id', currentOrgId)
        .single()

      if (contractError) throw contractError
      if (!contractData) {
        toast.error('Contract not found')
        router.push('/contracts')
        return
      }

      // Fetch customer
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', contractData.customer_id)
        .eq('org_id', currentOrgId)
        .single()

      if (customerError) {
        console.error('Failed to fetch customer:', customerError)
      }

      const daysUntilService = getDaysUntilService(contractData.next_service_date)
      const endDate = contractData.contract_type === 'old'
        ? (contractData.end_date || null)
        : getContractEndDate(contractData.start_date, contractData.duration_years)

      setCustomer(customerData as Customer)
      setContract({
        ...contractData as Contract,
        daysUntilService,
        endDate,
        customerName: customerData?.name || 'Unknown'
      })
    } catch (error) {
      console.error('Error loading contract details:', error)
      toast.error('Failed to load contract details')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading contract details...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!contract) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Contract not found</p>
        </div>
      </DashboardLayout>
    )
  }

  const frequencyMonths = Math.round(contract.frequency_days / 30)

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/contracts')}
            className="size-9"
          >
            <ArrowLeft className="size-4" />
            <span className="sr-only">Back to contracts</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{contract.contract_name}</h1>
            <p className="text-muted-foreground">Contract Details</p>
          </div>
        </div>

        {/* Contract Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="size-5 text-primary" />
              </span>
              Contract Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <FileText className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Contract Name</p>
                  <p className="font-medium text-foreground">{contract.contract_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium text-foreground">{contract.customerName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Service Frequency</p>
                  <p className="font-medium text-foreground">{frequencyMonths} months</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DollarSign className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="font-medium text-foreground">
                    {contract.contracts_price != null
                      ? `₹${contract.contracts_price.toLocaleString('en-IN')}`
                      : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Contract End Date</p>
                  <p className="font-medium text-foreground">{contract.endDate || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Last Service</p>
                  <p className="font-medium text-foreground">{contract.start_date || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Next Service</p>
                  <p className="font-medium text-foreground">{contract.next_service_date || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {getStatusBadge(contract.daysUntilService, contract.status)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
