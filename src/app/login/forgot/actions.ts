"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export async function requestPasswordReset(formData:FormData){
  const email=String(formData.get("email")||"").trim().toLowerCase();
  const supabase=await createClient();
  await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/update-password`});
  redirect("/login?message=If%20the%20account%20exists,%20a%20password%20reset%20link%20has%20been%20sent.");
}
