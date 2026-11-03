---
canonical_url: "https://docs.composio.dev/toolkits/managed-auth"
markdown_url: "https://docs.composio.dev/toolkits/managed-auth.md"
product: "platform"
version: null
last_updated: null
---

# Managed OAuth apps

Composio can provide the OAuth app that your users authorize when they connect a toolkit. You do not need to register an OAuth app or supply its client ID and client secret.

This catalog identifies who provides the OAuth app, not which execution framework you must use. For per-user OAuth with application-owned tools, follow [Managed authentication for your own tools](/docs/authentication/managed-auth-for-custom-tools.md). Call provider endpoints through the authenticated proxy without predefined tools, MCP, or an LLM.

This list covers only toolkits that support OAuth. It does not include toolkits that use only API keys, bearer tokens, Basic auth, or no authentication.

Call the toolkit endpoint and read `composio_managed_auth_schemes`:

```bash
curl 'https://backend.composio.dev/api/v3.1/toolkits/gmail' \
  -H 'x-api-key: YOUR_API_KEY'
```

If `composio_managed_auth_schemes` contains the toolkit's OAuth method, Composio provides the OAuth app. If the field does not contain that method, register your own OAuth app and supply its client ID and client secret.

Some toolkits support more than one authentication method. A toolkit appears under **Composio-managed OAuth available** when Composio manages at least one OAuth method. Open the toolkit page to check each method.

See [Managed vs custom auth](/docs/authentication/custom-app-vs-managed-app.md) for setup steps and trade-offs.

## Composio-managed OAuth available (125)

| Toolkit | Slug |
|---------|------|
| [Aircall](/toolkits/aircall.md) | `AIRCALL` |
| [Airtable](/toolkits/airtable.md) | `AIRTABLE` |
| [Apaleo](/toolkits/apaleo.md) | `APALEO` |
| [Asana](/toolkits/asana.md) | `ASANA` |
| [Attio](/toolkits/attio.md) | `ATTIO` |
| [Basecamp](/toolkits/basecamp.md) | `BASECAMP` |
| [Bitbucket](/toolkits/bitbucket.md) | `BITBUCKET` |
| [Blackbaud](/toolkits/blackbaud.md) | `BLACKBAUD` |
| [Boldsign](/toolkits/boldsign.md) | `BOLDSIGN` |
| [Box](/toolkits/box.md) | `BOX` |
| [Cal](/toolkits/cal.md) | `CAL` |
| [Calendly](/toolkits/calendly.md) | `CALENDLY` |
| [Canva](/toolkits/canva.md) | `CANVA` |
| [Capsule CRM](/toolkits/capsule_crm.md) | `CAPSULE_CRM` |
| [ClickUp](/toolkits/clickup.md) | `CLICKUP` |
| [Confluence](/toolkits/confluence.md) | `CONFLUENCE` |
| [Contentful](/toolkits/contentful.md) | `CONTENTFUL` |
| [Crowdin](/toolkits/crowdin.md) | `CROWDIN` |
| [Dart](/toolkits/dart.md) | `DART` |
| [Daytona](/toolkits/daytona.md) | `DAYTONA` |
| [Dialpad](/toolkits/dialpad.md) | `DIALPAD` |
| [Discord](/toolkits/discord.md) | `DISCORD` |
| [Discord Bot](/toolkits/discordbot.md) | `DISCORDBOT` |
| [Dropbox](/toolkits/dropbox.md) | `DROPBOX` |
| [Dub](/toolkits/dub.md) | `DUB` |
| [Dynamics 365](/toolkits/dynamics365.md) | `DYNAMICS365` |
| [Eventbrite](/toolkits/eventbrite.md) | `EVENTBRITE` |
| [Excel](/toolkits/excel.md) | `EXCEL` |
| [Exist](/toolkits/exist.md) | `EXIST` |
| [Facebook](/toolkits/facebook.md) | `FACEBOOK` |
| [Fathom](/toolkits/fathom.md) | `FATHOM` |
| [Figma](/toolkits/figma.md) | `FIGMA` |
| [Freeagent](/toolkits/freeagent.md) | `FREEAGENT` |
| [FreshBooks](/toolkits/freshbooks.md) | `FRESHBOOKS` |
| [GitHub](/toolkits/github.md) | `GITHUB` |
| [GitLab](/toolkits/gitlab.md) | `GITLAB` |
| [Gmail](/toolkits/gmail.md) | `GMAIL` |
| [Gong](/toolkits/gong.md) | `GONG` |
| [Google Ads](/toolkits/googleads.md) | `GOOGLEADS` |
| [Google Analytics](/toolkits/google_analytics.md) | `GOOGLE_ANALYTICS` |
| [Google BigQuery](/toolkits/googlebigquery.md) | `GOOGLEBIGQUERY` |
| [Google Calendar](/toolkits/googlecalendar.md) | `GOOGLECALENDAR` |
| [Google Classroom](/toolkits/google_classroom.md) | `GOOGLE_CLASSROOM` |
| [Google Docs](/toolkits/googledocs.md) | `GOOGLEDOCS` |
| [Google Drive](/toolkits/googledrive.md) | `GOOGLEDRIVE` |
| [Google Maps](/toolkits/google_maps.md) | `GOOGLE_MAPS` |
| [Google Meet](/toolkits/googlemeet.md) | `GOOGLEMEET` |
| [Google Photos](/toolkits/googlephotos.md) | `GOOGLEPHOTOS` |
| [Google Search Console](/toolkits/google_search_console.md) | `GOOGLE_SEARCH_CONSOLE` |
| [Google Sheets](/toolkits/googlesheets.md) | `GOOGLESHEETS` |
| [Google Slides](/toolkits/googleslides.md) | `GOOGLESLIDES` |
| [Google Super](/toolkits/googlesuper.md) | `GOOGLESUPER` |
| [Google Tasks](/toolkits/googletasks.md) | `GOOGLETASKS` |
| [Gorgias](/toolkits/gorgias.md) | `GORGIAS` |
| [Greenhouse](/toolkits/greenhouse.md) | `GREENHOUSE` |
| [Gumroad](/toolkits/gumroad.md) | `GUMROAD` |
| [Harvest](/toolkits/harvest.md) | `HARVEST` |
| [HubSpot](/toolkits/hubspot.md) | `HUBSPOT` |
| [Hugging Face](/toolkits/hugging_face.md) | `HUGGING_FACE` |
| [Instagram](/toolkits/instagram.md) | `INSTAGRAM` |
| [Intercom](/toolkits/intercom.md) | `INTERCOM` |
| [Jira](/toolkits/jira.md) | `JIRA` |
| [Kit](/toolkits/kit.md) | `KIT` |
| [Linear](/toolkits/linear.md) | `LINEAR` |
| [LinkedIn](/toolkits/linkedin.md) | `LINKEDIN` |
| [Linkhut](/toolkits/linkhut.md) | `LINKHUT` |
| [Mailchimp](/toolkits/mailchimp.md) | `MAILCHIMP` |
| [Microsoft OneNote](/toolkits/onenote.md) | `ONENOTE` |
| [Microsoft Teams](/toolkits/microsoft_teams.md) | `MICROSOFT_TEAMS` |
| [Miro](/toolkits/miro.md) | `MIRO` |
| [Monday](/toolkits/monday.md) | `MONDAY` |
| [Moneybird](/toolkits/moneybird.md) | `MONEYBIRD` |
| [Mural](/toolkits/mural.md) | `MURAL` |
| [NotebookLM](/toolkits/notebook_lm.md) | `NOTEBOOK_LM` |
| [Notion](/toolkits/notion.md) | `NOTION` |
| [Omnisend](/toolkits/omnisend.md) | `OMNISEND` |
| [OneDrive](/toolkits/one_drive.md) | `ONE_DRIVE` |
| [Outlook](/toolkits/outlook.md) | `OUTLOOK` |
| [PagerDuty](/toolkits/pagerduty.md) | `PAGERDUTY` |
| [Pinterest](/toolkits/pinterest.md) | `PINTEREST` |
| [Pinterest Ads](/toolkits/pinterest_ads.md) | `PINTEREST_ADS` |
| [Prisma](/toolkits/prisma.md) | `PRISMA` |
| [Productboard](/toolkits/productboard.md) | `PRODUCTBOARD` |
| [Pushbullet](/toolkits/pushbullet.md) | `PUSHBULLET` |
| [QuickBooks](/toolkits/quickbooks.md) | `QUICKBOOKS` |
| [Reddit](/toolkits/reddit.md) | `REDDIT` |
| [Reddit Ads](/toolkits/reddit_ads.md) | `REDDIT_ADS` |
| [Roam](/toolkits/roam.md) | `ROAM` |
| [Salesforce](/toolkits/salesforce.md) | `SALESFORCE` |
| [Sentry](/toolkits/sentry.md) | `SENTRY` |
| [Servicem8](/toolkits/servicem8.md) | `SERVICEM8` |
| [SharePoint](/toolkits/share_point.md) | `SHARE_POINT` |
| [Shippo](/toolkits/shippo.md) | `SHIPPO` |
| [Slack](/toolkits/slack.md) | `SLACK` |
| [Slackbot](/toolkits/slackbot.md) | `SLACKBOT` |
| [Splitwise](/toolkits/splitwise.md) | `SPLITWISE` |
| [Square](/toolkits/square.md) | `SQUARE` |
| [Stack Exchange](/toolkits/stack_exchange.md) | `STACK_EXCHANGE` |
| [Stripe](/toolkits/stripe.md) | `STRIPE` |
| [Supabase](/toolkits/supabase.md) | `SUPABASE` |
| [Ticketmaster](/toolkits/ticketmaster.md) | `TICKETMASTER` |
| [Ticktick](/toolkits/ticktick.md) | `TICKTICK` |
| [TikTok Ads](/toolkits/tiktok_ads.md) | `TIKTOK_ADS` |
| [Timely](/toolkits/timely.md) | `TIMELY` |
| [Todoist](/toolkits/todoist.md) | `TODOIST` |
| [Trello](/toolkits/trello.md) | `TRELLO` |
| [Twitch](/toolkits/twitch.md) | `TWITCH` |
| [Typeform](/toolkits/typeform.md) | `TYPEFORM` |
| [WakaTime](/toolkits/wakatime.md) | `WAKATIME` |
| [Webex](/toolkits/webex.md) | `WEBEX` |
| [WhatsApp](/toolkits/whatsapp.md) | `WHATSAPP` |
| [Wrike](/toolkits/wrike.md) | `WRIKE` |
| [Yandex](/toolkits/yandex.md) | `YANDEX` |
| [YNAB](/toolkits/ynab.md) | `YNAB` |
| [YouTube](/toolkits/youtube.md) | `YOUTUBE` |
| [Zendesk](/toolkits/zendesk.md) | `ZENDESK` |
| [Zeplin](/toolkits/zeplin.md) | `ZEPLIN` |
| [Zoho](/toolkits/zoho.md) | `ZOHO` |
| [Zoho Bigin](/toolkits/zoho_bigin.md) | `ZOHO_BIGIN` |
| [Zoho Books](/toolkits/zoho_books.md) | `ZOHO_BOOKS` |
| [Zoho Desk](/toolkits/zoho_desk.md) | `ZOHO_DESK` |
| [Zoho Inventory](/toolkits/zoho_inventory.md) | `ZOHO_INVENTORY` |
| [Zoho Invoice](/toolkits/zoho_invoice.md) | `ZOHO_INVOICE` |
| [Zoho Mail](/toolkits/zoho_mail.md) | `ZOHO_MAIL` |
| [Zoom](/toolkits/zoom.md) | `ZOOM` |

## Bring your own OAuth app (262)

| Toolkit | Slug |
|---------|------|
| [Adobe Marketing Agent MCP](/toolkits/adobe_marketing_agent_mcp.md) | `ADOBE_MARKETING_AGENT_MCP` |
| [AdRoll](/toolkits/adroll.md) | `ADROLL` |
| [Aha!](/toolkits/aha.md) | `AHA` |
| [Ahrefs](/toolkits/ahrefs.md) | `AHREFS` |
| [Ahrefs MCP](/toolkits/ahrefs_mcp.md) | `AHREFS_MCP` |
| [AirOps MCP](/toolkits/airops_mcp.md) | `AIROPS_MCP` |
| [Alpaca](/toolkits/alpaca.md) | `ALPACA` |
| [Amplitude MCP](/toolkits/amplitude_mcp.md) | `AMPLITUDE_MCP` |
| [Apify MCP](/toolkits/apify_mcp.md) | `APIFY_MCP` |
| [Atlassian MCP](/toolkits/atlassian_mcp.md) | `ATLASSIAN_MCP` |
| [Audioscrape MCP](/toolkits/audioscrape_mcp.md) | `AUDIOSCRAPE_MCP` |
| [AWeber](/toolkits/aweber.md) | `AWEBER` |
| [Azure Monitor Activity Log](/toolkits/azure_monitor_activity_log.md) | `AZURE_MONITOR_ACTIVITY_LOG` |
| [BambooHR](/toolkits/bamboohr.md) | `BAMBOOHR` |
| [Beeminder](/toolkits/beeminder.md) | `BEEMINDER` |
| [Better Stack MCP](/toolkits/better_stack_mcp.md) | `BETTER_STACK_MCP` |
| [bexio](/toolkits/bexio.md) | `BEXIO` |
| [Bitly](/toolkits/bitly.md) | `BITLY` |
| [Bitwarden](/toolkits/bitwarden.md) | `BITWARDEN` |
| [Blackboard](/toolkits/blackboard.md) | `BLACKBOARD` |
| [Borneo](/toolkits/borneo.md) | `BORNEO` |
| [Box MCP](/toolkits/box_mcp.md) | `BOX_MCP` |
| [Brevo](/toolkits/brevo.md) | `BREVO` |
| [Brex](/toolkits/brex.md) | `BREX` |
| [Buffer](/toolkits/buffer.md) | `BUFFER` |
| [Calendly MCP](/toolkits/calendly_mcp.md) | `CALENDLY_MCP` |
| [Candid MCP](/toolkits/candid_mcp.md) | `CANDID_MCP` |
| [Canva MCP](/toolkits/canva_mcp.md) | `CANVA_MCP` |
| [Canvas](/toolkits/canvas.md) | `CANVAS` |
| [Carbon Voice MCP](/toolkits/carbon_voice_mcp.md) | `CARBON_VOICE_MCP` |
| [Cashfree MCP](/toolkits/cashfree_payments_mcp.md) | `CASHFREE_PAYMENTS_MCP` |
| [Circleback MCP](/toolkits/circleback_mcp.md) | `CIRCLEBACK_MCP` |
| [Clarify MCP](/toolkits/clarify_mcp.md) | `CLARIFY_MCP` |
| [Clay MCP](/toolkits/clay_mcp.md) | `CLAY_MCP` |
| [CleverReach](/toolkits/cleverreach.md) | `CLEVERREACH` |
| [ClickFunnels 2.0](/toolkits/clickfunnels.md) | `CLICKFUNNELS` |
| [ClickHouse MCP](/toolkits/clickhouse_mcp.md) | `CLICKHOUSE_MCP` |
| [ClickUp MCP](/toolkits/clickup_mcp.md) | `CLICKUP_MCP` |
| [Clio Manage](/toolkits/clio_manage.md) | `CLIO_MANAGE` |
| [Clockify](/toolkits/clockify.md) | `CLOCKIFY` |
| [Close MCP](/toolkits/close_mcp.md) | `CLOSE_MCP` |
| [Cloudflare MCP](/toolkits/cloudflare_mcp.md) | `CLOUDFLARE_MCP` |
| [Clover](/toolkits/clover.md) | `CLOVER` |
| [Clueso MCP](/toolkits/clueso_mcp.md) | `CLUESO_MCP` |
| [Coinbase Agents MCP](/toolkits/coinbase_agents_mcp.md) | `COINBASE_AGENTS_MCP` |
| [Coinbase Wallet MCP](/toolkits/coinbase_wallet_mcp.md) | `COINBASE_WALLET_MCP` |
| [Commerce Layer](/toolkits/commerce_layer.md) | `COMMERCE_LAYER` |
| [Common Room MCP](/toolkits/common_room_mcp.md) | `COMMON_ROOM_MCP` |
| [Consensus MCP](/toolkits/consensus_mcp.md) | `CONSENSUS_MCP` |
| [Constant Contact](/toolkits/constant_contact.md) | `CONSTANT_CONTACT` |
| [Contacts+](/toolkits/contacts_plus.md) | `CONTACTS_PLUS` |
| [Contentsquare MCP](/toolkits/contentsquare_mcp.md) | `CONTENTSQUARE_MCP` |
| [Coupa](/toolkits/coupa.md) | `COUPA` |
| [Cradl AI](/toolkits/cradl_ai.md) | `CRADL_AI` |
| [Craft MCP](/toolkits/craft_mcp.md) | `CRAFT_MCP` |
| [Customer.io MCP](/toolkits/customerio_mcp.md) | `CUSTOMERIO_MCP` |
| [D2L Brightspace](/toolkits/d2lbrightspace.md) | `D2LBRIGHTSPACE` |
| [Databricks](/toolkits/databricks.md) | `DATABRICKS` |
| [Datadog](/toolkits/datadog.md) | `DATADOG` |
| [Datadog MCP](/toolkits/datadog_mcp.md) | `DATADOG_MCP` |
| [dbt Cloud](/toolkits/dbt_cloud.md) | `DBT_CLOUD` |
| [Deel](/toolkits/deel.md) | `DEEL` |
| [DeepL MCP](/toolkits/deepl_mcp.md) | `DEEPL_MCP` |
| [Deputy](/toolkits/deputy.md) | `DEPUTY` |
| [Descript MCP](/toolkits/descript_mcp.md) | `DESCRIPT_MCP` |
| [DevCycle](/toolkits/dev_cycle.md) | `DEV_CYCLE` |
| [DigitalOcean](/toolkits/digital_ocean.md) | `DIGITAL_OCEAN` |
| [Disqus](/toolkits/disqus.md) | `DISQUS` |
| [DocuSign](/toolkits/docusign.md) | `DOCUSIGN` |
| [Dribbble](/toolkits/dribbble.md) | `DRIBBBLE` |
| [Dropbox Sign](/toolkits/dropbox_sign.md) | `DROPBOX_SIGN` |
| [Dynatrace](/toolkits/dynatrace.md) | `DYNATRACE` |
| [eBay](/toolkits/ebay.md) | `EBAY` |
| [Egnyte](/toolkits/egnyte.md) | `EGNYTE` |
| [Epic Games](/toolkits/epic_games.md) | `EPIC_GAMES` |
| [Era Context MCP](/toolkits/era_context_mcp.md) | `ERA_CONTEXT_MCP` |
| [Eraser MCP](/toolkits/eraser_mcp.md) | `ERASER_MCP` |
| [Fellow.ai MCP](/toolkits/fellow_ai_mcp.md) | `FELLOW_AI_MCP` |
| [Financial Datasets AI MCP](/toolkits/financial_datasets_ai_mcp.md) | `FINANCIAL_DATASETS_AI_MCP` |
| [Follow Up Boss](/toolkits/follow_up_boss.md) | `FOLLOW_UP_BOSS` |
| [freee](/toolkits/freee.md) | `FREEE` |
| [Freshsales](/toolkits/freshsales.md) | `FRESHSALES` |
| [Front](/toolkits/front.md) | `FRONT` |
| [FuseAI MCP](/toolkits/fuseai_mcp.md) | `FUSEAI_MCP` |
| [Gagelist](/toolkits/gagelist.md) | `GAGELIST` |
| [GetResponse](/toolkits/getresponse.md) | `GETRESPONSE` |
| [Glen MCP](/toolkits/glen_mcp.md) | `GLEN_MCP` |
| [Glide MCP](/toolkits/glide_mcp.md) | `GLIDE_MCP` |
| [GoCardless MCP](/toolkits/gocardless_mcp.md) | `GOCARDLESS_MCP` |
| [Google Admin](/toolkits/google_admin.md) | `GOOGLE_ADMIN` |
| [Google AdSense](/toolkits/google_adsense.md) | `GOOGLE_ADSENSE` |
| [Google Chat](/toolkits/google_chat.md) | `GOOGLE_CHAT` |
| [Google Data Studio](/toolkits/google_data_studio.md) | `GOOGLE_DATA_STUDIO` |
| [Google Merchant Center](/toolkits/google_merchant.md) | `GOOGLE_MERCHANT` |
| [Googlecontacts](/toolkits/googlecontacts.md) | `GOOGLECONTACTS` |
| [Googleforms](/toolkits/googleforms.md) | `GOOGLEFORMS` |
| [GoTo Training](/toolkits/go_to_training.md) | `GO_TO_TRAINING` |
| [Grafana Cloud MCP](/toolkits/grafana_cloud_mcp.md) | `GRAFANA_CLOUD_MCP` |
| [Granola MCP](/toolkits/granola_mcp.md) | `GRANOLA_MCP` |
| [Greptile MCP](/toolkits/greptile_mcp.md) | `GREPTILE_MCP` |
| [Gusto](/toolkits/gusto.md) | `GUSTO` |
| [HaloPSA](/toolkits/halopsa.md) | `HALOPSA` |
| [Help Scout](/toolkits/help_scout.md) | `HELP_SCOUT` |
| [Higgsfield MCP](/toolkits/higgsfield_mcp.md) | `HIGGSFIELD_MCP` |
| [HighLevel Agency](/toolkits/highlevel_agency.md) | `HIGHLEVEL_AGENCY` |
| [HighLevel Location](/toolkits/highlevel_location.md) | `HIGHLEVEL_LOCATION` |
| [Honeycomb MCP](/toolkits/honeycomb_mcp.md) | `HONEYCOMB_MCP` |
| [Ignav Flights MCP](/toolkits/ignav_flights_mcp.md) | `IGNAV_FLIGHTS_MCP` |
| [Imply Polaris](/toolkits/imply_polaris.md) | `IMPLY_POLARIS` |
| [Infisical](/toolkits/infisical.md) | `INFISICAL` |
| [Jentic MCP](/toolkits/jentic_mcp.md) | `JENTIC_MCP` |
| [Jibble](/toolkits/jibble.md) | `JIBBLE` |
| [Jobber](/toolkits/jobber.md) | `JOBBER` |
| [Judge.me](/toolkits/judge_me.md) | `JUDGE_ME` |
| [Kernel MCP](/toolkits/kernel_mcp.md) | `KERNEL_MCP` |
| [Kick](/toolkits/kick.md) | `KICK` |
| [Kintone REST](/toolkits/kintone_rest.md) | `KINTONE_REST` |
| [Klaviyo](/toolkits/klaviyo.md) | `KLAVIYO` |
| [Kommo](/toolkits/kommo.md) | `KOMMO` |
| [LaunchDarkly](/toolkits/launch_darkly.md) | `LAUNCH_DARKLY` |
| [Legal Data Hunter MCP](/toolkits/legal_data_hunter_mcp.md) | `LEGAL_DATA_HUNTER_MCP` |
| [Lever](/toolkits/lever.md) | `LEVER` |
| [Lightspeed Retail X-Series](/toolkits/lightspeed.md) | `LIGHTSPEED` |
| [LILT MCP](/toolkits/lilt_mcp.md) | `LILT_MCP` |
| [Linear MCP](/toolkits/linear_mcp.md) | `LINEAR_MCP` |
| [Linkedin Ads](/toolkits/linkedin_ads.md) | `LINKEDIN_ADS` |
| [LiveChat](/toolkits/livechat.md) | `LIVECHAT` |
| [Lodgify](/toolkits/lodgify.md) | `LODGIFY` |
| [Longbridge MCP](/toolkits/longbridge_mcp.md) | `LONGBRIDGE_MCP` |
| [Lucid MCP](/toolkits/lucid_mcp.md) | `LUCID_MCP` |
| [Magic Patterns MCP](/toolkits/magic_patterns_mcp.md) | `MAGIC_PATTERNS_MCP` |
| [MailUp](/toolkits/mail_up.md) | `MAIL_UP` |
| [MarcoPolo MCP](/toolkits/marcopolo_mcp.md) | `MARCOPOLO_MCP` |
| [Matterport](/toolkits/matterport.md) | `MATTERPORT` |
| [Memelord MCP](/toolkits/memelord_mcp.md) | `MEMELORD_MCP` |
| [Mercury MCP](/toolkits/mercury_mcp.md) | `MERCURY_MCP` |
| [Meta Ads](/toolkits/metaads.md) | `METAADS` |
| [Microsoft Advertising](/toolkits/microsoft_advertising.md) | `MICROSOFT_ADVERTISING` |
| [Microsoft Bookings](/toolkits/microsoft_bookings.md) | `MICROSOFT_BOOKINGS` |
| [Microsoft Entra ID](/toolkits/microsoft_entra_id.md) | `MICROSOFT_ENTRA_ID` |
| [Microsoft Power Bi](/toolkits/microsoft_power_bi.md) | `MICROSOFT_POWER_BI` |
| [Microsoft PowerPoint](/toolkits/microsoft_powerpoint.md) | `MICROSOFT_POWERPOINT` |
| [Microsoft To Do](/toolkits/microsoft_todo.md) | `MICROSOFT_TODO` |
| [Microsoft Word](/toolkits/microsoft_word.md) | `MICROSOFT_WORD` |
| [Midpage MCP](/toolkits/midpage_mcp.md) | `MIDPAGE_MCP` |
| [Mintlify MCP](/toolkits/mintlify_mcp.md) | `MINTLIFY_MCP` |
| [Mobbin MCP](/toolkits/mobbin_mcp.md) | `MOBBIN_MCP` |
| [Modem MCP](/toolkits/modem_mcp.md) | `MODEM_MCP` |
| [Monday MCP](/toolkits/monday_mcp.md) | `MONDAY_MCP` |
| [Money Forward](/toolkits/money_forward.md) | `MONEY_FORWARD` |
| [MongoDB](/toolkits/mongodb.md) | `MONGODB` |
| [MongoDB MCP](/toolkits/mongodb_mcp.md) | `MONGODB_MCP` |
| [MotherDuck MCP](/toolkits/motherduck_mcp.md) | `MOTHERDUCK_MCP` |
| [Neo4J](/toolkits/neo4j.md) | `NEO4J` |
| [Neon](/toolkits/neon.md) | `NEON` |
| [Neon MCP](/toolkits/neon_mcp.md) | `NEON_MCP` |
| [Netlify MCP](/toolkits/netlify_mcp.md) | `NETLIFY_MCP` |
| [Netsuite](/toolkits/netsuite.md) | `NETSUITE` |
| [Notion MCP](/toolkits/notion_mcp.md) | `NOTION_MCP` |
| [Octagon MCP](/toolkits/octagon_mcp.md) | `OCTAGON_MCP` |
| [Otter.ai MCP](/toolkits/otter_ai_mcp.md) | `OTTER_AI_MCP` |
| [PandaDoc MCP](/toolkits/pandadoc_mcp.md) | `PANDADOC_MCP` |
| [Parallel Task MCP](/toolkits/parallel_task_mcp.md) | `PARALLEL_TASK_MCP` |
| [Parma](/toolkits/parma.md) | `PARMA` |
| [Particl MCP](/toolkits/particl_mcp.md) | `PARTICL_MCP` |
| [Paypal](/toolkits/paypal.md) | `PAYPAL` |
| [PayPal Zettle](/toolkits/zettle.md) | `ZETTLE` |
| [Peec AI MCP](/toolkits/peec_ai_mcp.md) | `PEEC_AI_MCP` |
| [Personio](/toolkits/personio.md) | `PERSONIO` |
| [Photon MCP](/toolkits/photon_mcp.md) | `PHOTON_MCP` |
| [Pinecone](/toolkits/pinecone.md) | `PINECONE` |
| [Pipedrive](/toolkits/pipedrive.md) | `PIPEDRIVE` |
| [Plaid MCP](/toolkits/plaid_mcp.md) | `PLAID_MCP` |
| [Plain MCP](/toolkits/plain_mcp.md) | `PLAIN_MCP` |
| [PlanetScale](/toolkits/planetscale.md) | `PLANETSCALE` |
| [Polar](/toolkits/polar.md) | `POLAR` |
| [PostHog MCP](/toolkits/posthog_mcp.md) | `POSTHOG_MCP` |
| [ProductNow MCP](/toolkits/productnow_mcp.md) | `PRODUCTNOW_MCP` |
| [Pylon MCP](/toolkits/pylon_mcp.md) | `PYLON_MCP` |
| [QuickNode MCP](/toolkits/quicknode_mcp.md) | `QUICKNODE_MCP` |
| [Quire](/toolkits/quire.md) | `QUIRE` |
| [Railway](/toolkits/railway.md) | `RAILWAY` |
| [Railway MCP](/toolkits/railway_mcp.md) | `RAILWAY_MCP` |
| [Ramp](/toolkits/ramp.md) | `RAMP` |
| [Ramp MCP](/toolkits/ramp_mcp.md) | `RAMP_MCP` |
| [Razorpay](/toolkits/razorpay.md) | `RAZORPAY` |
| [RD Station Marketing](/toolkits/rd_station_marketing.md) | `RD_STATION_MARKETING` |
| [Read AI MCP](/toolkits/read_ai_mcp.md) | `READ_AI_MCP` |
| [Rebrandly](/toolkits/rebrandly.md) | `REBRANDLY` |
| [Recraft MCP](/toolkits/recraft_mcp.md) | `RECRAFT_MCP` |
| [Recruitee](/toolkits/recruitee.md) | `RECRUITEE` |
| [Reloadly](/toolkits/reloadly.md) | `RELOADLY` |
| [Resend](/toolkits/resend.md) | `RESEND` |
| [Resend MCP](/toolkits/resend_mcp.md) | `RESEND_MCP` |
| [Rillet](/toolkits/rillet.md) | `RILLET` |
| [Salesforce Service Cloud](/toolkits/salesforce_service_cloud.md) | `SALESFORCE_SERVICE_CLOUD` |
| [Scheduleonce](/toolkits/scheduleonce.md) | `SCHEDULEONCE` |
| [Scorecard MCP](/toolkits/scorecard_mcp.md) | `SCORECARD_MCP` |
| [SearchAPI MCP](/toolkits/searchapi_mcp.md) | `SEARCHAPI_MCP` |
| [Semrush MCP](/toolkits/semrush_mcp.md) | `SEMRUSH_MCP` |
| [Sendloop](/toolkits/sendloop.md) | `SENDLOOP` |
| [SendPulse](/toolkits/send_pulse.md) | `SEND_PULSE` |
| [Sentry MCP](/toolkits/sentry_mcp.md) | `SENTRY_MCP` |
| [ServiceNow](/toolkits/servicenow.md) | `SERVICENOW` |
| [ServiceTitan](/toolkits/servicetitan.md) | `SERVICETITAN` |
| [SharePoint Graph](/toolkits/sharepoint_graph.md) | `SHAREPOINT_GRAPH` |
| [Shopify](/toolkits/shopify.md) | `SHOPIFY` |
| [Sideshow MCP](/toolkits/sideshow_mcp.md) | `SIDESHOW_MCP` |
| [SignNow](/toolkits/sign_now.md) | `SIGN_NOW` |
| [Simplescraper MCP](/toolkits/simplescraper_mcp.md) | `SIMPLESCRAPER_MCP` |
| [Smartsheet](/toolkits/smartsheet.md) | `SMARTSHEET` |
| [Snapchat](/toolkits/snapchat.md) | `SNAPCHAT` |
| [Snowflake](/toolkits/snowflake.md) | `SNOWFLAKE` |
| [Snyk](/toolkits/snyk.md) | `SNYK` |
| [SoundCloud](/toolkits/soundcloud.md) | `SOUNDCLOUD` |
| [Splice MCP](/toolkits/splice_mcp.md) | `SPLICE_MCP` |
| [Spotify](/toolkits/spotify.md) | `SPOTIFY` |
| [Statsig MCP](/toolkits/statsig_mcp.md) | `STATSIG_MCP` |
| [Storyblok](/toolkits/storyblok.md) | `STORYBLOK` |
| [Stripe MCP](/toolkits/stripe_mcp.md) | `STRIPE_MCP` |
| [Stytch MCP](/toolkits/stytch_mcp.md) | `STYTCH_MCP` |
| [Supabase MCP](/toolkits/supabase_mcp.md) | `SUPABASE_MCP` |
| [Supabase Read MCP](/toolkits/supabase_read_mcp.md) | `SUPABASE_READ_MCP` |
| [SurveyMonkey](/toolkits/survey_monkey.md) | `SURVEY_MONKEY` |
| [Synthesize Bio MCP](/toolkits/synthesize_bio_mcp.md) | `SYNTHESIZE_BIO_MCP` |
| [Tally](/toolkits/tally.md) | `TALLY` |
| [Tavily MCP](/toolkits/tavily_mcp.md) | `TAVILY_MCP` |
| [ThoughtSpot Spotter MCP](/toolkits/thoughtspot_spotter_mcp.md) | `THOUGHTSPOT_SPOTTER_MCP` |
| [Threads](/toolkits/threads.md) | `THREADS` |
| [Ticket Tailor MCP](/toolkits/ticket_tailor_mcp.md) | `TICKET_TAILOR_MCP` |
| [Tiktok](/toolkits/tiktok.md) | `TIKTOK` |
| [TinyFish MCP](/toolkits/tinyfish_mcp.md) | `TINYFISH_MCP` |
| [Todoist MCP](/toolkits/todoist_mcp.md) | `TODOIST_MCP` |
| [Toneden](/toolkits/toneden.md) | `TONEDEN` |
| [Trello MCP](/toolkits/trello_mcp.md) | `TRELLO_MCP` |
| [Twitter](/toolkits/twitter.md) | `TWITTER` |
| [Vantage MCP](/toolkits/vantage_mcp.md) | `VANTAGE_MCP` |
| [Vercel](/toolkits/vercel.md) | `VERCEL` |
| [Vercel MCP](/toolkits/vercel_mcp.md) | `VERCEL_MCP` |
| [Vibe](/toolkits/vibe.md) | `VIBE` |
| [Vibe Prospecting MCP](/toolkits/vibe_prospecting_mcp.md) | `VIBE_PROSPECTING_MCP` |
| [vidIQ MCP](/toolkits/vidiq_mcp.md) | `VIDIQ_MCP` |
| [Vimeo](/toolkits/vimeo.md) | `VIMEO` |
| [Webflow](/toolkits/webflow.md) | `WEBFLOW` |
| [Whop](/toolkits/whop.md) | `WHOP` |
| [WildApricot](/toolkits/wild_apricot.md) | `WILD_APRICOT` |
| [Wispr Flow MCP](/toolkits/wispr_flow_mcp.md) | `WISPR_FLOW_MCP` |
| [Wix](/toolkits/wix.md) | `WIX` |
| [Wix MCP](/toolkits/wix_mcp.md) | `WIX_MCP` |
| [WordPress.com](/toolkits/wordpress_com.md) | `WORDPRESS_COM` |
| [Workable](/toolkits/workable.md) | `WORKABLE` |
| [Workday](/toolkits/workday.md) | `WORKDAY` |
| [X MCP](/toolkits/x_mcp.md) | `X_MCP` |
| [Xero](/toolkits/xero.md) | `XERO` |
| [Zernio MCP](/toolkits/zernio_mcp.md) | `ZERNIO_MCP` |
| [Zoho Calendar](/toolkits/zoho_calendar.md) | `ZOHO_CALENDAR` |
| [Zoho Campaigns](/toolkits/zoho_campaigns.md) | `ZOHO_CAMPAIGNS` |
| [Zoho Recruit](/toolkits/zoho_recruit.md) | `ZOHO_RECRUIT` |
| [Zoho Sign](/toolkits/zoho_sign.md) | `ZOHO_SIGN` |
| [Zoho WorkDrive](/toolkits/zoho_work_drive.md) | `ZOHO_WORK_DRIVE` |
| [Zoom Team Chat](/toolkits/zoom_chat.md) | `ZOOM_CHAT` |
| [Zoominfo](/toolkits/zoominfo.md) | `ZOOMINFO` |