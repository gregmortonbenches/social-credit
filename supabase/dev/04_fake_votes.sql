-- Natasha votes UPHOLD on case 3 (Boris v Mao-Mao). Run it after you have cast
-- your own vote in the app. The jurors are you and Natasha, so once both have
-- voted the case can be settled: run 05_settle_now.sql.
-- Safe to run twice.

insert into denouncement_votes (denouncement_id, voter_id, vote)
values ('feed0000-0000-0000-0000-00000000ca03', 'feed0000-0000-0000-0000-000000000002', 'uphold')
on conflict (denouncement_id, voter_id) do nothing;

select v.vote, p.username as voter
from denouncement_votes v join profiles p on p.id = v.voter_id
where v.denouncement_id = 'feed0000-0000-0000-0000-00000000ca03';
