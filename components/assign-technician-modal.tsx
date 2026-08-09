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
  const [loadingTechs, setLoadingTechs] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTechnicianId('')
      loadTechnicians()
    }
  }, [open])

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

      const { error } = await supabase
        .from('technician_jobs')
        .insert({
          org_id: orgId,
          technician_id: technicianId,
          customer_id: contract.customer_id,
          contract_id: contract.id,
          title: contract.contract_name,
          notes: null,
          assigned_date: today,
          due_date: contract.next_service_date || null,
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

        <div className="flex flex-col gap-2 py-2">
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
