'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase, type Technician, type TechnicianJob, type Customer, type Contract, type ServiceHistory } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { ArrowLeft, Phone, Wrench, Plus, CheckCircle2, Trash2, CalendarIcon, X, ScanBarcode } from 'lucide-react' // <-- added ScanBarcode
import { toast } from 'sonner'
import { AddTechnicianJobModal } from '@/components/add-technician-job-modal'
import { Input } from '@/components/ui/input'
import ScanBarcodeDialog from '../../stocks/components/ScanBarcodeDialog' // <-- import the dialog

interface JobWithCustomer extends TechnicianJob {
  customerName: string | null
}

// Unified shape for the Job History table — combines manual/service-alert
// completed technician_jobs rows with existing service_history rows,
// without duplicating data into technician_jobs.
interface HistoryDisplayItem {
  id: string
  completedDate: string | null
  title: string
  customerName: string | null
  source: 'manual' | 'service_alert' | 'service_history'
  notes: string | null
}

export default function TechnicianDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user, role } = useAuth()
  const technicianId = params.id as string

  const [technician, setTechnician] = useState<Technician | null>(null)
  const [assignedJobs, setAssignedJobs] = useState<JobWithCustomer[]>([])
  const [jobHistory, setJobHistory] = useState<HistoryDisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [statusEditMode, setStatusEditMode] = useState(false)
  const [statusValue, setStatusValue] = useState('')
  // Date filter for Job History
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('')
  // Feedback dialog shown when marking a job complete — its text updates the job's notes
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [jobToComplete, setJobToComplete] = useState<JobWithCustomer | null>(null)
  const [feedbackNotes, setFeedbackNotes] = useState('')

  // <-- NEW: state for scan dialog
  const [scanDialogOpen, setScanDialogOpen] = useState(false)

  useEffect(() => {
    if (user?.id) {
      supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Failed to fetch organization:', error)
            toast.error('Could not determine your organization')
          } else if (data?.org_id) {
            setCurrentOrgId(data.org_id)
          }
        })
    }
  }, [user?.id])

  // ✅ FIX: Use linked_user_id instead of user_id for ownership
  useEffect(() => {
    if (currentOrgId && technicianId) {
      // For technicians, redirect if trying to access another technician's profile
      if (role === 'technician' && user?.id) {
        supabase
          .from('technicians')
          .select('linked_user_id')
          .eq('id', technicianId)
          .eq('org_id', currentOrgId)
          .single()
          .then(({ data, error }) => {
            if (error || !data) {
              router.push('/technicians')
              return
            }
            // If the technician is linked to a different user, redirect to list
            if (data.linked_user_id && data.linked_user_id !== user.id) {
              router.push('/technicians')
              return
            }
            // Allow access if linked_user_id is null or matches current user
            setIsOwnProfile(data.linked_user_id === user.id)
            loadTechnicianDetails()
          })
      } else {
        // For non-technicians (admin, member), load details directly
        loadTechnicianDetails()
      }
    }
  }, [currentOrgId, technicianId, role, user?.id, router])

  const loadTechnicianDetails = async () => {
    try {
      if (!currentOrgId) return

      // Fetch technician
      const { data: technicianData, error: technicianError } = await supabase
        .from('technicians')
        .select('*')
        .eq('id', technicianId)
        .eq('org_id', currentOrgId)
        .single()

      if (technicianError) throw technicianError
      if (!technicianData) {
        toast.error('Technician not found')
        router.push('/technicians')
        return
      }

      setTechnician(technicianData as Technician)
      setStatusValue(technicianData.status)

      // Fetch assigned jobs (pending)
      const { data: assignedJobsData, error: assignedJobsError } = await supabase
        .from('technician_jobs')
        .select('*')
        .eq('technician_id', technicianId)
        .eq('status', 'pending')
        .eq('org_id', currentOrgId)
        .order('due_date', { ascending: true, nullsFirst: true })

      if (assignedJobsError) throw assignedJobsError

      // Fetch customers (needed for both assigned jobs and history)
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('org_id', currentOrgId)

      if (customersError) throw customersError

      const assignedJobsWithCustomer = (assignedJobsData as TechnicianJob[]).map((job) => {
        const customer = (customersData as Customer[])?.find((c) => c.id === job.customer_id)
        return {
          ...job,
          customerName: customer?.name || null,
        }
      })

      setAssignedJobs(assignedJobsWithCustomer)

      // Fetch job history — completed technician_jobs (manual + service_alert)
      const { data: historyJobsData, error: historyJobsError } = await supabase
        .from('technician_jobs')
        .select('*')
        .eq('technician_id', technicianId)
        .eq('status', 'completed')
        .eq('org_id', currentOrgId)
        .order('completed_at', { ascending: false })

      if (historyJobsError) throw historyJobsError

      const historyFromJobs: HistoryDisplayItem[] = (historyJobsData as TechnicianJob[]).map((job) => {
        const customer = (customersData as Customer[])?.find((c) => c.id === job.customer_id)
        return {
          id: `job-${job.id}`,
          completedDate: job.completed_at ? job.completed_at.split('T')[0] : null,
          title: job.title,
          customerName: customer?.name || null,
          source: job.source === 'service_alert' ? 'service_alert' : 'manual',
          notes: job.notes,
        }
      })

      // Fetch job history — sync in existing service_history records for this
      // technician (only ones where a technician was actually assigned;
      // unassigned/unknown-technician records simply won't match here and
      // stay untouched on the Service History page as before).
      const { data: serviceHistoryData, error: serviceHistoryError } = await supabase
        .from('service_history')
        .select('*')
        .eq('technician_id', technicianId)
        .eq('org_id', currentOrgId)
        .order('service_date', { ascending: false })

      if (serviceHistoryError) throw serviceHistoryError

      const contractIds = ((serviceHistoryData as ServiceHistory[]) || [])
        .map((r) => r.contract_id)
        .filter((id): id is string => !!id)

      let contractsData: Contract[] = []
      if (contractIds.length > 0) {
        const { data: contractsResult, error: contractsError } = await supabase
          .from('contracts')
          .select('*')
          .in('id', contractIds)
          .eq('org_id', currentOrgId)

        if (contractsError) throw contractsError
        contractsData = (contractsResult as Contract[]) || []
      }

      const historyFromServiceHistory: HistoryDisplayItem[] = ((serviceHistoryData as ServiceHistory[]) || []).map((record) => {
        const contract = contractsData.find((c) => c.id === record.contract_id)
        const customer = contract
          ? (customersData as Customer[])?.find((c) => c.id === contract.customer_id)
          : undefined

        return {
          id: `sh-${record.id}`,
          completedDate: record.service_date,
          title: contract?.contract_name || 'Service Record',
          customerName: customer?.name || null,
          source: 'service_history',
          notes: record.notes,
        }
      })

      // Merge both sources, most recent first
      const combinedHistory = [...historyFromJobs, ...historyFromServiceHistory].sort((a, b) => {
        if (!a.completedDate) return 1
        if (!b.completedDate) return -1
        return b.completedDate.localeCompare(a.completedDate)
      })

      setJobHistory(combinedHistory)
    } catch (error) {
      console.error('Error loading technician details:', error)
      toast.error('Failed to load technician details')
    } finally {
      setLoading(false)
    }
  }

  // Opens the feedback popup for a job before marking it complete
  const openCompleteDialog = (job: JobWithCustomer) => {
    setJobToComplete(job)
    setFeedbackNotes('')
    setCompleteDialogOpen(true)
  }

  // Same update/toast/reload flow as before — just also writes the feedback
  // text (if any) into the job's notes before marking it completed.
  const handleConfirmComplete = async () => {
    if (!currentOrgId || !jobToComplete) return
    try {
      const { error } = await supabase
        .from('technician_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: feedbackNotes.trim() || jobToComplete.notes,
        })
        .eq('id', jobToComplete.id)
        .eq('org_id', currentOrgId)

      if (error) throw error
      toast.success('Job marked as complete!')
      setCompleteDialogOpen(false)
      setJobToComplete(null)
      setFeedbackNotes('')
      loadTechnicianDetails()
    } catch (error) {
      console.error('Error marking job complete:', error)
      toast.error('Failed to mark job as complete')
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!currentOrgId) return
    if (!confirm('Are you sure you want to delete this job?')) return

    try {
      const { error } = await supabase
        .from('technician_jobs')
        .delete()
        .eq('id', jobId)
        .eq('org_id', currentOrgId)

      if (error) throw error
      toast.success('Job deleted successfully')
      setAssignedJobs(assignedJobs.filter((job) => job.id !== jobId))
    } catch (error) {
      console.error('Error deleting job:', error)
      toast.error('Failed to delete job')
    }
  }

  const handleModalSuccess = () => {
    loadTechnicianDetails()
  }

  const handleStatusSave = async () => {
    try {
      if (!currentOrgId || !technician) return

      const { error } = await supabase
        .from('technicians')
        .update({ status: statusValue })
        .eq('id', technicianId)
        .eq('org_id', currentOrgId)

      if (error) throw error
      toast.success('Status updated successfully')
      setStatusEditMode(false)
      setTechnician({ ...technician, status: statusValue })
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Failed to update status')
      setStatusValue(technician?.status || '')
    }
  }

  // Dot color for the technician's current status
  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500'
      case 'busy':
        return 'bg-yellow-500'
      case 'on-leave':
        return 'bg-red-500'
      default:
        return 'bg-gray-400'
    }
  }

  const getSourceBadgeLabel = (source: HistoryDisplayItem['source']) => {
    switch (source) {
      case 'service_alert':
        return 'From Service Alert'
      case 'service_history':
        return 'Service Record'
      default:
        return 'Manual'
    }
  }

  // Filter job history by date
  const filteredHistory = useMemo(() => {
    if (!historyDateFilter) return jobHistory
    return jobHistory.filter(item => item.completedDate === historyDateFilter)
  }, [jobHistory, historyDateFilter])

  const clearDateFilter = () => {
    setHistoryDateFilter('')
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading technician details...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!technician) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Technician not found</p>
        </div>
      </DashboardLayout>
    )
  }

  // Determine if we should show the back button – hide it for technicians viewing their own profile
  const showBackButton = !(role === 'technician' && isOwnProfile)

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header with back button – conditionally hidden for technicians */}
        <div className="flex items-center justify-between"> {/* <-- changed to justify-between */}
          <div className="flex items-center gap-4">
            {showBackButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/technicians')}
                className="size-9"
              >
                <ArrowLeft className="size-4" />
                <span className="sr-only">Back to technicians</span>
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground">{technician.name}</h1>
              <p className="text-muted-foreground">Technician Details</p>
            </div>
          </div>
          {/* <-- NEW: Scan Barcode button – only for technicians on their own profile */}
          {role === 'technician' && isOwnProfile && (
            <Button variant="outline" onClick={() => setScanDialogOpen(true)}>
              <ScanBarcode className="mr-2 size-4" />
              Scan Barcode
            </Button>
          )}
        </div>

        {/* Technician Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-lg font-semibold text-primary">
                  {technician.name.charAt(0)}
                </span>
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
                  <p className="font-medium text-foreground">{technician.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Wrench className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Specialization</p>
                  <p className="font-medium text-foreground">{technician.specialization}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="size-4 flex items-center justify-center">
                  <div className={`size-2 rounded-full ${getStatusDotColor(technician.status)}`} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  {role === 'technician' && isOwnProfile ? (
                    statusEditMode ? (
                      <div className="flex gap-2 items-center mt-1">
                        <select
                          value={statusValue}
                          onChange={(e) => setStatusValue(e.target.value)}
                          className="px-2 py-1 border border-input rounded text-sm"
                        >
                          <option value="available">Available</option>
                          <option value="busy">Busy</option>
                          <option value="on-leave">On Leave</option>
                        </select>
                        <Button size="sm" onClick={handleStatusSave} className="gap-1">
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStatusEditMode(false)
                            setStatusValue(technician.status)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <p className="font-medium text-foreground capitalize">{technician.status.replace('-', ' ')}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatusEditMode(true)}
                        >
                          Edit
                        </Button>
                      </div>
                    )
                  ) : (
                    <p className="font-medium text-foreground capitalize">{technician.status.replace('-', ' ')}</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assigned Jobs Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="size-5" />
                Assigned Jobs
              </CardTitle>
              <CardDescription>
                {assignedJobs.length} job{assignedJobs.length !== 1 ? 's' : ''} assigned to this technician
              </CardDescription>
            </div>
            {role !== 'technician' && (
              <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2">
                <Plus className="size-4" />
                Add Job
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {assignedJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No jobs assigned to this technician
              </div>
            ) : (
              <>
                {/* Desktop/tablet table — unchanged, hidden on mobile */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job Title</TableHead>
                        <TableHead>Assigned Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignedJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium">{job.title}</TableCell>
                          <TableCell>{job.assigned_date}</TableCell>
                          <TableCell>{job.due_date || '—'}</TableCell>
                          <TableCell>{job.customerName || '—'}</TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground line-clamp-2">
                              {job.notes || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">Pending</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() => openCompleteDialog(job)}
                              >
                                <CheckCircle2 className="size-4" />
                                Complete
                              </Button>
                              {/* View button — only when a customer is attached to this job */}
                              {job.customer_id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  onClick={() => router.push(`/customers/${job.customer_id}`)}
                                >
                                  View
                                </Button>
                              )}
                              {/* Delete button – only for non‑technicians */}
                              {role !== 'technician' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 text-red-600 hover:text-red-600"
                                  onClick={() => handleDeleteJob(job.id)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card view — same data/actions as the table above, shown only below md */}
                <div className="space-y-3 md:hidden">
                  {assignedJobs.map((job) => (
                    <div key={job.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-foreground">{job.title}</h3>
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 shrink-0">Pending</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Assigned Date</p>
                          <p className="text-foreground">{job.assigned_date}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Due Date</p>
                          <p className="text-foreground">{job.due_date || '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Customer</p>
                          <p className="text-foreground">{job.customerName || '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Notes</p>
                          <p className="text-foreground line-clamp-2">{job.notes || '—'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => openCompleteDialog(job)}
                        >
                          <CheckCircle2 className="size-4" />
                          Complete
                        </Button>
                        {job.customer_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => router.push(`/customers/${job.customer_id}`)}
                          >
                            View
                          </Button>
                        )}
                        {role !== 'technician' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-red-600 hover:text-red-600"
                            onClick={() => handleDeleteJob(job.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Job History Section with Date Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5" />
              Job History
            </CardTitle>
            <CardDescription>
              {filteredHistory.length} completed job{filteredHistory.length !== 1 ? 's' : ''}
              {historyDateFilter && ` on ${historyDateFilter}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filter controls */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="pl-8 w-[200px]"
                />
              </div>
              {historyDateFilter && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearDateFilter}
                  className="gap-1"
                >
                  <X className="size-3" />
                  Clear
                </Button>
              )}
            </div>

            {filteredHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {historyDateFilter
                  ? 'No completed jobs on this date'
                  : 'No completed jobs yet for this technician'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Completed Date</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>{job.completedDate || '—'}</TableCell>
                        <TableCell className="font-medium">{job.title}</TableCell>
                        <TableCell>{job.customerName || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-normal">
                            {getSourceBadgeLabel(job.source)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {job.notes || '—'}
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

        {/* Add Job Modal */}
        {user && currentOrgId && (
          <AddTechnicianJobModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSuccess={handleModalSuccess}
            technicianId={technicianId}
            orgId={currentOrgId}
            userId={user.id}
          />
        )}

        {/* Complete Job — Feedback Dialog */}
        <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Feedback</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Add feedback about this completed work..."
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  className="min-h-24 resize-none"
                  rows={4}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCompleteDialogOpen(false)
                    setJobToComplete(null)
                    setFeedbackNotes('')
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirmComplete} className="gap-2">
                  <CheckCircle2 className="size-4" />
                  Complete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* <-- NEW: Scan Barcode Dialog – visible only when scanDialogOpen is true */}
        {currentOrgId && (
          <ScanBarcodeDialog
            open={scanDialogOpen}
            onOpenChange={setScanDialogOpen}
            orgId={currentOrgId}
            categories={[]} // Technicians do not manage categories – the dialog works for scanning existing items
            onRefresh={loadTechnicianDetails}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
