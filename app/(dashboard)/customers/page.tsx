"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { supabase, type Customer, type Contract } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import LimitReachedModal from "@/components/billing/limit-reached-modal"
import { Plus, Search, MoreHorizontal, Eye, Edit, Phone, MapPin, FileText, Trash2, Check, ChevronsUpDown } from "lucide-react"
import { toast } from "sonner"
import { AddCustomerModal } from "@/components/add-customer-modal"
import Link from "next/link"

export default function CustomersPage() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<(Customer & { contractCount: number })[]>([])
  const [filteredCustomers, setFilteredCustomers] = useState<(Customer & { contractCount: number })[]>([])
  const [allContracts, setAllContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterLocation, setFilterLocation] = useState("all") // location filter, same as Contracts page
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<(Customer & { contractCount: number }) | null>(null)
  const [deleting, setDeleting] = useState(false)

  // --- Org state ---
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  // Plan limits
  const { maxCustomers, currentCustomerCount, status, planName, isLoading: limitsLoading } = usePlanLimits(currentOrgId)

  // Limit modal state
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalType, setLimitModalType] = useState<'expired' | 'resource-limit'>('expired')
  const [limitModalCustom, setLimitModalCustom] = useState<{ title?: string; description?: string }>({})

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
    if (currentOrgId) {
      loadCustomers()
    }
  }, [currentOrgId])

  // ✅ REMOVED: auto-show on page load – modal only triggers from button

  const loadCustomers = async () => {
    try {
      if (!currentOrgId) return

      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('org_id', currentOrgId)

      if (customersError) throw customersError

      const { data: contractsData } = await supabase
        .from('contracts')
        .select('*')
        .eq('org_id', currentOrgId)

      const customersWithContracts = (customersData as Customer[]).map(customer => {
        const contractCount = (contractsData as Contract[])?.filter(c => c.customer_id === customer.id).length || 0
        return {
          ...customer,
          contractCount
        }
      })

      setAllContracts((contractsData as Contract[]) || [])
      setCustomers(customersWithContracts)
      setFilteredCustomers(customersWithContracts)
    } catch (error) {
      console.error('Error loading customers:', error)
      toast.error('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  // Distinct, non-empty locations pulled from existing contracts — the Location
  // filter dropdown populates itself from whatever locations users have entered
  // on their contracts, same as the Contracts page.
  const availableLocations = Array.from(
    new Set(
      allContracts
        .map(c => c.location?.trim())
        .filter((loc): loc is string => !!loc)
    )
  ).sort()

  const handleFilter = (term: string, location: string) => {
    let filtered = customers

    if (term) {
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(term.toLowerCase()) ||
        c.phone.includes(term) ||
        (c.email && c.email.toLowerCase().includes(term.toLowerCase()))
      )
    }

    if (location !== 'all') {
      filtered = filtered.filter(c =>
        allContracts.some(contract => contract.customer_id === c.id && contract.location === location)
      )
    }

    setFilteredCustomers(filtered)
  }

  const handleSearch = (term: string) => {
    setSearchTerm(term)
    handleFilter(term, filterLocation)
  }

  useEffect(() => {
    handleFilter(searchTerm, filterLocation)
  }, [filterLocation, customers, allContracts])

  const handleDelete = async () => {
    if (!customerToDelete || !currentOrgId) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerToDelete.id)
        .eq('org_id', currentOrgId)
      if (error) throw error
      setCustomers(customers.filter(c => c.id !== customerToDelete.id))
      toast.success('Customer deleted successfully')
      setDeleteDialogOpen(false)
      setCustomerToDelete(null)
    } catch (error) {
      console.error('Error deleting customer:', error)
      toast.error('Failed to delete customer')
    } finally {
      setDeleting(false)
    }
  }

  // ✅ Check limits – only called from Add button
  const checkAndShowLimitModal = () => {
    if (status === 'expired' || status === 'cancelled') {
      setLimitModalType('expired')
      setLimitModalCustom({
        title: `Your ${planName || 'current'} plan has expired`,
        description: `Renew your ${planName || 'current'} plan to continue adding customers.`,
      })
      setShowLimitModal(true)
      return true
    }
    if (maxCustomers > 0 && currentCustomerCount >= maxCustomers) {
      setLimitModalType('resource-limit')
      setLimitModalCustom({
        title: "You've reached your customer limit",
        description: `Your current plan allows a maximum of ${maxCustomers} customers. You have already created ${currentCustomerCount}. Upgrade to manage more customers.`,
      })
      setShowLimitModal(true)
      return true
    }
    return false
  }

  const handleAddClick = () => {
    if (limitsLoading) {
      toast.error("Checking your plan status, please try again in a moment...")
      return
    }
    if (checkAndShowLimitModal()) return
    setEditingCustomer(null)
    setModalOpen(true)
  }

  const handleEditClick = (customer: Customer & { contractCount: number }) => {
    setEditingCustomer(customer)
    setModalOpen(true)
  }

  const handleModalSuccess = () => {
    loadCustomers()
  }

  const handleUpgrade = () => {
    window.location.href = '/billing'
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-muted-foreground">Manage your customers and their contact information</p>
          </div>
          <Button onClick={handleAddClick} disabled={limitsLoading}>
            <Plus className="mr-2 size-4" />
            Add Customer
          </Button>
        </div>

        {/* Search + Location Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center flex-wrap">
              <div className="relative flex-1 min-w-[150px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search customers by name, email, or phone..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>

              {/* Location Filter — searchable combobox. Options populate
                  automatically from whatever locations users have entered
                  on their contracts; typing filters the list live. */}
              <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={locationPopoverOpen}
                    className="w-[160px] justify-between font-normal"
                  >
                    <span className="truncate">
                      {filterLocation === "all" ? "Location" : filterLocation}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search location..." />
                    <CommandList>
                      <CommandEmpty>No location found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all"
                          onSelect={() => {
                            setFilterLocation("all")
                            setLocationPopoverOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 size-4",
                              filterLocation === "all" ? "opacity-100" : "opacity-0"
                            )}
                          />
                          All Locations
                        </CommandItem>
                        {availableLocations.map((loc) => (
                          <CommandItem
                            key={loc}
                            value={loc}
                            onSelect={() => {
                              setFilterLocation(filterLocation === loc ? "all" : loc)
                              setLocationPopoverOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 size-4",
                                filterLocation === loc ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="truncate">{loc}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Customers Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="text-center py-8 col-span-full text-muted-foreground">Loading customers...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 col-span-full text-muted-foreground">
              {searchTerm ? 'No customers found matching your search' : 'No customers yet'}
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <Card key={customer.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                        <span className="text-lg font-semibold text-primary">
                          {customer.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <CardTitle className="text-base">{customer.name}</CardTitle>
                        {customer.email && (
                          <CardDescription className="text-xs">{customer.email}</CardDescription>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditClick(customer)}>
                          <Edit className="mr-2 size-4" />
                          Edit Customer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { setCustomerToDelete(customer); setDeleteDialogOpen(true) }}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="size-4" />
                    <span>{customer.phone}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{customer.address}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="text-foreground font-medium">{customer.contractCount}</span>
                      <span className="text-muted-foreground">contracts</span>
                    </div>
                    <Link href={`/customers/${customer.id}`}>
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Eye className="size-4" />
                        View
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Add/Edit Customer Modal */}
        {user && currentOrgId && (
          <AddCustomerModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSuccess={handleModalSuccess}
            editingCustomer={editingCustomer}
            userId={user.id}
            orgId={currentOrgId}
          />
        )}

        {/* Limit Reached Modal – only shows when triggered by Add button */}
        <LimitReachedModal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          type={limitModalType}
          onUpgrade={handleUpgrade}
          customTitle={limitModalCustom.title}
          customDescription={limitModalCustom.description}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Customer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {customerToDelete?.name}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  )
}
