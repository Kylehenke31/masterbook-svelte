-- Add the touch_updated_at triggers that credit_cards and petty_cash should
-- have been created with.
--
-- Every other section table (budgets, calendars, call_sheets, creative,
-- insurance, personnel, schedules, vendors) has a BEFORE UPDATE trigger
-- calling public.touch_updated_at(). Without it, updated_at keeps its insert
-- default forever and silently misreports when a row last changed.
--
-- Nothing reads updated_at today — the sync layer tracks staleness with its
-- own in-memory version counters (sections.js) — but the column exists on
-- these tables precisely because it is expected to be maintained, and a
-- column that lies is worse than no column.

create trigger touch_credit_cards
  before update on public.credit_cards
  for each row execute function public.touch_updated_at();

create trigger touch_petty_cash
  before update on public.petty_cash
  for each row execute function public.touch_updated_at();
