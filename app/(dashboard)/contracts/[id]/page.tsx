"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { supabase, type Contract, type Customer, type ServiceHistory, type Technician, getDaysUntilService } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, FileText, Phone, MapPin, Calendar, DollarSign, StickyNote, Wrench, Eye } from "lucide-react"
import { toast } from "sonner"

interface ContractDisplay extends Contract {
  daysUntilService: number
  endDate: string | null
  customerName: string
}

interface ServiceRecord extends ServiceHistory {
  technicianName: string
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

function getServiceStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge className="bg-alert-success/10 text-alert-success border-alert-success/20">Completed</Badge>
    case "partial":
      return <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20">Partial</Badge>
    case "cancelled":
      return <Badge className="bg-alert-overdue/10 text-alert-overdue border-alert-overdue/20">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function ContractDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const contractId = params.id as string

  const [contract, setContract] = useState<ContractDisplay | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [serviceHistory, setServiceHistory] = useState<ServiceRecord[]>([])
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

      // Fetch service history for this contract
      const { data: historyData, error: historyError } = await supabase
        .from('service_history')
        .select('*')
        .eq('contract_id', contractId)
        .eq('org_id', currentOrgId)

      if (historyError) throw historyError

      // Fetch technicians to get names
      const { data: techniciansData } = await supabase
        .from('technicians')
        .select('*')
        .eq('org_id', currentOrgId)

      const historyWithTechnicianNames = (historyData as ServiceHistory[])?.map(record => {
        const technician = (techniciansData as Technician[])?.find(t => t.id === record.technician_id)
        return {
          ...record,
          technicianName: technician?.name || 'Unknown'
        }
      }) || []

      setServiceHistory(historyWithTechnicianNames)
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
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{contract.customerName}</p>
                    {customer && (
                      <Link href={`/customers/${customer.id}`}>
                        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                          <Eye className="size-3" />
                          View
                        </Button>
                      </Link>
                    )}
                  </div>
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

              <div className="flex items-start gap-3 sm:col-span-2">
                <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium text-foreground">{contract.location || '—'}</p>
                </div>
              </div>

              {contract.notes && (
                <div className="flex items-start gap-3 sm:col-span-2">
                  <StickyNote className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="font-medium text-foreground whitespace-pre-wrap">{contract.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Service History Section — same card UI/UX as Customer Details page */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5" />
              Service History
            </CardTitle>
            <CardDescription>
              {serviceHistory.length} service record{serviceHistory.length !== 1 ? 's' : ''} for this contract
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serviceHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No service history found for this contract
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="max-w-[200px]">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceHistory.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="size-4 text-muted-foreground" />
                            {record.service_date}
                          </div>
                        </TableCell>
                        <TableCell>{record.technicianName}</TableCell>
                        <TableCell>{getServiceStatusBadge(record.status)}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {record.notes || '—'}
                          </span>
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
    </DashboardLayout>
  )
}
