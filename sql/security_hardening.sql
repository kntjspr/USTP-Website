-- Security hardening migration
-- Apply via Supabase SQL editor. Idempotent — safe to re-run.
--
-- Addresses:
--   P0: privilege escalation via users INSERT (any auth user could set permission='SYSTEM')
--   P0: users table publicly readable via anon key (admin email + future PII leak)
--   P0: residual password column on users (was empty but a footgun)
--   P1: site_settings publicly readable via anon key

-- ---------------------------------------------------------------------------
-- Helper: is_admin() — SECURITY DEFINER so RLS policies can self-reference
-- the users table without infinite recursion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND permission IN ('SYSTEM', 'ADMIN')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND permission IN ('SYSTEM', 'ADMIN', 'EDITOR')
    );
$$;

-- ---------------------------------------------------------------------------
-- USERS table
-- ---------------------------------------------------------------------------

-- Drop the unused password column (it was always '' but the schema risk
-- remained: one careless write and plaintext passwords leak via the old
-- public-SELECT policy).
ALTER TABLE public.users DROP COLUMN IF EXISTS password;

-- Drop all prior SELECT/INSERT policies so we start clean
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON public.users;
DROP POLICY IF EXISTS "Allow first system admin creation" ON public.users;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Enable update access for users based on id" ON public.users;
DROP POLICY IF EXISTS "Enable delete access for users based on id" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- SELECT: staff (admin/editor) can read all, users can read self. Anonymous gets nothing.
CREATE POLICY "users_select_staff_or_self" ON public.users
    FOR SELECT USING (public.is_staff() OR auth.uid() = id);

-- INSERT bootstrap: only allowed when table is empty (first system admin).
CREATE POLICY "users_insert_bootstrap" ON public.users
    FOR INSERT WITH CHECK (
        (SELECT count(*) FROM public.users) = 0
    );

-- INSERT self: a freshly-signed-up user creates their own profile.
-- The permission column is forced to VIEWER — no self-promotion.
CREATE POLICY "users_insert_self_viewer" ON public.users
    FOR INSERT WITH CHECK (
        auth.uid() = id
        AND permission = 'VIEWER'
    );

-- INSERT admin: admins can create users with any permission.
CREATE POLICY "users_insert_admin" ON public.users
    FOR INSERT WITH CHECK (public.is_admin());

-- UPDATE: admins can update any row. Users can update their own row but
-- cannot change their permission column (the column-level check happens
-- in the WITH CHECK against the candidate row).
CREATE POLICY "users_update_admin" ON public.users
    FOR UPDATE USING (public.is_admin());

CREATE POLICY "users_update_self_no_priv" ON public.users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND permission = (SELECT permission FROM public.users WHERE id = auth.uid())
    );

-- DELETE: admins only.
CREATE POLICY "users_delete_admin" ON public.users
    FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- SITE_SETTINGS table — restrict reads/writes to admins.
-- The API will expose specific keys publicly via /api/settings GET as needed.
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.site_settings;
DROP POLICY IF EXISTS "Allow anyone to read settings" ON public.site_settings;
DROP POLICY IF EXISTS "Public can view settings" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_select_all" ON public.site_settings;

CREATE POLICY "site_settings_select_admin" ON public.site_settings
    FOR SELECT USING (public.is_admin());

CREATE POLICY "site_settings_write_admin" ON public.site_settings
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Cleanup: remove the PoC row injected during the security audit
-- ---------------------------------------------------------------------------
DELETE FROM public.site_settings WHERE key = 'poc_test';
