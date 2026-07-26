import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'remindi-auth-token',
    },
  }
)

export const signIn = async (
  email: string,
  password: string
) => {
  const { data, error } = await supabase.auth
    .signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export const signUp = async (
  email: string,
  password: string
) => {
  const { data, error } = await supabase.auth
    .signUp({ email, password })
  if (error) throw error
  return data
}

export const signInWithGoogle = async () => {
  const { error } = await supabase.auth
    .signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin +
          '/auth/callback'
      }
    })
  if (error) throw error
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const calculateNextServiceDate = (
  startDate: string,
  frequencyDays: number
): string => {
  const [year, month, day] = startDate.split('-').map(Number)
  const date = new Date(year, month - 1, day) // local time, no UTC shift
  date.setDate(date.getDate() + frequencyDays)

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
   return `${y}-${m}-${d}` // manual format, no toISOString()
}
export type Customer = {
  id: string
  user_id: string
  org_id?: string
  name: string
  phone: string
  email?: string
  address: string
  created_at: string
}

export type Contract = {
  id: string
  user_id: string
  customer_id: string
  contract_name: string
  frequency_days: number
  start_date: string
  next_service_date: string
  status: string
  notes: string
  contracts_price: number | null
  duration_years?: number
  contract_type?: 'new' | 'old'
  created_at: string
}

export type Technician = {
  id: string
  user_id: string
  name: string
  phone: string
  specialization: string
  status: string
  created_at: string
}

export type ServiceHistory = {
  id: string
  contract_id: string
  technician_id: string
  org_id?: string
  service_date: string
  service_end_date?: string
  status: string
  notes: string
  price: number | null
  source?: 'manual' | 'service_alert'
  created_at: string
}

export type TechnicianJob = {
  id: string
  org_id: string
  technician_id: string
  customer_id: string | null
  contract_id: string | null
  title: string
  notes: string | null
  assigned_date: string
  due_date: string | null
  status: 'pending' | 'completed'
  source: 'manual' | 'service_alert'
  completed_at: string | null
  created_at: string
}

export type Profile = {
  id: string
  full_name: string | null
  company_name: string | null
  phone: string | null
  city: string | null
  service_types: string[] | null
}

export const getDaysUntilService = (nextServiceDate: string): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [year, month, day] = nextServiceDate.split('-').map(Number)
  const serviceDate = new Date(year, month - 1, day)
  serviceDate.setHours(0, 0, 0, 0)
  if (isNaN(serviceDate.getTime())) return 0
  const diffTime = serviceDate.getTime() - today.getTime()
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

export const getAuthUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Quotations
export type QuotationItem = {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export type Quotation = {
  id: string
  user_id: string
  quote_no: string
  client_name: string
  client_address: string | null
  client_city: string | null
  client_district: string | null
  client_state: string | null
  client_pin_code: string | null
  client_gstin: string | null
  subject: string | null
  body_text: string | null
  items: QuotationItem[]
  subtotal: number
  discount_type?: "percentage" | "fixed" | null
  discount_value?: number | null
  discount_amount?: number | null
  sgst: number
  cgst: number
  grand_total: number
  include_gst: boolean
  gst_rate: number
  notes: string | null
  status: string
  valid_till: string | null
  invoice_id: string | null
  created_at: string
  updated_at: string
}

export type CompanyProfile = {
  id: string
  user_id: string
  company_name: string | null
  tagline: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  gstin: string | null
  pan_number: string | null
  logo_url: string | null
  theme_color: string
  header_style?: "single_logo" | "thumbnail"
  header_thumbnail_url?: string | null
  stamp_url?: string | null
  signature_url?: string | null
  show_stamp_on_quotation?: boolean
  show_stamp_on_invoice?: boolean
  show_signature_on_quotation?: boolean
  show_signature_on_invoice?: boolean
  created_at: string
  updated_at: string
}

export type Invoice = {
  id: string
  user_id: string
  org_id: string
  quotation_id: string | null
  invoice_no: string
  order_no: string | null
  order_date: string | null
  invoice_date: string
  due_date: string | null
  payment_terms: string | null
  payment_status: "Unpaid" | "Partial" | "Paid"
  notes: string | null
  client_name: string
  client_address: string | null
  client_district: string | null
  client_state: string | null
  client_pin_code: string | null
  subject: string | null
  body_text: string | null
  items: QuotationItem[]
  subtotal: number
  sgst: number
  cgst: number
  grand_total: number
  include_gst: boolean
  gst_rate: number
  created_at: string
  updated_at: string
  client_gstin?: string
}

// Team Management Types
export type Organization = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type Membership = {
  id: string
  org_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
}

export type Invite = {
  id: string
  org_id: string
  email: string
  role: 'admin' | 'member'
  token: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  inviter_id: string
  created_at: string
  expires_at: string
  accepted_at: string | null
}

// TODO: Add org-scoped queries for memberships and invites
// Example: const getMembersForOrg = async (orgId: string) => { ... filter by org_id ... }
// Example: const getInvitesForOrg = async (orgId: string) => { ... filter by org_id ... }
