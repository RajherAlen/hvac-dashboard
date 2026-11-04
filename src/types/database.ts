export type DeviceKind = 'split' | 'multisplit' | 'vrf' | 'toplinska_pumpa' | 'kotao' | 'plamenik' | 'ventilacija' | 'ostalo'
export type ServiceCaseStatus = 'due' | 'contacted' | 'scheduled' | 'snoozed' | 'declined' | 'done'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string | null
          /** Postoji tek nakon migracije 20261104_employee_status.sql */
          deactivated_at?: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          role: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          role?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          kind: 'private' | 'company'
          oib: string | null
          phone: string | null
          email: string | null
          notes: string | null
          needs_review: boolean
          created_by: string | null
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          name: string
          kind?: 'private' | 'company'
          oib?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          needs_review?: boolean
          created_by?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          kind?: 'private' | 'company'
          oib?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          needs_review?: boolean
          created_by?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      sites: {
        Row: {
          id: string
          client_id: string
          label: string | null
          address: string
          city: string | null
          postal_code: string | null
          access_notes: string | null
          needs_review: boolean
          created_by: string | null
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          label?: string | null
          address: string
          city?: string | null
          postal_code?: string | null
          access_notes?: string | null
          needs_review?: boolean
          created_by?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          label?: string | null
          address?: string
          city?: string | null
          postal_code?: string | null
          access_notes?: string | null
          needs_review?: boolean
          created_by?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          id: string
          site_id: string
          kind: DeviceKind
          brand: string | null
          model: string | null
          serial_number: string | null
          install_date: string | null
          warranty_until: string | null
          refrigerant: string | null
          capacity_kw: number | null
          placement: string | null
          service_interval_months: number
          notes: string | null
          needs_review: boolean
          created_by: string | null
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          site_id: string
          kind?: DeviceKind
          brand?: string | null
          model?: string | null
          serial_number?: string | null
          install_date?: string | null
          warranty_until?: string | null
          refrigerant?: string | null
          capacity_kw?: number | null
          placement?: string | null
          service_interval_months?: number
          notes?: string | null
          needs_review?: boolean
          created_by?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          site_id?: string
          kind?: DeviceKind
          brand?: string | null
          model?: string | null
          serial_number?: string | null
          install_date?: string | null
          warranty_until?: string | null
          refrigerant?: string | null
          capacity_kw?: number | null
          placement?: string | null
          service_interval_months?: number
          notes?: string | null
          needs_review?: boolean
          created_by?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      service_cases: {
        Row: {
          id: string
          site_id: string
          due_date: string
          status: ServiceCaseStatus
          contacted_at: string | null
          scheduled_for: string | null
          assigned_to: string | null
          snooze_until: string | null
          note: string | null
          work_log_id: string | null
          closed_at: string | null
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: Record<string, never>
        Update: {
          status?: ServiceCaseStatus
          contacted_at?: string | null
          scheduled_for?: string | null
          assigned_to?: string | null
          snooze_until?: string | null
          note?: string | null
        }
        Relationships: []
      }
      work_log_changes: {
        Row: {
          id: number
          work_log_id: string
          employee_id: string | null
          action: 'insert' | 'update' | 'delete'
          changed_by: string | null
          changed_at: string
          reason: string | null
          tx: number
          changes: Json
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      work_log_devices: {
        Row: {
          work_log_id: string
          device_id: string
          /** Postoji tek nakon migracije 20261107_service_cases.sql */
          is_service?: boolean
        }
        Insert: {
          work_log_id: string
          device_id: string
          is_service?: boolean
        }
        Update: {
          work_log_id?: string
          device_id?: string
        }
        Relationships: []
      }
      work_logs: {
        Row: {
          /** Postoji tek nakon migracije 20261106_work_log_audit.sql */
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          created_at: string | null
          employee_id: string
          hours_worked: number
          id: string
          location: string
          log_date: string
          notes: string | null
          /** Postoji tek nakon migracije 20261105_clients.sql */
          site_id?: string | null
          task_description: string
          updated_at: string | null
        }
        Insert: {
          /** Postoji tek nakon migracije 20261106_work_log_audit.sql */
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          created_at?: string | null
          employee_id: string
          hours_worked: number
          id?: string
          location: string
          log_date: string
          notes?: string | null
          /** Postoji tek nakon migracije 20261105_clients.sql */
          site_id?: string | null
          task_description: string
          updated_at?: string | null
        }
        Update: {
          /** Postoji tek nakon migracije 20261106_work_log_audit.sql */
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          created_at?: string | null
          employee_id?: string
          hours_worked?: number
          id?: string
          location?: string
          log_date?: string
          notes?: string | null
          /** Postoji tek nakon migracije 20261105_clients.sql */
          site_id?: string | null
          task_description?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      device_service_status: {
        Row: { device_id: string; last_service_date: string | null; next_service_due: string | null }
        Relationships: []
      }
    }
    Functions: {
      update_work_log: { Args: { p_id: string; p_values: Json; p_device_ids?: string[] | null; p_is_service?: boolean | null }; Returns: Database['public']['Tables']['work_logs']['Row'] }
      refresh_service_cases: { Args: { p_horizon_days?: number }; Returns: number }
      add_work_logs: { Args: { items: Json }; Returns: string[] }
      create_site_quick: {
        Args: { p_client_id: string | null; p_client_name: string | null; p_client_kind: string | null; p_address: string; p_city: string | null; p_label: string | null }
        Returns: Json
      }
      merge_sites: { Args: { from_id: string; into_id: string }; Returns: Json }
      merge_clients: { Args: { from_id: string; into_id: string }; Returns: Json }
      link_legacy_location: { Args: { p_location: string; p_site_id: string }; Returns: Json }
      employee_auth_status: {
        Args: Record<string, never>
        Returns: { id: string; last_sign_in_at: string | null; invited_at: string | null }[]
      }
      set_employee_active: {
        Args: { employee_id: string; active: boolean }
        Returns: Json
      }
      delete_employee: {
        Args: { employee_id: string }
        Returns: Json
      }
      invite_employee: {
        Args: { employee_email: string; employee_name: string; employee_role?: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
