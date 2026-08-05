--
-- PostgreSQL database dump
--

\restrict nF35IYL4ag98WemoT5RI8TrJhTekOrDR4FM0VVjiQ9cvnZS8gVqbCyBzresTIZW

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendars (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_sheets (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: creative; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creative (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dropbox_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dropbox_tokens (
    owner_id uuid NOT NULL,
    refresh_token text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: insurance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_name text DEFAULT ''::text NOT NULL,
    user_role text DEFAULT ''::text NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: personnel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personnel (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid NOT NULL,
    owner_id uuid NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    project_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (project_id);


--
-- Name: calendars calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendars
    ADD CONSTRAINT calendars_pkey PRIMARY KEY (project_id);


--
-- Name: call_sheets call_sheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sheets
    ADD CONSTRAINT call_sheets_pkey PRIMARY KEY (project_id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: creative creative_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative
    ADD CONSTRAINT creative_pkey PRIMARY KEY (project_id);


--
-- Name: dropbox_tokens dropbox_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dropbox_tokens
    ADD CONSTRAINT dropbox_tokens_pkey PRIMARY KEY (owner_id);


--
-- Name: insurance insurance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance
    ADD CONSTRAINT insurance_pkey PRIMARY KEY (project_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: personnel personnel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_pkey PRIMARY KEY (project_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (project_id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (project_id);


--
-- Name: messages_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_channel_created ON public.messages USING btree (channel_id, created_at);


--
-- Name: budgets touch_budgets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_budgets BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: calendars touch_calendars; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_calendars BEFORE UPDATE ON public.calendars FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: call_sheets touch_call_sheets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_call_sheets BEFORE UPDATE ON public.call_sheets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: creative touch_creative; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_creative BEFORE UPDATE ON public.creative FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: insurance touch_insurance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_insurance BEFORE UPDATE ON public.insurance FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: personnel touch_personnel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_personnel BEFORE UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: projects touch_projects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: schedules touch_schedules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_schedules BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: vendors touch_vendors; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER touch_vendors BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: budgets budgets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: calendars calendars_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendars
    ADD CONSTRAINT calendars_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: call_sheets call_sheets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sheets
    ADD CONSTRAINT call_sheets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: channels channels_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: creative creative_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative
    ADD CONSTRAINT creative_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: dropbox_tokens dropbox_tokens_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dropbox_tokens
    ADD CONSTRAINT dropbox_tokens_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: insurance insurance_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance
    ADD CONSTRAINT insurance_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: messages messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: messages messages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: personnel personnel_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchases purchases_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: schedules schedules_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: vendors vendors_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: dropbox_tokens Users can manage their own Dropbox token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own Dropbox token" ON public.dropbox_tokens USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));


--
-- Name: budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: call_sheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_sheets ENABLE ROW LEVEL SECURITY;

--
-- Name: channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: creative; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.creative ENABLE ROW LEVEL SECURITY;

--
-- Name: dropbox_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dropbox_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: insurance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: budgets owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.budgets USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = budgets.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: calendars owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.calendars USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = calendars.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: call_sheets owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.call_sheets USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = call_sheets.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: channels owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.channels USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = channels.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: creative owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.creative USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = creative.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: insurance owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.insurance USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = insurance.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: messages owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.messages USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = messages.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: personnel owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.personnel USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = personnel.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: schedules owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.schedules USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = schedules.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: vendors owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all ON public.vendors USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = vendors.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: personnel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects: owner access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "projects: owner access" ON public.projects USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));


--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases purchases: via project owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "purchases: via project owner" ON public.purchases USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = purchases.project_id) AND (projects.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = purchases.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict nF35IYL4ag98WemoT5RI8TrJhTekOrDR4FM0VVjiQ9cvnZS8gVqbCyBzresTIZW

