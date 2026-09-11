"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData:FormData){
  const password=String(formData.get("password")||"");
  const confirmation=String(formData.get("confirmation")||"");
  if(password.length<12)redirect("/auth/update-password?error=Use%20at%20least%2012%20characters.");
  if(password!==confirmation)redirect("/auth/update-password?error=Passwords%20do%20not%20match.");
  const supabase=await createClient();
  const {error}=await supabase.auth.updateUser({password});
  if(error)redirect(`/auth/update-password?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}
