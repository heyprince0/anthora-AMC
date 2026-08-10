'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase, type Contract, type Technician } from '@/lib/supabase'
import { toast } from 'sonner'

interface AssignTechnicianModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: Contract | null
  orgId: string
  onSuccess: () => void
}

// Lets the user pick a technician for a service alert. On confirm, this
// creates a *pending* technician_jobs row (source: 'service_alert') linked
// to the contract — the same shape of row the technician detail page
// already reads and displays under "Assigned Jobs". No existing job
// creation/completion logic is touched; this only adds a new entry point.
export function AssignTechnicianModal({
  open,
  onOpenChange,
  contract,
  orgId,
  onSuccess,
}: AssignTechnicianModalProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [technicianId, setTechnicianId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loadingTechs, setLoadingTechs] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTechnicianId('')
      setDueDate(new Date().toISOString().split('T')[0])
      loadTechnicians()
    }
  }, [open, contract])

  const loadTechnicians = async () => {
    if (!orgId) return
    try {
      setLoadingTechs(true)
      const { data, error } = await supabase
        .from('technicians')
        .select('*')
        .eq('org_id', orgId)
        .order('name', { ascending: true })

      if (error) throw error
      setTechnicians((data as Technician[]) || [])
    } catch (error) {
      console.error('Error loading technicians:', error)
      toast.error('Failed to load technicians')
    } finally {
      setLoadingTechs(false)
    }
  }

  const handleConfirm = async () => {
    if (!contract) return
    if (!technicianId) {
      toast.error('Please select a technician')
      return
    }

    setSubmitting(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      // If this contract already has a pending assignment (from an earlier
      // "Assign Technician" / "Reassign"), remove it first — otherwise the
      // previously assigned technician keeps seeing it in their profile,
      // and the alert ends up matched to two pending jobs at once.
      const { error: deleteError } = await supabase
        .from('technician_jobs')
        .delete()
        .eq('org_id', orgId)
        .eq('contract_id', contract.id)
        .eq('source', 'service_alert')
        .eq('status', 'pending')

      if (deleteError) throw deleteError

      const { error } = await supabase
        .from('technician_jobs')
        .insert({
          org_id: orgId,
          technician_id: technicianId,
          customer_id: contract.customer_id,
          contract_id: contract.id,
          title: contract.contract_name,
          notes: 'Scheduled AMC servicing visit',
          assigned_date: today,
          due_date: dueDate || null,
          status: 'pending',
          source: 'service_alert',
        })

      if (error) throw error
      toast.success('Service assigned to technician!')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error('Error assigning technician:', error)
      toast.error('Failed to assign technician')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Technician</DialogTitle>
          <DialogDescription>
            {contract
              ? `Assign a technician to handle "${contract.contract_name}". It will appear in their assigned jobs.`
              : 'Select a technician for this service'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="assign-technician">Technician</Label>
            <Select value={technicianId} onValueChange={setTechnicianId} disabled={loadingTechs}>
              <SelectTrigger id="assign-technician">
                <SelectValue placeholder={loadingTechs ? 'Loading...' : 'Select a technician'} />
              </SelectTrigger>
              <SelectContent>
                {technicians.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No technicians available
                  </SelectItem>
                ) : (
                  technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assign-due-date">Due Date</Label>
            <Input
              id="assign-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || loadingTechs}>
            {submitting ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
