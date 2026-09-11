"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function switchOrganization(formData:FormData){
  const organizationId=String(formData.get("organizationId")||"");
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("organization_id",organizationId).eq("user_id",user.id).single();
  if(!membership)throw new Error("You do not belong to that organization.");
  const cookieStore=await cookies();
  cookieStore.set("gameday_org",organizationId,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*365});
  redirect("/dashboard");
}
