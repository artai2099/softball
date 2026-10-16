"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmation=String(formData.get("confirmation")||"");
  const displayName = String(formData.get("displayName") || "").trim();
  if(password.length<12)redirect("/login?mode=signup&error=Use%20at%20least%2012%20characters.");
  if(password!==confirmation)redirect("/login?mode=signup&error=Passwords%20do%20not%20match.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } }
  });
  if (error) redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);

  // Supabase email confirmation is disabled, so new users can sign in immediately.
  // Send a separate registration notification through Resend when configured.
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (resendApiKey && fromEmail) {
    const safeName = displayName.replace(/[<>]/g, "").trim() || "there";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: "Welcome to GameDay Pro — your account is registered",
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:0 auto"><h1 style="color:#087f5b">Welcome to GameDay Pro!</h1><p>Hi ${safeName},</p><p>Your GameDay Pro account has been registered successfully.</p><p>You can now sign in and start managing your teams and games.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}/login" style="display:inline-block;background:#087f5b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Sign in to GameDay Pro</a></p><p>If you did not create this account, you can safely ignore this email.</p></div>`
        })
      });
      if (!response.ok) {
        console.error("Registration notification email failed:", response.status, await response.text());
      }
    } catch (emailError) {
      console.error("Registration notification email could not be sent:", emailError);
    }
  } else {
    console.warn("Registration notification email skipped: configure RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }

  if (data.session) redirect("/dashboard");
  redirect("/login?message=Your%20account%20is%20registered.%20You%20can%20sign%20in%20now.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore=await cookies();
  cookieStore.delete("gameday_org");
  redirect("/");
}
