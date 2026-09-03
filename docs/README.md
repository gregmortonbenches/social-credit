# docs

| File | Status |
|---|---|
| `PRIVACY.md` | **Draft — needs legal review and placeholder values.** Written from what the code actually collects |
| `AUTH_SETUP.md` | What must be configured before Google and Apple sign-in work |
| `TERMS.md` | **Draft — needs legal review and placeholder values.** Written to match how the app actually behaves |

Both files contain `{{PLACEHOLDER}}` markers that must be filled before they are
published — controller identity and address, a contact email, an effective date,
and a governing jurisdiction. Publishing with the placeholders in place would
make the documents inaccurate.

They also need somewhere to live. The sign-up screen links to
`CONFIG.PRIVACY_POLICY_URL` and `CONFIG.TERMS_URL` in `constants/config.ts`,
which are empty by default — while empty, the links render as plain text rather
than pretending to lead somewhere.
