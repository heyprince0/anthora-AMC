"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabase, type Membership, type Invite } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { usePlanLimits } from "@/lib/hooks/use-plan-limits"
import LimitReachedModal from "@/components/billing/limit-reached-modal"
import { Plus, MoreHorizontal, Trash2, RotateCw } from "lucide-react"
import { toast } from "sonner"
import { InviteMemberModal } from "@/components/invite-member-modal"

interface MemberWithProfile extends Membership {
  email?: string
  full_name?: string
}

export default function TeamPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)

  const { maxTeamSeats, status, planName, isLoading: limitsLoading } = usePlanLimits(currentOrgId)

  // Current seats = all members EXCEPT the owner
  const currentTeamSeats = members.filter(m => m.user_id !== ownerId).length

  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalType, setLimitModalType] = useState<'expired' | 'resource-limit'>('expired')
  const [limitModalCustom, setLimitModalCustom] = useState<{ title?: string; description?: string }>({})

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("memberships")
        .select("org_id, role")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCurrentOrgId(data.org_id)
            setUserRole(data.role)
            loadTeamData(data.org_id)
          }
        })
    }
  }, [user?.id])

  // No auto-show on page load
  useEffect(() => {
    if (limitsLoading || !currentOrgId) return
  }, [limitsLoading, status])

  const loadTeamData = async (orgId: string) => {
    try {
      if (!orgId) return

      // 1. Fetch the organization to get owner_id
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("owner_id")
        .eq("id", orgId)
        .single()

      if (orgError) throw orgError
      let owner = orgData?.owner_id

      // 2. If owner_id is null, fallback to the oldest admin/owner membership
      if (!owner) {
        const { data: admins, error: adminsError } = await supabase
          .from("memberships")
          .select("user_id")
          .eq("org_id", orgId)
          .in("role", ["admin", "owner"])
          .order("created_at", { ascending: true })
          .limit(1)

        if (!adminsError && admins && admins.length > 0) {
          owner = admins[0].user_id
          // Optionally update the organizations table with this owner
          await supabase
            .from("organizations")
            .update({ owner_id: owner })
            .eq("id", orgId)
        }
      }
      setOwnerId(owner)

      // 3. Fetch memberships
      const { data: membershipsData, error: membershipsError } = await supabase
        .from("memberships")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })

      if (membershipsError) throw membershipsError

      const userIds = membershipsData.map((m) => m.user_id)

      // 4. Fetch profiles (full_name, company_name)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, company_name")
        .in("id", userIds)

      const profileMap = (profiles || []).reduce((acc, p) => {
        const name = p.full_name || p.company_name || null
        if (name) acc[p.id] = name
        return acc
      }, {} as Record<string, string>)

      // 5. Fetch company_profile (email)
      const { data: companyProfiles } = await supabase
        .from("company_profile")
        .select("user_id, email")
        .in("user_id", userIds)

      const emailMap = (companyProfiles || []).reduce((acc, cp) => {
        if (cp.email) acc[cp.user_id] = cp.email
        return acc
      }, {} as Record<string, string>)

      // 6. Build members list
      const membersWithProfiles: MemberWithProfile[] = []
      for (const membership of membershipsData || []) {
        let fullName = membership.display_name || undefined
        if (!fullName) {
          fullName = profileMap[membership.user_id]
        }
        if (!fullName && membership.email) {
          fullName = membership.email.split('@')[0]
        }
        if (!fullName) {
          fullName = `User ${membership.user_id.slice(0, 6)}`
        }
        membersWithProfiles.push({
          ...membership,
          full_name: fullName,
          email: membership.email || emailMap[membership.user_id],
        })
      }
      setMembers(membersWithProfiles)

      // 7. Fetch pending invites (status = 'pending')
      const { data: invitesData, error: invitesError } = await supabase
        .from("invites")
        .select("*")
        .eq("org_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })

      if (invitesError) throw invitesError

      // 8. Safeguard: exclude invites whose email already exists as a member
      const memberEmails = new Set(
        membersWithProfiles.map(m => m.email?.toLowerCase()).filter(Boolean)
      )
      const filteredInvites = (invitesData || []).filter(invite => {
        if (!invite.email) return true
        return !memberEmails.has(invite.email.toLowerCase())
      })

      setPendingInvites(filteredInvites)
    } catch (error) {
      console.error("[team] Error loading team data:", error)
      toast.error("Failed to load team data")
    } finally {
      setLoading(false)
    }
  }

  // Redirect non-admin users
  useEffect(() => {
    if (userRole && userRole !== "admin") {
      toast.error("You don't have permission to view this page")
    }
  }, [userRole])

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return
    try {
      const { data, error } = await supabase
        .from("memberships")
        .delete()
        .eq("id", memberId)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        toast.error("Member not found or you don't have permission to remove them")
        return
      }
      if (currentOrgId) loadTeamData(currentOrgId)
      toast.success("Member removed successfully")
    } catch (error) {
      console.error("[team] Error removing member:", error)
      toast.error(error instanceof Error ? error.message : "Failed to remove member")
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from("invites")
        .update({ status: "revoked" })
        .eq("id", inviteId)
        .eq("org_id", currentOrgId)
      if (error) throw error
      if (currentOrgId) loadTeamData(currentOrgId)
      toast.success("Invitation revoked")
    } catch (error) {
      console.error("[team] Error revoking invite:", error)
      toast.error("Failed to revoke invitation")
    }
  }

  const handleDeleteInvite = async (inviteId: string) => {
    if (!confirm("Permanently delete this invitation? The person will need to be re-invited.")) return
    try {
      const { error } = await supabase
        .from("invites")
        .delete()
        .eq("id", inviteId)
        .eq("org_id", currentOrgId)
      if (error) throw error
      if (currentOrgId) loadTeamData(currentOrgId)
      toast.success("Invitation deleted")
    } catch (error) {
      console.error("[team] Error deleting invite:", error)
      toast.error("Failed to delete invitation")
    }
  }

  const handleResendInvite = async (invite: Invite) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error("Your session has expired. Please log in again.")
        return
      }
      const response = await fetch("/api/invites/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ inviteId: invite.id }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.message || "Failed to resend invitation")
        return
      }
      if (data.emailWarning) {
        toast.warning(data.emailWarning)
      } else {
        toast.success("Invitation resent successfully!")
      }
    } catch (error) {
      console.error("[team] Error resending invite:", error)
      toast.error("Failed to resend invitation")
    }
  }

  const handleInviteMemberClick = () => {
    if (limitsLoading) {
      toast.error("Checking your plan status, please try again in a moment...")
      return
    }

    if (status === 'expired' || status === 'cancelled') {
      setLimitModalType('expired')
      setLimitModalCustom({
        title: `Your ${planName || 'current'} plan has expired`,
        description: `Renew your ${planName || 'current'} plan to continue inviting team members.`,
      })
      setShowLimitModal(true)
      return
    }

    // Log current values for debugging
    console.log("🔍 [Team] Owner ID:", ownerId)
    console.log("🔍 [Team] Total members:", members.length)
    console.log("🔍 [Team] Members excluding owner:", currentTeamSeats)
    console.log("🔍 [Team] Max seats from plan:", maxTeamSeats)

    if (maxTeamSeats !== null && maxTeamSeats > 0 && currentTeamSeats >= maxTeamSeats) {
      setLimitModalType('resource-limit')
      setLimitModalCustom({
        title: "You've reached your team seat limit",
        description: `Your current plan allows a maximum of ${maxTeamSeats} team members (excluding the owner). You currently have ${currentTeamSeats} members. Upgrade to add more team members.`,
      })
      setShowLimitModal(true)
      return
    }

    setInviteModalOpen(true)
  }

  const handleUpgrade = () => {
    window.location.href = '/billing'
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "technician":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getInitials = (name?: string, email?: string) => {
    if (name && name !== "Team Member" && name !== "User") {
      return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    }
    if (email) return email[0].toUpperCase()
    return "TM"
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Team</h1>
            <p className="text-muted-foreground">Manage your team members and invitations</p>
          </div>
          {userRole === "admin" && (
            <Button onClick={handleInviteMemberClick} disabled={limitsLoading}>
              <Plus className="mr-2 size-4" />
              Invite Member
            </Button>
          )}
        </div>

        {/* Members Section */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Team Members</h2>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading team members...</div>
          ) : members.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No team members yet
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => (
                <Card key={member.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <span className="text-sm font-semibold">
                            {getInitials(member.full_name, member.email)}
                          </span>
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {member.full_name || "Team Member"}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {member.email || `ID: ${member.user_id.slice(0, 8)}...`}
                          </CardDescription>
                        </div>
                      </div>
                      {userRole === "admin" && member.user_id !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleRemoveMember(member.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm text-muted-foreground">Role:</span>
                      <Badge className={getRoleColor(member.role)}>
                        {member.role === "admin" ? "Admin" : member.role === "technician" ? "Technician" : "Member"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Joined{" "}
                      {new Date(member.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Pending Invites Section */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Pending Invitations</h2>
          {pendingInvites.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No pending invitations
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingInvites.map((invite) => (
                <Card key={invite.id} className="border-dashed opacity-75">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {invite.display_name || invite.email}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {invite.email}
                        </CardDescription>
                      </div>
                      {userRole === "admin" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleResendInvite(invite)}>
                              <RotateCw className="mr-2 size-4" />
                              Resend
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRevokeInvite(invite.id)}
                              className="text-yellow-600"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Revoke
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteInvite(invite.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm text-muted-foreground">Role:</span>
                      <Badge className={getRoleColor(invite.role)}>
                        {invite.role === "admin" ? "Admin" : invite.role === "technician" ? "Technician" : "Member"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Invited{" "}
                      {new Date(invite.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Expires{" "}
                      {new Date(invite.expires_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <InviteMemberModal
          open={inviteModalOpen}
          onOpenChange={setInviteModalOpen}
          onSuccess={() => {
            if (currentOrgId) loadTeamData(currentOrgId)
          }}
        />

        <LimitReachedModal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          type={limitModalType}
          onUpgrade={handleUpgrade}
          customTitle={limitModalCustom.title}
          customDescription={limitModalCustom.description}
        />
      </div>
    </DashboardLayout>
  )
}
