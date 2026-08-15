-- Remove debug_table_policies.
--
-- It existed to settle one argument: an insert was being refused while the
-- policy it appeared to be failing was demonstrably satisfied, and four
-- attempts to reason it out from the migration files were wrong. Reading the
-- policies the database was actually enforcing found the cause in one pass —
-- an upsert being judged against the UPDATE policy as well as the INSERT one.
--
-- That is answered, and this is not something to leave in a product. It hands
-- any signed-in user the exact predicates guarding every table, which is a map
-- of what to try. Nothing an attacker could not infer by probing, but there is
-- no reason to publish it, and no feature depends on it.
--
-- If this is ever needed again, it is four lines over pg_policies — better
-- re-added deliberately for an hour than left standing for years.

drop function if exists public.debug_table_policies(text);
