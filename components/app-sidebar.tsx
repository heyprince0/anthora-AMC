"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  FileText,
  Users,
  Wrench,
  Bell,
  History,
  BarChart3,
  Settings,
  FileCheck,
  Receipt,
  UsersRound,
  LogOut,
  CreditCard,
  UserCircle,
  Package,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { supabase, signOut } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { Download } from "lucide-react"
import { usePwaInstall } from "@/hooks/use-pwa-install"

const memberNavItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/" },
  { title: "Contracts", icon: FileText, href: "/contracts" },
  { title: "Quotations", icon: FileCheck, href: "/quotations" },
  { title: "Invoices", icon: Receipt, href: "/invoices" },
  { title: "Customers", icon: Users, href: "/customers" },
  { title: "Technicians", icon: Wrench, href: "/technicians" },
  { title: "Inventory", icon: Package, href: "/stocks" },
  { title: "Service Alerts", icon: Bell, href: "/alerts" },
  { title: "Service History", icon: History, href: "/history" },
  { title: "Reports", icon: BarChart3, href: "/reports" },
]

const adminOnlyNavItems = [
  { title: "Settings", icon: Settings, href: "/settings" },
  { title: "Team", icon: UsersRound, href: "/team" },
  { title: "Billing", icon: CreditCard, href: "/billing" },
]

const technicianNavItems = [
  { title: "Service History", icon: History, href: "/history" },
]

type CachedProfile = {
  companyName: string
  companySubtitle: string
  fullName: string
}

function getCachedProfile(userId: string | undefined): CachedProfile | null {
  if (!userId || typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(`profile_cache_${userId}`)
    if (!raw) return null
    return JSON.parse(raw) as CachedProfile
  } catch {
    return null
  }
}

function setCachedProfile(userId: string | undefined, profile: CachedProfile) {
  if (!userId || typeof window === "undefined") return
  try {
    window.localStorage.setItem(`profile_cache_${userId}`, JSON.stringify(profile))
  } catch {
    // ignore quota / privacy-mode errors, caching is best-effort only
  }
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, role, loading } = useAuth()
  const { isInstallable, isInstalled, installApp } = usePwaInstall()

  const [companyName, setCompanyName] = useState(
    () => getCachedProfile(user?.id)?.companyName || "Remindi"
  )
  const [companySubtitle, setCompanySubtitle] = useState(
    () => getCachedProfile(user?.id)?.companySubtitle || ""
  )
  const [fullName, setFullName] = useState(
    () => getCachedProfile(user?.id)?.fullName || ""
  )

  const [linkedTechnicianId, setLinkedTechnicianId] = useState<string | null>(null)
  const [linkedTechnicianName, setLinkedTechnicianName] = useState<string | null>(null)
  const [checkingLink, setCheckingLink] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return
      const { data } = await supabase
        .from('profiles')
        .select('company_name, full_name')
        .eq('id', user.id)
        .single()
      let nextCompanyName = "Remindi"
      let nextCompanySubtitle = ""
      let nextFullName = ""

      if (data?.company_name) {
        const names = data.company_name.split(' ')
        nextCompanyName = names[0] || "Remindi"
        nextCompanySubtitle = names.slice(1).join(' ') || ""
        setCompanyName(nextCompanyName)
        setCompanySubtitle(nextCompanySubtitle)
      }
      if (data?.full_name) {
        nextFullName = data.full_name
        setFullName(nextFullName)
      }

      setCachedProfile(user.id, {
        companyName: nextCompanyName,
        companySubtitle: nextCompanySubtitle,
        fullName: nextFullName,
      })
    }
    loadProfile()
  }, [user?.id])

  useEffect(() => {
    const checkLink = async () => {
      if (!user?.id || role !== 'technician') return
      setCheckingLink(true)
      const { data, error } = await supabase
        .from('technicians')
        .select('id, name')
        .eq('linked_user_id', user.id)
        .maybeSingle()
      if (!error && data?.id) {
        setLinkedTechnicianId(data.id)
        setLinkedTechnicianName(data.name)
      }
      setCheckingLink(false)
    }
    checkLink()
  }, [user?.id, role])

  const handleMyWorkClick = () => {
    if (linkedTechnicianId) {
      router.push(`/technicians/${linkedTechnicianId}`)
    } else {
      // No link: go to the technicians list page
      router.push('/technicians')
    }
  }

  let navItems
  if (role === 'admin') {
    navItems = [...memberNavItems, ...adminOnlyNavItems]
  } else if (role === 'technician') {
    navItems = technicianNavItems
  } else {
    navItems = memberNavItems
  }

  const handleLogout = async () => {
    try {
      await signOut()
      toast.success('Logged out successfully')
      router.push('/login')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to logout')
    }
  }

  if (loading) {
    return <div className="w-16 md:w-64 h-screen animate-pulse bg-muted/20" />
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="text-sm font-bold">{companyName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-foreground">{companyName}</span>
            {companySubtitle && (
              <span className="text-xs text-sidebar-foreground/70">{companySubtitle}</span>
            )}
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {role === 'technician' && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={!!linkedTechnicianId && pathname === `/technicians/${linkedTechnicianId}`}
                    tooltip="My Work"
                    onClick={handleMyWorkClick}
                    disabled={checkingLink}
                  >
                    <UserCircle className="size-4" />
                    <span>{linkedTechnicianName || 'My Work'}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Only visible when installable, hides once installed */}
              {isInstallable && !isInstalled && (
                <SidebarMenuItem>
                  <button
                    onClick={installApp}
                    className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 group-data-[collapsible=icon]:px-0 mt-1"
                    style={{
                      background: '#29ABE2',
                      boxShadow: '0 4px 14px rgba(41,171,226,.35)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1e96cc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#29ABE2')}
                  >
                    <Download className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">Install App</span>
                  </button>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-3">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
            <span className="text-xs font-medium">
              {fullName
                ? fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                : user?.email?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium text-sidebar-foreground">
              {fullName || user?.email || 'User'}
            </span>
            <span className="text-xs text-sidebar-foreground/70">
              {role === 'admin' ? 'Administrator' : role === 'technician' ? 'Technician' : 'Member'}
            </span>
          </div>
        </div>

        {(role === 'member' || role === 'technician') && (
          <div className="group-data-[collapsible=icon]:hidden">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <LogOut className="size-4" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
