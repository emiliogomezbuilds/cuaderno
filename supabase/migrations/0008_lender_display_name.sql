-- Persona test finding (PACKET.md Test 6, Doña Mari): the consent card's
-- top hesitation point was an unrecognizable lender identity — a raw,
-- numeric-looking email with a generic initial-letter icon, no way for a
-- low-trust user to tell "is this a real institution or a scam." A
-- display_name lets a lender show something recognizable instead.
alter table public.profiles add column if not exists display_name text;
