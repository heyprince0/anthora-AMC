"use client"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { MembershipListener } from "@/components/membership-listener"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <main className="flex-1 min-w-0 w-full overflow-auto p-4 md:p-6">
          {children}
        </main>
        <MembershipListener />
      </SidebarInset>
    </SidebarProvider>
  )
}
