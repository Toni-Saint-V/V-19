create sequence if not exists public.submission_public_number_seq
  as bigint
  minvalue 1
  maxvalue 9999
  start with 1001
  no cycle;

alter table public.submissions
  add column if not exists public_number bigint;

alter sequence public.submission_public_number_seq
  owned by public.submissions.public_number;

with candidates as (
  select
    submission.id,
    case
      when submission.id ~ '^(VF|ПД)-[0-9]+(-|$)'
        then regexp_replace(
          submission.id,
          '^(VF|ПД)-([0-9]+).*$','\2'
        )::bigint
      else null
    end as candidate
  from public.submissions submission
), ranked_candidates as (
  select
    candidate.id,
    candidate.candidate,
    row_number() over (
      partition by candidate.candidate
      order by submission.created_at, submission.id
    ) as duplicate_rank
  from candidates candidate
  join public.submissions submission on submission.id = candidate.id
)
update public.submissions submission
set public_number = candidate.candidate
from ranked_candidates candidate
where submission.id = candidate.id
  and candidate.candidate between 1 and 9999
  and candidate.duplicate_rank = 1
  and submission.public_number is null;

do $$
declare
  next_number bigint;
  submission_record record;
begin
  select greatest(1000, coalesce(max(public_number), 0))
  into next_number
  from public.submissions;

  for submission_record in
    select id
    from public.submissions
    where public_number is null
    order by created_at, id
  loop
    next_number := next_number + 1;
    if next_number > 9999 then
      raise exception 'VisaFlow public submission number capacity is exhausted';
    end if;

    update public.submissions
    set public_number = next_number
    where id = submission_record.id;
  end loop;

  perform setval(
    'public.submission_public_number_seq',
    greatest(1000, next_number),
    true
  );
end;
$$;

alter table public.submissions
  alter column public_number set not null;

alter table public.submissions
  add constraint submissions_public_number_range
  check (public_number between 1 and 9999);

create unique index submissions_public_number_uidx
  on public.submissions (public_number);

create or replace function app_private.assign_submission_public_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_number bigint;
begin
  if tg_op = 'UPDATE' then
    if new.public_number is distinct from old.public_number then
      raise exception 'Submission public number is immutable';
    end if;
    return new;
  end if;

  select submission.public_number
  into existing_number
  from public.submissions submission
  where submission.id = new.id;

  new.public_number := coalesce(
    existing_number,
    nextval('public.submission_public_number_seq')
  );
  return new;
end;
$$;

revoke all on function app_private.assign_submission_public_number() from public;

drop trigger if exists submissions_public_number_guard on public.submissions;
create trigger submissions_public_number_guard
before insert or update of public_number on public.submissions
for each row execute function app_private.assign_submission_public_number();
