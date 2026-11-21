# GTM held drafts

`POST /api/v1/campaigns/:id/draft-leads` stores per-lead copy for a campaign. It uses the same API key as the rest of `/api/v1` and the `campaigns:write` scope.

`campaigns:write` does not send email. This route never starts a campaign and never calls the scheduler. Each accepted lead is stored with sequence status `held`. A signed-in person reviews those rows and approves them, which moves them to `pending`. Starting the campaign is still a separate action, and a campaign with zero leads cannot start.

Send JSON:

```json
{
  "allowActiveCampaign": false,
  "leads": [
    {
      "email": "ada@example.com",
      "firstName": "Ada",
      "company": "Example",
      "domain": "example.com",
      "city": "Delhi",
      "country": "India",
      "steps": [{ "subject": "Hiring", "body": "Hello {{first_name}}" }]
    }
  ]
}
```

Step copy is stored as `s1_subject`, `s1_body`, and so on, on the person and on the campaign lead. A second push of the same person updates that held row. Do Not Contact and suppressed addresses are rejected and are not enrolled. An actively sending campaign is rejected unless `allowActiveCampaign` is true, and even then the lead stays held.

Approve held rows from the campaign's lead list after you are signed in. The API does not approve them.
