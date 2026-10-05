import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Si el .env no está configurado (o sigue con los valores de ejemplo) la app muestra una guía en vez de romperse.
export const supabaseConfigurado =
  Boolean(url && key) && !url.includes('tu-proyecto') && !key.startsWith('tu-anon')

export const supabase = supabaseConfigurado ? createClient(url, key) : null

export const BUCKET_FIRMAS = 'firmas'
export const BUCKET_ACTAS_RESPALDOS = 'actas_respaldos'
