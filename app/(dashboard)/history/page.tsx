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
import { supabase, type ServiceHistory, type Contract, type Technician, type Customer, type CompanyProfile } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { Search, Download, Calendar, CheckCircle2, XCircle, Clock, FileText } from "lucide-react"
import { ExportModal } from "@/components/export-modal"
import { toast } from "sonner"

// Month options for the date filter
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

interface ServiceRecord extends ServiceHistory {
  customerName: string
  contractName: string
  technicianName: string
  contractPrice: number | null
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-alert-success/10 text-alert-success border-alert-success/20">
          <CheckCircle2 className="mr-1 size-3" />
          Completed
        </Badge>
      )
    case "partial":
      return (
        <Badge className="bg-alert-due-today/10 text-alert-due-today border-alert-due-today/20">
          <Clock className="mr-1 size-3" />
          Partial
        </Badge>
      )
    case "cancelled":
      return (
        <Badge className="bg-alert-overdue/10 text-alert-overdue border-alert-overdue/20">
          <XCircle className="mr-1 size-3" />
          Cancelled
        </Badge>
      )
    default:
      return null
  }
}

export default function ServiceHistoryPage() {
  const { user } = useAuth()
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<ServiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterMonth, setFilterMonth] = useState("all")
  const [exportModalOpen, setExportModalOpen] = useState(false)

  // --- Org state ---
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [profile, setProfile] = useState<CompanyProfile | null>(null)

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
            // Also fetch company profile for PDF
            supabase
              .from("company_profile")
              .select("*")
              .eq("org_id", data.org_id)
              .single()
              .then(({ data: profileData }) => {
                if (profileData) setProfile(profileData as CompanyProfile)
              })
          }
        })
    }
  }, [user?.id])

  useEffect(() => {
    if (currentOrgId) {
      loadServiceHistory()
    }
  }, [currentOrgId])

  const loadServiceHistory = async () => {
    try {
      if (!currentOrgId) return

      const { data: historyData } = await supabase
        .from('service_history')
        .select('*')
        .eq('org_id', currentOrgId)

      const { data: contractsData } = await supabase
        .from('contracts')
        .select('*')
        .eq('org_id', currentOrgId)

      const { data: techniciansData } = await supabase
        .from('technicians')
        .select('*')
        .eq('org_id', currentOrgId)

      const { data: customersData } = await supabase
        .from('customers')
        .select('*')
        .eq('org_id', currentOrgId)

      const records = (historyData as ServiceHistory[]).map(record => {
        const contract = (contractsData as Contract[])?.find(c => c.id === record.contract_id)
        const technician = (techniciansData as Technician[])?.find(t => t.id === record.technician_id)
        const customer = (customersData as Customer[])?.find(c => c.id === contract?.customer_id)

        return {
          ...record,
          customerName: customer?.name || 'Unknown',
          contractName: contract?.contract_name || 'Unknown',
          technicianName: technician?.name || 'Unknown',
          contractPrice: contract?.contracts_price ?? null
        }
      })

      setServiceRecords(records)
      setFilteredRecords(records)
    } catch (error) {
      console.error('Error loading service history:', error)
      toast.error('Failed to load service history')
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = () => {
    let filtered = serviceRecords
    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.contractName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.technicianName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    if (filterMonth !== 'all') {
      const monthNum = parseInt(filterMonth)
      filtered = filtered.filter(r => {
        if (!r.service_date) return false
        const date = new Date(r.service_date)
        return date.getMonth() === monthNum
      })
    }
    setFilteredRecords(filtered)
  }

  useEffect(() => {
    handleFilter()
  }, [searchTerm, filterMonth, serviceRecords])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Service History</h1>
            <p className="text-muted-foreground">View completed services and maintenance records</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setExportModalOpen(true)}
            >
              <Download className="mr-2 size-4" />
              Export Report
            </Button>
          </div>
        </div>

        {/* ── Standalone Filter Bar (no card) ── */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center flex-wrap">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by customer, technician, or contract..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

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
        </div>

        {/* Desktop: Service History Table */}
        <Card className="hidden md:block">
          <CardHeader>
            <CardTitle>Service Records</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading service history...</div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No service records found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="max-w-[200px]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.customerName}</TableCell>
                      <TableCell>{record.contractName}</TableCell>
                      <TableCell>{record.technicianName}</TableCell>
                      <TableCell>{formatDate(record.service_date)}</TableCell>
                      <TableCell>
                        {record.contractPrice != null
                          ? `₹${record.contractPrice.toLocaleString('en-IN')}`
                          : '—'}
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="text-sm text-muted-foreground line-clamp-2">
                          {record.notes}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Mobile: Service History Cards (View button removed) */}
        <div className="flex flex-col gap-4 md:hidden">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading service history...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No service records found</div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">{filteredRecords.length}</span>{" "}
                records{" "}
                {searchTerm || filterMonth !== 'all' ? 'matching filters' : 'in total'}
              </p>

              {filteredRecords.map((record) => (
                <Card key={record.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="size-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-semibold leading-tight truncate">
                            {record.contractName}
                          </CardTitle>
                          <CardDescription className="text-xs truncate mt-0.5">
                            {record.customerName}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {getStatusBadge(record.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Technician</p>
                        <p className="text-sm font-medium">{record.technicianName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Date</p>
                        <p className="text-sm font-medium">{formatDate(record.service_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Price</p>
                        <p className="text-sm font-medium">
                          {record.contractPrice != null
                            ? `₹${record.contractPrice.toLocaleString('en-IN')}`
                            : '—'}
                        </p>
                      </div>
                      {record.notes && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                          <p className="text-sm font-medium line-clamp-2">{record.notes}</p>
                        </div>
                      )}
                    </div>
                    {/* Footer without View button */}
                    <div className="flex items-center justify-end pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">Service Record</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>

        {/* Export Modal */}
        <ExportModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          records={filteredRecords}
          orgId={currentOrgId}
        />
      </div>
    </DashboardLayout>
  )
}
