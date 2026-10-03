SET local check_function_bodies = off;

CREATE EXTENSION "hypopg" SCHEMA "extensions";

CREATE EXTENSION "index_advisor" SCHEMA "extensions";

CREATE TABLE "public"."team_memberships" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "team_id"    uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "team_memberships_pkey" PRIMARY KEY (id),
  CONSTRAINT "team_memberships_team_id_user_id_key" UNIQUE (team_id, user_id)
);

ALTER TABLE "public"."team_memberships"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."team_member_role" AS ENUM (
  'manager',
  'scorekeeper',
  'viewer'
);

ALTER TABLE "public"."team_memberships"
  ADD COLUMN "role" public.team_member_role NOT NULL DEFAULT 'viewer'::public.team_member_role;

CREATE OR REPLACE FUNCTION public.can_manage_team (
  p_team_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $function$
select exists (
 select 1
 from public.team_memberships tm
 where tm.team_id = p_team_id
 and tm.user_id = auth.uid()
 and tm.role in (
   'manager',
   'scorekeeper'
 )
);
$function$;

CREATE OR REPLACE FUNCTION public.create_team (
  p_organization_id uuid,
  p_name            text,
  p_short_name      text,
  p_city            text,
  p_color           text
)
  RETURNS public.teams
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  new_team public.teams;
begin

  if not public.is_org_member(
    p_organization_id,
    array['owner','admin','scorekeeper']::public.member_role[]
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.teams(
    organization_id,
    name,
    short_name,
    city,
    color
  )
  values(
    p_organization_id,
    p_name,
    p_short_name,
    p_city,
    p_color
  )
  returning * into new_team;


  insert into public.team_memberships(
    team_id,
    user_id,
    role
  )
  values(
    new_team.id,
    auth.uid(),
    'manager'
  )
  on conflict(team_id,user_id)
  do update set role='manager';


  return new_team;

end;
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member (
  org_id        uuid,
  allowed_roles public.member_role[] DEFAULT NULL::public.member_role[]
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and (
        allowed_roles is null
        or m.role = any(allowed_roles)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.undo_game_event (
  p_game_id          uuid,
  p_expected_version integer
)
  RETURNS public.games
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare g public.games%rowtype; target_event public.game_events%rowtype; previous_event public.game_events%rowtype; state jsonb; new_version integer;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'Game not found' using errcode='P0002'; end if;
  if not public.is_org_member(g.organization_id,array['owner','admin','scorekeeper']::public.member_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if g.version<>p_expected_version then raise exception 'Game was updated by another scorekeeper' using errcode='40001'; end if;
  if g.status='final' then raise exception 'Final games must be reopened before undo' using errcode='22000'; end if;
  select * into target_event from public.game_events where game_id=p_game_id and voided_at is null order by sequence desc limit 1;
  if not found then raise exception 'There is no play to undo' using errcode='22000'; end if;
  update public.game_events set voided_at=now(),voided_by=auth.uid() where id=target_event.id;
  select * into previous_event from public.game_events where game_id=p_game_id and voided_at is null order by sequence desc limit 1;
  new_version:=g.version+1;
  if found then state:=previous_event.state_after;
  else state:='{"status":"live","inning":1,"half":"top","outs":0,"balls":0,"strikes":0,"pitch_count":0,"current_batter_id":null,"home_score":0,"away_score":0,"bases":{"1":null,"2":null,"3":null}}'::jsonb;
  end if;
  update public.games set
    status=coalesce((state->>'status')::public.game_status,'live'),inning=coalesce((state->>'inning')::integer,1),half=coalesce((state->>'half')::public.inning_half,'top'),
    outs=coalesce((state->>'outs')::integer,0),balls=coalesce((state->>'balls')::integer,0),strikes=coalesce((state->>'strikes')::integer,0),pitch_count=coalesce((state->>'pitch_count')::integer,0),current_batter_id=nullif(state->>'current_batter_id','')::uuid,
    home_score=coalesce((state->>'home_score')::integer,0),away_score=coalesce((state->>'away_score')::integer,0),bases=coalesce(state->'bases','{"1":null,"2":null,"3":null}'::jsonb),current_batter_id=(state->>'current_batter_id')::uuid,version=new_version,updated_at=now()
  where id=p_game_id returning * into g;
  return g;
end $function$;

ALTER TABLE "public"."team_memberships"
  ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE "public"."team_memberships"
  ADD CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX team_memberships_team_idx ON public.team_memberships USING btree (team_id);

CREATE INDEX team_memberships_user_idx ON public.team_memberships USING btree (user_id);

CREATE POLICY "Team managers can manage members" ON "public"."team_memberships"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.team_memberships tm
  WHERE ((tm.team_id = team_memberships.team_id) AND (tm.user_id = auth.uid()) AND (tm.role = 'manager'::public.team_member_role)))));

CREATE POLICY "Users can see their team memberships" ON "public"."team_memberships"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = auth.uid()));

COMMENT ON EXTENSION "hypopg" IS 'Hypothetical indexes for PostgreSQL';

COMMENT ON EXTENSION "index_advisor" IS 'Query index advisor';

GRANT EXECUTE ON FUNCTION "public"."can_manage_team"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_team"(uuid, text, text, text, text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."organization_members" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."organization_members" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_memberships" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."team_member_role" TO "postgres";

