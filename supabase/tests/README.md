# RLS isolation tests

Proves that project membership actually isolates tenants — that a user in one
production cannot read or write another production's data.

Run against the LOCAL stack only. It creates users and projects, so never
point it at production.

    supabase start
    node supabase/tests/rls_isolation.test.mjs

The suite is repeatable without a reset: each run uses freshly-generated
identities, because the assertions count rows and would otherwise accumulate
state between runs.

## Why this exists

Negative security assertions ("bob cannot read this") pass just as happily
when *everything* is denied as when the policy is correct. An early version of
this suite reported 9/20 passing against a database whose grants were missing
entirely — the passes were meaningless.

So the suite asserts in both directions: every "cannot" is paired with a
"can". If the positive assertions fail, the negative ones prove nothing.

It has also been mutation-tested. Replacing the purchases policy with
`using (true)` produces exactly four failures — read, insert, update and
delete — confirming the suite detects a real leak rather than merely passing.
