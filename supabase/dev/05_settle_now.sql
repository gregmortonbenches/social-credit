-- Runs the denouncement settlement immediately, instead of waiting for the
-- hourly cron. This is the real function the cron calls, with the same amounts
-- as constants/config.ts. It settles EVERY due denouncement in the collective,
-- not only the test ones.
--
-- Expect after 03_cases.sql:
--   case 1  auto_guilty / upheld   Natasha loses the task's credits, you gain 100
--   case 2  still open             waiting for you to respond
--   case 3  resolved               only once you AND Natasha have voted

select * from settle_denouncements(24, 24, 100, 50, 3, 150, 60);

select d.id, d.status, d.outcome, a.username as accuser, b.username as accused
from denouncements d
join profiles a on a.id = d.accuser_id
join profiles b on b.id = d.accused_id
where d.id::text like 'feed0000-%'
order by d.id;

select username, total_credits from profiles
where email = 'gregmorton03@gmail.com' or email like 'seed-%@seed.invalid'
order by username;
