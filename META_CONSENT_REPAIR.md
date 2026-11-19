# Meta-only explicit opt-in repair (not deployed)

Replaces legacy browser PageView/noscript blocks on 21 pages, gates static-site Meta CAPI, and adds consent handling to generated product pages. Does not alter Shopify native pixel/CAPI, purchases, PostHog or Shopify click attribution. The UI explicitly says this is a Meta-only choice, not a universal privacy control.

Default is no Meta script or event. Equal Allow/Reject choices; persistent reopening control; GPC/DNT override stored permission. Revocation is sent to the loaded Meta SDK. An origin-local preference is not copied to Shopify. Local-storage failure falls back to page-lifetime choice. No automatic consent from scrolling or dismissal.

Only BSFL detail has a verified catalog mapping. Since it displays multiple sizes, ViewContent uses content_type product_group, ID 8975496478860. No guessed mappings for other products. No AddToCart or Purchase events. Browser/server pairs share one event ID. Query strings are not passed to CAPI. Native Meta SDK behavior remains Meta-controlled after opt-in.

Verification: build and all 30 Node tests pass; diff whitespace check clean. Includes no-consent, reject, allow, repeated click/init, GPC/DNT override, revocation, cross-tab rejection, mapping, removal of legacy bypass, server refusal and matching event ID tests. Actual rendered/mobile UI test could not run: Chromium fails socket() Operation not permitted, including reviewed escalation. Live Meta receipt/dedup verification not run. No fake purchase or live test event submitted. No legal-compliance claim.

Before release: review rendered desktop/mobile UI, inspect network for preconsent requests and revocation, review this patch against current main, run Meta Test Events with test-only configuration. Only then deploy and verify production bundle. Official engineering references: https://shopify.dev/docs/api/customer-privacy and https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/serverside/custom_data.py .
