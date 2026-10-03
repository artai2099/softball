"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireUser,
  requireMembership,
} from "@/lib/auth";

async function getTeamAccess(
  supabase: any,
  userId: string,
  teamId: string,
) {
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, organization_id")
    .eq("id", teamId)
    .single();

  if (teamError || !team) {
    throw new Error("Team not found.");
  }

  const { data: orgMember, error: orgError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", team.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (orgError) {
    throw new Error(orgError.message);
  }

  const { data: teamMember, error: memberError } = await supabase
    .from("team_memberships")
    .select("id, role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) {
    throw new Error(memberError.message);
  }

  return {
    team,
    orgRole: orgMember?.role ?? null,
    teamRole: teamMember?.role ?? null,
  };
}

export async function addPlayer(teamId: string, formData: FormData) {
  const { supabase, user } = await requireUser();

  const { orgRole, teamRole } = await getTeamAccess(
    supabase,
    user.id,
    teamId,
  );

  const canManage =
    ["owner", "admin"].includes(orgRole ?? "") ||
    teamRole === "manager";

  if (!canManage) {
    throw new Error(
      "You do not have permission to manage this team.",
    );
  }

  const firstName = String(
    formData.get("firstName") || "",
  ).trim();

  const lastName = String(
    formData.get("lastName") || "",
  ).trim();

  const jerseyNumber = Number(
    formData.get("jerseyNumber"),
  );

  const position = String(
    formData.get("position") || "",
  ).trim();

  if (!firstName || !lastName) {
    throw new Error(
      "First and last name are required.",
    );
  }

  if (
    !Number.isInteger(jerseyNumber) ||
    jerseyNumber < 0 ||
    jerseyNumber > 999
  ) {
    throw new Error(
      "Jersey number must be between 0 and 999.",
    );
  }

  const { error } = await supabase
    .from("players")
    .insert({
      team_id: teamId,
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyNumber,
      position,
      active: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/teams/${teamId}`);
  revalidatePath("/dashboard/teams");
}

export async function setTeamJoinable(
  teamId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();

  const { teamRole } = await getTeamAccess(
    supabase,
    user.id,
    teamId,
  );

  if (teamRole !== "manager") {
    throw new Error(
      "Only the team manager can change the team join setting.",
    );
  }

  const enabled =
    String(formData.get("enabled") || "") === "true";

  const { error } = await supabase.rpc(
    "set_team_joinable",
    {
      p_team_id: teamId,
      p_enabled: enabled,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/teams/${teamId}`);
  revalidatePath("/dashboard/teams/find");
  revalidatePath("/dashboard/teams");
}

export async function requestTeamAccess(teamId: string) {
  const { supabase, user } = await requireUser();

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, organization_id")
    .eq("id", teamId)
    .single();

  if (teamError || !team) {
    throw new Error("Team not found.");
  }

  const { data: existingMembership, error: membershipError } =
    await supabase
      .from("team_memberships")
      .select("id, role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (existingMembership) {
    throw new Error(
      `You already have ${existingMembership.role} access to this team.`,
    );
  }

  const {
    data: pendingRequest,
    error: requestCheckError,
  } = await supabase
    .from("team_access_requests")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (requestCheckError) {
    throw new Error(requestCheckError.message);
  }

  if (pendingRequest) {
    throw new Error(
      "Your access request is already pending.",
    );
  }

  const { error } = await supabase
    .from("team_access_requests")
    .insert({
      team_id: teamId,
      user_id: user.id,
      status: "pending",
    });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/teams/${teamId}`);
  revalidatePath("/dashboard/teams");
}

export async function leaveTeam(teamId: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("leave_team", {
    p_team_id: teamId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/teams/${teamId}`);
  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");

  redirect("/dashboard/teams");
}

export async function deleteTeam(teamId: string) {
  const { supabase, membership } =
    await requireMembership();

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, organization_id")
    .eq("id", teamId)
    .eq("organization_id", membership.organization_id)
    .single();

  if (teamError || !team) {
    throw new Error("Team not found.");
  }

  const { error } = await supabase.rpc("delete_team", {
    p_team_id: teamId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");

  redirect("/dashboard/teams");
}
