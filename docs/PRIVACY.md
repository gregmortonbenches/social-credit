<!--
  DRAFT — NOT LEGAL ADVICE, AND NOT YET REVIEWED BY A LAWYER.

  This was written from what the code actually collects (the schema in
  CLAUDE.md, the Edge Functions, and lib/notifications.ts), so the factual
  content should be accurate to the app as built. It is not a substitute for
  review by someone qualified, particularly before any public release.

  Every {{PLACEHOLDER}} below must be filled in before this is published. They
  are facts only you know — leaving them as-is would make the document false.
-->

# Privacy Policy

**Effective date:** {{EFFECTIVE_DATE}}
**Who is responsible for your data:** {{CONTROLLER_NAME}}, {{CONTROLLER_ADDRESS}}
**Contact:** {{CONTACT_EMAIL}}

Social Credit is an app for sharing household chores. This policy explains what
it stores about you, who can see it, and how to get rid of it.

## What we collect

**Because you gave it to us**

| Data | Why |
|---|---|
| Email address | Signing in, and password resets |
| Password | Signing in. Stored only as a hash by our authentication provider — we never see it |
| Username | Shown to the other members of your Collective |
| Confirmation that you are 16 or over | Legal requirement to operate the service |

**Because you used the app**

| Data | Why |
|---|---|
| Which Collective you belong to, and your status in it | Running the app at all |
| Your Collective's timezone | Deciding when tasks are due and when the week resets |
| Tasks assigned to you, and when you completed them | The core function of the app |
| Your ranked task preferences | Deciding which tasks you are assigned |
| Your credit history — every gain and loss, with the reason | Scoreboards, and so the numbers can be audited |
| Denouncements you make or receive, including the written explanation and how members voted | The denouncement feature |
| Achievements you have unlocked | Showing them to you |
| A push notification token for your device | Sending you notifications. Only if you allow notifications |

## What we deliberately do not collect

- **Your date of birth.** The sign-up form asks for it to check you are 16 or
  over. The date is checked on your device and then discarded — only the fact
  that the check passed, and when, is stored.
- **Location, contacts, photos, or anything else from your device.**
- **Analytics or advertising data.** There is no analytics SDK, no advertising
  identifier, and no third-party tracking in this app. Nobody is profiling you
  and nothing is sold.

## Who can see it

**Other members of your Collective** can see your username, your credit total
and weekly standing, which tasks you were assigned and whether you completed
them, any denouncement involving you including its written explanation, and your
unlocked achievements. This is the point of the app, but it is worth being clear
that a denouncement is visible to your whole household, not just the two of you.

**Nobody outside your Collective** can see any of it. Members of other
Collectives cannot look you up or read your data.

**Our service providers:**

| Provider | What they handle |
|---|---|
| Supabase | Database, authentication and hosting. All of the above is stored here |
| Google Firebase Cloud Messaging | Delivering push notifications. Receives only your device token and the notification text |

We do not sell your data, and we do not share it with anyone else.

## How long we keep it

Your data is kept while your account exists. When you delete your account
(Settings → Delete Account):

- Your login, email address, push token, achievements and profile are **deleted
  outright**.
- Your task history and credit entries are **kept but disconnected from you** —
  they show as "Former Comrade". They are part of your household's shared
  record, and removing them would silently rewrite other people's history.
- The text of any denouncement involving you is **replaced with
  `[content removed]`**.

## Your rights

Under UK and EU data protection law you can ask for a copy of your data, ask us
to correct it, ask us to delete it, or object to how we use it.

Two of those are built into the app and need no request: **Settings → Download
My Data** exports everything held about you as a file, and **Settings → Delete
Account** carries out the deletion described above. For anything else, contact
{{CONTACT_EMAIL}}.

If you are unhappy with how we have handled your data you can complain to the
Information Commissioner's Office at ico.org.uk.

## Age

You must be 16 or over to use Social Credit. Sign-up will refuse a date of birth
that makes you younger.

## Changes

If this policy changes materially we will say so in the app before the change
takes effect.
