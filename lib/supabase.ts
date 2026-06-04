import { createClient } from "@supabase/supabase-js";

// 🔑 ဒီနေရာမှာ Supabase URL + Key ထည့်မယ်
const supabaseUrl = "https://abmakbhenphucdxectgl.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibWFrYmhlbnBodWNkeGVjdGdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTg0NDgsImV4cCI6MjA5NTg3NDQ0OH0.DE77DNsTkZtkOisouVIYoKgVFvDrLJoEXB_vWk4Jp9I";

// 🚀 Supabase client ဖန်တီး
export const supabase = createClient(supabaseUrl, supabaseAnonKey);