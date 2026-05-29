export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      eventos: {
        Row: {
          id: string
          nombre: string
          venue: string | null
          tema: string
          latitud: number
          longitud: number
          radio_metros: number
          zonas: string[]
          cover: string | null
          activo: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['eventos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['eventos']['Insert']>
      }
      nodos_activos: {
        Row: {
          id: string
          usuario_id: string
          evento_id: string
          peer_id_webrtc: string
          zona_recinto: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['nodos_activos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['nodos_activos']['Insert']>
      }
      mensajes: {
        Row: {
          id: string
          evento_id: string
          zona_recinto: string
          usuario_id: string
          usuario_nombre: string | null
          texto: string
          hot: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['mensajes']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['mensajes']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
