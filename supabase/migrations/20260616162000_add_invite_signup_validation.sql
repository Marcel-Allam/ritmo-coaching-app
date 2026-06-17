-- Adds a read-only validation helper for invite-gated client signup.
-- This lets the app check an invite token before creating a Supabase auth user,
-- preventing random visitors from creating accounts with arbitrary emails.
--
-- This version avoids hard-coding a single invite-used column name because the live
-- client_invites table may use claimed_at, used_at, or accepted_at depending on schema state.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.validate_client_invite(p_token text)
returns table (
  valid boolean,
  client_id uuid,
  client_email text,
  client_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token_hash text;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return query
    select false, null::uuid, null::text, null::text;
    return;
  end if;

  -- Existing invite generation stores a hashed one-time token.
  -- Keep this aligned with generate_client_invite / claim_client_invite.
  v_token_hash := encode(
    extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256'),
    'hex'
  );

  return query
  select
    true as valid,
    c.id as client_id,
    c.email as client_email,
    c.full_name as client_name
  from public.client_invites ci
  join public.clients c on c.id = ci.client_id
  where ci.token_hash = v_token_hash
    and (
      coalesce(
        to_jsonb(ci) ->> 'claimed_at',
        to_jsonb(ci) ->> 'used_at',
        to_jsonb(ci) ->> 'accepted_at'
      ) is null
    )
    and (
      (to_jsonb(ci) ->> 'expires_at') is null
      or (to_jsonb(ci) ->> 'expires_at')::timestamptz > now()
    )
  limit 1;

  if not found then
    return query
    select false, null::uuid, null::text, null::text;
  end if;
end;
$$;

grant execute on function public.validate_client_invite(text) to anon, authenticated;
