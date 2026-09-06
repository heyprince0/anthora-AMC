"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
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
import { supabase, type Customer, type Contract, type ServiceHistory, type Technician, getDaysUntilService } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, Phone, MapPin, Mail, FileText, Wrench, Calendar, Package } from "lucide-react"
import { toast } from "sonner"

interface ServiceRecord extends ServiceHistory {
  technicianName: string
}

interface ContractDisplay extends Contract {
  daysUntilService: number
  endDate: string | null
}

function getContractEndDate(startDate: string | null, durationYears: number | null): string | null {
  if (!startDate || !durationYears || durationYears <= 0) return null
  const start = new Date(startDate)
  const end = new Date(start)
  end.setFullYear(end.getFullYear() + durationYears)
  return end.toISOString().split('T')[0]
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getStatusBadge(days: number, status: string) {
  if (days < 0) return <Badge className="bg-alert-overdue/10 text-alert-overdue border-alert-overdue/20">Expired</Badge>
  if (days === 0) return <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20">Today</Badge>
  if (days <= 3) return <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20">Soon</Badge>
  if (status === "active") return <Badge className="bg-alert-success/10 text-alert-success border-alert-success/20">Active</Badge>
  return <Badge variant="outline">{status}</Badge>
}

function getServiceStatusBadge(status: string) {
  switch (status) {
    case "completed": return <Badge className="bg-alert-success/10 text-alert-success border-alert-success/20 text-[11px] px-1.5 py-0">Completed</Badge>
    case "partial": return <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20 text-[11px] px-1.5 py-0">Partial</Badge>
    case "cancelled": return <Badge className="bg-alert-overdue/10 text-alert-overdue border-alert-overdue/20 text-[11px] px-1.5 py-0">Cancelled</Badge>
    default: return <Badge variant="outline" className="text-[11px] px-1.5 py-0">{status}</Badge>
  }
}

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user, role } = useAuth()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [contracts, setContracts] = useState<ContractDisplay[]>([])
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
    if (currentOrgId && customerId) loadCustomerDetails()
  }, [currentOrgId, customerId])

  const loadCustomerDetails = async () => {
    try {
      if (!currentOrgId) return

      const { data: customerData, error: customerError } = await supabase
        .from('customers').select('*').eq('id', customerId).eq('org_id', currentOrgId).single()

      if (customerError) throw customerError
      if (!customerData) {
        toast.error('Customer not found')
        router.push('/customers')
        return
      }

      setCustomer(customerData as Customer)

      const { data: contractsData, error: contractsError } = await supabase
        .from('contracts').select('*').eq('customer_id', customerId).eq('org_id', currentOrgId)

      if (contractsError) throw contractsError

      const contractsWithExtra = (contractsData as Contract[]).map(contract => ({
        ...contract,
        daysUntilService: getDaysUntilService(contract.next_service_date),
        endDate: contract.contract_type === 'old'
          ? (contract.end_date || null)
          : getContractEndDate(contract.start_date, contract.duration_years),
      }))

      setContracts(contractsWithExtra)

      if (contractsData && contractsData.length > 0) {
        const contractIds = (contractsData as Contract[]).map(c => c.id)

        const { data: historyData, error: historyError } = await supabase
          .from('service_history').select('*').in('contract_id', contractIds).eq('org_id', currentOrgId)

        if (historyError) throw historyError

        const { data: techniciansData } = await supabase
          .from('technicians').select('*').eq('org_id', currentOrgId)

        const historyWithTechnicianNames = (historyData as ServiceHistory[]).map(record => {
          const technician = (techniciansData as Technician[])?.find(t => t.id === record.technician_id)
          return { ...record, technicianName: technician?.name || 'Unknown' }
        })

        setServiceHistory(historyWithTechnicianNames)
      }
    } catch (error) {
      console.error('Error loading customer details:', error)
      toast.error('Failed to load customer details')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading customer details...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!customer) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Customer not found</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">

        {/* Header with back button */}
        <div className="flex items-center gap-4">
          {role !== 'technician' && (
            <Button variant="ghost" size="icon" onClick={() => router.push('/customers')} className="size-9">
              <ArrowLeft className="size-4" />
              <span className="sr-only">Back to customers</span>
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
            <p className="text-muted-foreground">Customer Details</p>
          </div>
        </div>

        {/* Customer Info Card — unchanged */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-lg font-semibold text-primary">{customer.name.charAt(0)}</span>
              </span>
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <Phone className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium text-foreground">{customer.phone}</p>
                </div>
              </div>
              {customer.email && (
                <div className="flex items-center gap-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium text-foreground">{customer.email}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 sm:col-span-2">
                <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium text-foreground">{customer.address}</p>
                </div>
              </div>
              {customer.notes && (
                <div className="flex items-start gap-3 sm:col-span-2">
                  <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="font-medium text-foreground whitespace-pre-wrap">{customer.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── DESKTOP: Active Contracts Table — unchanged ── */}
        <Card className="hidden md:block">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Active Contracts
            </CardTitle>
            <CardDescription>
              {contracts.length} contract{contracts.length !== 1 ? 's' : ''} associated with this customer
            </CardDescription>
          </CardHeader>
          <CardContent>
            {contracts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No contracts found for this customer</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract Name</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Contract End</TableHead>
                      <TableHead>Last Service</TableHead>
                      <TableHead>Next Service</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((contract) => {
                      const frequencyMonths = Math.round(contract.frequency_days / 30)
                      return (
                        <TableRow key={contract.id}>
                          <TableCell className="font-medium">{contract.contract_name}</TableCell>
                          <TableCell>{frequencyMonths} months</TableCell>
                          <TableCell>
                            {contract.contracts_price != null
                              ? `₹${contract.contracts_price.toLocaleString('en-IN')}`
                              : '—'}
                          </TableCell>
                          <TableCell>{formatDate(contract.endDate)}</TableCell>
                          <TableCell>{formatDate(contract.start_date)}</TableCell>
                          <TableCell>{formatDate(contract.next_service_date)}</TableCell>
                          <TableCell>{getStatusBadge(contract.daysUntilService, contract.status)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── MOBILE: Active Contracts Cards — unchanged ── */}
        <div className="flex flex-col gap-4 md:hidden">
          <div>
            <h2 className="text-lg font-semibold">Active Contracts</h2>
            <p className="text-sm text-muted-foreground">
              {contracts.length} contract{contracts.length !== 1 ? 's' : ''} associated with this customer
            </p>
          </div>
          {contracts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No contracts found for this customer</div>
          ) : (
            contracts.map((contract) => {
              const frequencyMonths = Math.round(contract.frequency_days / 30)
              return (
                <Card key={contract.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="size-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-semibold leading-tight truncate">
                            {contract.contract_name}
                          </CardTitle>
                          <CardDescription className="text-xs truncate mt-0.5">
                            {frequencyMonths} months · ₹{contract.contracts_price?.toLocaleString('en-IN') || '—'}
                          </CardDescription>
                        </div>
                      </div>
                      {getStatusBadge(contract.daysUntilService, contract.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Contract End</p>
                        <p className="text-sm font-medium">{formatDate(contract.endDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Last Service</p>
                        <p className="text-sm font-medium">{formatDate(contract.start_date)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground mb-0.5">Next Service</p>
                        <p className="text-sm font-medium">{formatDate(contract.next_service_date)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* ── DESKTOP: Service History Table — unchanged ── */}
        <Card className="hidden md:block">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5" />
              Service History
            </CardTitle>
            <CardDescription>
              {serviceHistory.length} service record{serviceHistory.length !== 1 ? 's' : ''} for this customer
            </CardDescription>
          </CardHeader>
          <CardContent>
            {serviceHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No service history found for this customer</div>
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
                            {formatDate(record.service_date)}
                          </div>
                        </TableCell>
                        <TableCell>{record.technicianName}</TableCell>
                        <TableCell>{getServiceStatusBadge(record.status)}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-sm text-muted-foreground line-clamp-2">{record.notes || '—'}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── MOBILE: Service History — compact timeline log ── */}
        <div className="flex flex-col gap-3 md:hidden">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-1.5">
                <Wrench className="size-4 text-muted-foreground" />
                Service History
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {serviceHistory.length} record{serviceHistory.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {serviceHistory.length === 0 ? (
            <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No service history found
            </div>
          ) : (
            /* Single contained list — divide-y between entries, NOT individual Cards */
            <div className="rounded-lg border bg-card divide-y divide-border overflow-hidden">
              {serviceHistory.map((record) => (
                <div key={record.id} className="flex items-start gap-3 px-4 py-3">
                  {/* Small timeline dot */}
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                    <Calendar className="size-3 text-muted-foreground" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Date + status on same row */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{formatDate(record.service_date)}</p>
                      {getServiceStatusBadge(record.status)}
                    </div>

                    {/* Technician */}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {record.technicianName}
                    </p>

                    {/* Notes — only if present */}
                    {record.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                        {record.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  )
}
