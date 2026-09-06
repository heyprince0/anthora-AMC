'use client'

import { useEffect, useState, useMemo, useRef, type ChangeEvent } from 'react'
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
import { ArrowLeft, Phone, Wrench, Plus, CheckCircle2, Trash2, CalendarIcon, X, ScanBarcode, Camera, Loader2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { AddTechnicianJobModal } from '@/components/add-technician-job-modal'
import { Input } from '@/components/ui/input'
import ScanBarcodeDialog from '../../stocks/components/ScanBarcodeDialog'

interface JobWithCustomer extends TechnicianJob {
  customerName: string | null
}

interface HistoryDisplayItem {
  id: string
  completedDate: string | null
  title: string
  customerName: string | null
  source: 'manual' | 'service_alert' | 'service_history'
  notes: string | null
  photoUrl: string | null
  contractId: string | null
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
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('')
  const HISTORY_PAGE_SIZE = 10
  const [historyVisibleCount, setHistoryVisibleCount] = useState<number>(HISTORY_PAGE_SIZE)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [jobToComplete, setJobToComplete] = useState<JobWithCustomer | null>(null)
  const [feedbackNotes, setFeedbackNotes] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
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

  useEffect(() => {
    if (currentOrgId && technicianId) {
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
            if (data.linked_user_id && data.linked_user_id !== user.id) {
              router.push('/technicians')
              return
            }
            setIsOwnProfile(data.linked_user_id === user.id)
            loadTechnicianDetails()
          })
      } else {
        loadTechnicianDetails()
      }
    }
  }, [currentOrgId, technicianId, role, user?.id, router])

  const loadTechnicianDetails = async () => {
    try {
      if (!currentOrgId) return

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

      const { data: assignedJobsData, error: assignedJobsError } = await supabase
        .from('technician_jobs')
        .select('*')
        .eq('technician_id', technicianId)
        .eq('status', 'pending')
        .eq('org_id', currentOrgId)
        .order('due_date', { ascending: true, nullsFirst: true })

      if (assignedJobsError) throw assignedJobsError

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
          photoUrl: job.photo_url,
          contractId: job.contract_id,
        }
      })

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
          photoUrl: record.photo_url,
          contractId: record.contract_id,
        }
      })

      const jobCompletionKeys = new Set(
        historyFromJobs
          .filter((item) => item.contractId && item.completedDate)
          .map((item) => `${item.contractId}|${item.completedDate}`)
      )
      const dedupedHistoryFromServiceHistory = historyFromServiceHistory.filter((item) => {
        if (!item.contractId || !item.completedDate) return true
        return !jobCompletionKeys.has(`${item.contractId}|${item.completedDate}`)
      })

      const combinedHistory = [...historyFromJobs, ...dedupedHistoryFromServiceHistory].sort((a, b) => {
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

  const compressPhoto = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 1280 / image.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Could not prepare image'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not compress image')), 'image/jpeg', 0.75)
      }
      image.onerror = () => reject(new Error('Could not read image'))
      image.src = URL.createObjectURL(file)
    })

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setSelectedPhoto(file)
    setPhotoPreviewUrl(URL.createObjectURL(file))
  }

  const clearSelectedPhoto = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setSelectedPhoto(null)
    setPhotoPreviewUrl(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const openCompleteDialog = (job: JobWithCustomer) => {
    setJobToComplete(job)
    setFeedbackNotes('')
    clearSelectedPhoto()
    setCompleteDialogOpen(true)
  }

  const handleConfirmComplete = async () => {
    if (!currentOrgId || !jobToComplete || isCompleting) return
    setIsCompleting(true)
    try {
      const completionNotes = feedbackNotes.trim() || jobToComplete.notes
      let photoUrl: string | null = null

      if (selectedPhoto) {
        try {
          const compressedPhoto = await compressPhoto(selectedPhoto)
          const photoPath = `${currentOrgId}/${jobToComplete.id}-${Date.now()}.jpg`
          const { error: uploadError } = await supabase.storage
            .from('job-photos')
            .upload(photoPath, compressedPhoto, { contentType: 'image/jpeg', upsert: false })
          if (uploadError) throw uploadError
          photoUrl = supabase.storage.from('job-photos').getPublicUrl(photoPath).data.publicUrl
        } catch (photoError) {
          console.error('Error uploading job photo:', photoError)
          toast.warning('Job will be completed, but the photo failed to upload')
        }
      }

      const { error } = await supabase
        .from('technician_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: completionNotes,
          photo_url: photoUrl,
        })
        .eq('id', jobToComplete.id)
        .eq('org_id', currentOrgId)

      if (error) throw error

      if (jobToComplete.contract_id) {
        try {
          const today = new Date().toISOString().split('T')[0]

          const { data: contractData, error: contractFetchError } = await supabase
            .from('contracts')
            .select('*')
            .eq('id', jobToComplete.contract_id)
            .eq('org_id', currentOrgId)
            .single()

          if (contractFetchError) throw contractFetchError

          const { error: historyError } = await supabase
            .from('service_history')
            .insert({
              contract_id: jobToComplete.contract_id,
              technician_id: technicianId,
              service_date: today,
              status: 'completed',
              notes: completionNotes || null,
              photo_url: photoUrl,
              org_id: currentOrgId,
            })

          if (historyError) throw historyError

          if (contractData?.frequency_days != null) {
            const nextServiceDate = new Date(today)
            nextServiceDate.setDate(nextServiceDate.getDate() + contractData.frequency_days)

            const { error: contractUpdateError } = await supabase
              .from('contracts')
              .update({
                start_date: today,
                next_service_date: nextServiceDate.toISOString().split('T')[0],
                status: 'active',
              })
              .eq('id', jobToComplete.contract_id)
              .eq('org_id', currentOrgId)

            if (contractUpdateError) throw contractUpdateError
          }
        } catch (linkError) {
          console.error('Error syncing linked service alert completion:', linkError)
          toast.warning('Job marked complete, but the linked service record may not be fully updated')
        }
      }

      toast.success('Job marked as complete!')
      setCompleteDialogOpen(false)
      setJobToComplete(null)
      setFeedbackNotes('')
      clearSelectedPhoto()
      loadTechnicianDetails()
    } catch (error) {
      console.error('Error marking job complete:', error)
      toast.error('Failed to mark job as complete')
    } finally {
      setIsCompleting(false)
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

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500'
      case 'busy': return 'bg-yellow-500'
      case 'on-leave': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const getSourceBadgeLabel = (source: HistoryDisplayItem['source']) => {
    switch (source) {
      case 'service_alert': return 'From Service Alert'
      case 'service_history': return 'Service Record'
      default: return 'Manual'
    }
  }

  const filteredHistory = useMemo(() => {
    if (!historyDateFilter) return jobHistory
    return jobHistory.filter(item => item.completedDate === historyDateFilter)
  }, [jobHistory, historyDateFilter])

  const visibleHistory = useMemo(() => {
    return filteredHistory.slice(0, historyVisibleCount)
  }, [filteredHistory, historyVisibleCount])

  const hasMoreHistory = filteredHistory.length > historyVisibleCount

  const handleLoadMoreHistory = () => {
    setHistoryVisibleCount((prev) => prev + HISTORY_PAGE_SIZE)
  }

  const clearDateFilter = () => {
    setHistoryDateFilter('')
    setHistoryVisibleCount(HISTORY_PAGE_SIZE)
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

  const showBackButton = !(role === 'technician' && isOwnProfile)

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
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
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-4 md:hidden">
                  {assignedJobs.map((job) => (
                    <Card key={job.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Wrench className="size-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="truncate text-sm font-semibold">{job.title}</CardTitle>
                              <CardDescription className="mt-0.5 truncate text-xs">{job.customerName || 'No customer'}</CardDescription>
                            </div>
                          </div>
                          <Badge className="shrink-0 bg-blue-100 text-blue-800 border-blue-200">Pending</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          <div><p className="text-xs text-muted-foreground">Assigned Date</p><p className="text-sm font-medium">{job.assigned_date}</p></div>
                          <div><p className="text-xs text-muted-foreground">Due Date</p><p className="text-sm font-medium">{job.due_date || '—'}</p></div>
                          <div className="col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm font-medium line-clamp-2">{job.notes || '—'}</p></div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" className="gap-2" onClick={() => openCompleteDialog(job)}><CheckCircle2 className="size-4" />Complete</Button>
                            {job.customer_id && <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${job.customer_id}`)}>View</Button>}
                            {role !== 'technician' && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-600" onClick={() => handleDeleteJob(job.id)}><Trash2 className="size-4" /><span className="sr-only">Delete job</span></Button>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Job History Section */}
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
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={historyDateFilter}
                  onChange={(e) => {
                    setHistoryDateFilter(e.target.value)
                    setHistoryVisibleCount(HISTORY_PAGE_SIZE)
                  }}
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
              <>
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Completed Date</TableHead>
                        <TableHead>Job Title</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Image</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleHistory.map((job) => (
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
                          <TableCell>
                            {job.photoUrl ? (
                              <button
                                type="button"
                                onClick={() => setPhotoModalUrl(job.photoUrl)}
                                className="block overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`View photo for ${job.title}`}
                              >
                                <img src={job.photoUrl} alt="Completed work" className="size-10 rounded-md object-cover" />
                              </button>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-4 md:hidden">
                  {visibleHistory.map((job) => (
                    <Card key={job.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <CheckCircle2 className="size-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="truncate text-sm font-semibold">{job.title}</CardTitle>
                              <CardDescription className="mt-0.5 truncate text-xs">{job.customerName || 'No customer'}</CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-xs font-normal">
                            {getSourceBadgeLabel(job.source)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          <div><p className="text-xs text-muted-foreground">Completed</p><p className="text-sm font-medium">{job.completedDate || '—'}</p></div>
                          {job.photoUrl && (
                            <div>
                              <p className="text-xs text-muted-foreground">Photo</p>
                              <button
                                type="button"
                                onClick={() => setPhotoModalUrl(job.photoUrl)}
                                className="mt-1 block overflow-hidden rounded-md focus-visible:outline-none"
                              >
                                <img src={job.photoUrl} alt="Work photo" className="size-12 rounded-md object-cover" />
                              </button>
                            </div>
                          )}
                          <div className="col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm font-medium line-clamp-2">{job.notes || '—'}</p></div>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-2">
                          <span className="text-xs text-muted-foreground">Job History</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {hasMoreHistory && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMoreHistory}
                    >
                      View More ({filteredHistory.length - historyVisibleCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Modals */}
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
              <div className="space-y-2">
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="sr-only" />
                {photoPreviewUrl ? (
                  <div className="relative overflow-hidden rounded-lg border border-border">
                    <img src={photoPreviewUrl} alt="Selected completed work" className="max-h-56 w-full object-cover" />
                    <Button type="button" variant="secondary" size="sm" onClick={clearSelectedPhoto} className="absolute right-2 top-2">
                      Remove
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 py-8 text-center text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Camera className="size-6" />
                    <span className="text-sm">Tap to add a photo of the completed work</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCompleteDialogOpen(false)
                    setJobToComplete(null)
                    setFeedbackNotes('')
                    clearSelectedPhoto()
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirmComplete} className="gap-2" disabled={isCompleting}>
                  {isCompleting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {isCompleting ? 'Uploading...' : 'Complete'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!photoModalUrl} onOpenChange={(open) => !open && setPhotoModalUrl(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Completed Work Photo</DialogTitle>
            </DialogHeader>
            {photoModalUrl && (
              <img src={photoModalUrl} alt="Full-size completed work" className="max-h-[70vh] w-full rounded-lg object-contain" />
            )}
          </DialogContent>
        </Dialog>

        {currentOrgId && (
          <ScanBarcodeDialog
            open={scanDialogOpen}
            onOpenChange={setScanDialogOpen}
            orgId={currentOrgId}
            categories={[]}
            onRefresh={loadTechnicianDetails}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
